"""
Módulo de autenticación para Fluxion AI
Maneja login, verificación de tokens JWT y validación de usuarios
PostgreSQL only - DuckDB removido (Dic 2025)
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from db_manager import get_db_connection, get_db_connection_write

# =====================================================================================
# INICIALIZACIÓN DE TABLA USUARIOS (AUTO-CREATE SI NO EXISTE)
# =====================================================================================

def init_usuarios_table():
    """
    Crea la tabla usuarios si no existe.
    Se ejecuta automáticamente al importar el módulo.
    """
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    nombre_completo VARCHAR(100),
                    email VARCHAR(100),
                    activo BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ultimo_login TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo) WHERE activo = TRUE")
            conn.commit()
            cursor.close()
            print("✅ Tabla usuarios verificada/creada en PostgreSQL")
    except Exception as e:
        print(f"⚠️ Error inicializando tabla usuarios: {e}")

# Ejecutar inicialización al importar el módulo
init_usuarios_table()

# Configuración
SECRET_KEY = "fluxion-ai-secret-key-change-in-production-2024"  # Cambiar en producción
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 horas

# Contexto para hashear contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security scheme
security = HTTPBearer()

# =====================================================================================
# MODELOS PYDANTIC
# =====================================================================================

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    nombre_completo: Optional[str] = None
    rol_id: Optional[str] = None
    tiendas_asignadas: Optional[List[str]] = []

class Usuario(BaseModel):
    id: str
    username: str
    nombre_completo: Optional[str] = None
    email: Optional[str] = None
    activo: bool

class UsuarioConRol(Usuario):
    """Extended user model with role details"""
    rol_id: Optional[str] = "visualizador"
    rol_nombre: Optional[str] = None
    rol_nivel_acceso: Optional[int] = 1
    tiendas_asignadas: Optional[List[str]] = []

class CreateUserRequest(BaseModel):
    username: str
    password: str
    nombre_completo: Optional[str] = None
    email: Optional[str] = None
    rol_id: Optional[str] = "visualizador"
    tiendas_asignadas: Optional[List[str]] = []

# =====================================================================================
# FUNCIONES DE AUTENTICACIÓN
# =====================================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña coincide con su hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera hash de una contraseña"""
    return pwd_context.hash(password)

def authenticate_user(username: str, password: str) -> Optional[UsuarioConRol]:
    """Autentica un usuario verificando username y password"""
    try:
        with get_db_connection(read_only=True) as conn:
            cursor = conn.cursor()

            # Include rol_id in SELECT with JOIN to roles table
            cursor.execute("""
                SELECT u.id, u.username, u.password_hash, u.nombre_completo,
                       u.email, u.activo, u.rol_id, r.nombre, r.nivel_acceso
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id
                WHERE u.username = %s AND u.activo = true
            """, (username,))
            result = cursor.fetchone()

            if not result:
                cursor.close()
                return None

            user_id, username, password_hash, nombre_completo, email, activo, rol_id, rol_nombre, rol_nivel = result

            if not verify_password(password, password_hash):
                cursor.close()
                return None

            # Get assigned stores if gerente_tienda
            tiendas_asignadas = []
            if rol_id == 'gerente_tienda':
                cursor.execute("""
                    SELECT ubicacion_id
                    FROM usuarios_tiendas
                    WHERE usuario_id = %s AND activo = true
                """, (user_id,))
                tiendas_asignadas = [row[0] for row in cursor.fetchall()]

            cursor.close()

        # UPDATE con conexión read-write
        try:
            with get_db_connection_write() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE usuarios
                    SET ultimo_login = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (user_id,))
                conn.commit()
                cursor.close()
        except Exception as update_error:
            print(f"Warning: No se pudo actualizar ultimo_login: {update_error}")

        return UsuarioConRol(
            id=user_id,
            username=username,
            nombre_completo=nombre_completo,
            email=email,
            activo=activo,
            rol_id=rol_id,
            rol_nombre=rol_nombre,
            rol_nivel_acceso=rol_nivel or 1,
            tiendas_asignadas=tiendas_asignadas
        )
    except Exception as e:
        print(f"Error en authenticate_user: {e}")
        return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea un token JWT"""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UsuarioConRol:
    """Verifica un token JWT y retorna el usuario con rol"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")

        if username is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    try:
        with get_db_connection(read_only=True) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT u.id, u.username, u.nombre_completo, u.email, u.activo,
                       u.rol_id, r.nombre, r.nivel_acceso
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id
                WHERE u.username = %s AND u.activo = true
            """, (username,))
            row = cursor.fetchone()

            if not row:
                cursor.close()
                raise credentials_exception

            # Get assigned stores if gerente_tienda
            tiendas_asignadas = []
            if row[5] == 'gerente_tienda':  # rol_id
                cursor.execute("""
                    SELECT ubicacion_id
                    FROM usuarios_tiendas
                    WHERE usuario_id = %s AND activo = true
                """, (row[0],))  # user_id
                tiendas_asignadas = [r[0] for r in cursor.fetchall()]

            cursor.close()

            return UsuarioConRol(
                id=row[0],
                username=row[1],
                nombre_completo=row[2],
                email=row[3],
                activo=row[4],
                rol_id=row[5],
                rol_nombre=row[6],
                rol_nivel_acceso=row[7] or 1,
                tiendas_asignadas=tiendas_asignadas
            )
    except Exception as e:
        print(f"Error en verify_token: {e}")
        raise credentials_exception

def create_user(username: str, password: str, nombre_completo: Optional[str] = None, email: Optional[str] = None,
                rol_id: Optional[str] = "visualizador", tiendas_asignadas: Optional[List[str]] = None) -> Usuario:
    """Crea un nuevo usuario en la base de datos"""
    import uuid

    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM usuarios WHERE username = %s", (username,))
            existing = cursor.fetchone()[0]

            if existing > 0:
                cursor.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"El usuario '{username}' ya existe"
                )

            user_id = str(uuid.uuid4())
            password_hash = get_password_hash(password)

            cursor.execute("""
                INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo, rol_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (user_id, username, password_hash, nombre_completo, email, True, rol_id))

            # Si es gerente_tienda, insertar tiendas asignadas
            if rol_id == 'gerente_tienda' and tiendas_asignadas:
                for ubicacion_id in tiendas_asignadas:
                    cursor.execute("""
                        INSERT INTO usuarios_tiendas (usuario_id, ubicacion_id, activo)
                        VALUES (%s, %s, %s)
                    """, (user_id, ubicacion_id, True))

            conn.commit()
            cursor.close()

            return Usuario(
                id=user_id,
                username=username,
                nombre_completo=nombre_completo,
                email=email,
                activo=True
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error al crear usuario: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al crear usuario: {str(e)}"
        )

