"""
Módulo de autenticación para Fluxion AI
Maneja login, verificación de tokens JWT y validación de usuarios
PostgreSQL only - DuckDB removido (Dic 2025)
"""
from datetime import datetime, timedelta
from typing import Optional

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

class Usuario(BaseModel):
    id: str
    username: str
    nombre_completo: Optional[str] = None
    email: Optional[str] = None
    activo: bool

class CreateUserRequest(BaseModel):
    username: str
    password: str
    nombre_completo: Optional[str] = None
    email: Optional[str] = None

# =====================================================================================
# FUNCIONES DE AUTENTICACIÓN
# =====================================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña coincide con su hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera hash de una contraseña"""
    return pwd_context.hash(password)

def authenticate_user(username: str, password: str) -> Optional[Usuario]:
    """Autentica un usuario verificando username y password"""
    try:
        with get_db_connection(read_only=True) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, username, password_hash, nombre_completo, email, activo
                FROM usuarios
                WHERE username = %s AND activo = true
            """, (username,))
            result = cursor.fetchone()
            cursor.close()

            if not result:
                return None

            user_id, username, password_hash, nombre_completo, email, activo = result

            if not verify_password(password, password_hash):
                return None

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

        return Usuario(
            id=user_id,
            username=username,
            nombre_completo=nombre_completo,
            email=email,
            activo=activo
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

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Usuario:
    """Verifica un token JWT y retorna el usuario"""
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
                SELECT id, username, nombre_completo, email, activo
                FROM usuarios
                WHERE username = %s AND activo = true
            """, (username,))
            row = cursor.fetchone()
            cursor.close()

            if not row:
                raise credentials_exception

            return Usuario(
                id=row[0],
                username=row[1],
                nombre_completo=row[2],
                email=row[3],
                activo=row[4]
            )
    except Exception as e:
        print(f"Error en verify_token: {e}")
        raise credentials_exception

def create_user(username: str, password: str, nombre_completo: Optional[str] = None, email: Optional[str] = None) -> Usuario:
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
                INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user_id, username, password_hash, nombre_completo, email, True))
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
                    INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (user_id, "admin", password_hash, "Administrador", "admin@fluxion.ai", True))
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