def auto_bootstrap_admin():
    """
    Auto-creates admin user if no users exist in the database
    Called automatically on startup
    """
    import uuid
    try:
        with get_db_connection(read_only=True) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM usuarios")
            count = cursor.fetchone()[0]
            cursor.close()

        if count == 0:
            with get_db_connection_write() as conn:
                user_id = str(uuid.uuid4())
                password_hash = get_password_hash("admin123")

                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo, rol_id, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (user_id, "admin", password_hash, "Administrador", "admin@fluxion.ai", True, "super_admin"))
                conn.commit()
                cursor.close()

                print("✅ Auto-bootstrap: Admin user created (username: admin, password: admin123)")
                return True
        else:
            print(f"✅ Database has {count} user(s) - skipping auto-bootstrap")
            return False
    except Exception as e:
        print(f"⚠️  Auto-bootstrap failed: {e}")
        return False

# =====================================================================================
# ROLE-BASED ACCESS CONTROL DEPENDENCIES
# =====================================================================================

def require_role(required_roles: List[str]):
    """
    Dependency to check if user has one of the required roles.

    Usage:
        @app.get("/admin/users", dependencies=[Depends(require_role(["super_admin"]))])
    """
    def role_checker(current_user: UsuarioConRol = Depends(verify_token)) -> UsuarioConRol:
        if current_user.rol_id not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere uno de estos roles: {', '.join(required_roles)}"
            )
        return current_user
    return role_checker


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UsuarioConRol:
    """Alias for verify_token - returns current authenticated user with role"""
    return verify_token(credentials)


def require_super_admin(current_user: UsuarioConRol = Depends(verify_token)) -> UsuarioConRol:
    """Require Super Admin role"""
    if current_user.rol_id != 'super_admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Se requiere rol Super Admin"
        )
    return current_user


def require_gerente_general_or_above(current_user: UsuarioConRol = Depends(verify_token)) -> UsuarioConRol:
    """Require Gerente General or Super Admin"""
    if current_user.rol_id not in ['gerente_general', 'super_admin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Se requiere rol Gerente General o superior"
        )
    return current_user


def require_gerente_or_above(current_user: UsuarioConRol = Depends(verify_token)) -> UsuarioConRol:
    """Require Gerente de Tienda, Gestor Abastecimiento, Gerente General, or Super Admin"""
    if current_user.rol_id not in ['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Se requiere rol Gerente o superior"
        )
    return current_user


def filter_ubicaciones_by_role(ubicaciones: List[str], current_user: UsuarioConRol) -> List[str]:
    """
    Filter ubicacion list based on user role.
    - gerente_tienda: Only assigned stores
    - Others: All stores

    Returns filtered list of ubicacion IDs.
    """
    if current_user.rol_id == 'gerente_tienda':
        # Only return stores assigned to this user
        if not current_user.tiendas_asignadas:
            return []  # No stores assigned
        return [u for u in ubicaciones if u in current_user.tiendas_asignadas]
    else:
        # gerente_general, gestor_abastecimiento, super_admin, visualizador: see all
        return ubicaciones


def get_ubicaciones_filter_clause(current_user: UsuarioConRol) -> tuple:
    """
    Returns SQL WHERE clause and params for filtering ubicaciones by role.

    Returns:
        (where_clause, params_tuple)

    Example:
        clause, params = get_ubicaciones_filter_clause(current_user)
        query = f"SELECT * FROM ventas WHERE 1=1 {clause}"
        cursor.execute(query, params)
    """
    if current_user.rol_id == 'gerente_tienda':
        if not current_user.tiendas_asignadas:
            # No stores assigned - return impossible condition
            return " AND 1=0", ()

        # IN clause for assigned stores
        placeholders = ','.join(['%s'] * len(current_user.tiendas_asignadas))
        return f" AND ubicacion_id IN ({placeholders})", tuple(current_user.tiendas_asignadas)
    else:
        # No filter for other roles
        return "", ()
