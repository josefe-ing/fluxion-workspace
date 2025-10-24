"""
Módulo de autenticación para Fluxion AI
Maneja login, verificación de tokens JWT y validación de usuarios
"""
from datetime import datetime, timedelta
from typing import Optional
import duckdb
from pathlib import Path
from contextlib import contextmanager

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# Configuración
SECRET_KEY = "fluxion-ai-secret-key-change-in-production-2024"  # Cambiar en producción
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 horas

DB_PATH = Path(__file__).parent.parent / "data" / "fluxion_production.db"

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

@contextmanager
def get_auth_db_connection():
    """
    Context manager para conexiones DuckDB READ-ONLY (para autenticación y lectura de usuarios)
    Permite múltiples lectores simultáneos y no bloquea ETL
    """
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Base de datos no encontrada"
        )

    conn = None
    try:
        # Conexión read-only: para autenticación y lectura de usuarios
        conn = duckdb.connect(str(DB_PATH), read_only=True)
        yield conn
    finally:
        if conn:
            conn.close()

@contextmanager
def get_auth_db_connection_write():
    """
    Context manager para conexiones DuckDB READ-WRITE (para crear usuarios)
    Solo usar cuando necesites INSERT/UPDATE en tabla usuarios
    """
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Base de datos no encontrada"
        )

    conn = None
    try:
        # Conexión read-write: solo para crear/modificar usuarios
        conn = duckdb.connect(str(DB_PATH), read_only=False)
        yield conn
    finally:
        if conn:
            conn.close()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña coincide con su hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Genera hash de una contraseña"""
    return pwd_context.hash(password)

def authenticate_user(username: str, password: str) -> Optional[Usuario]:
    """Autentica un usuario verificando username y password"""
    try:
        # Primero: SELECT con conexión read-only
        with get_auth_db_connection() as conn:
            result = conn.execute("""
                SELECT id, username, password_hash, nombre_completo, email, activo
                FROM usuarios
                WHERE username = ? AND activo = true
            """, (username,)).fetchone()

            if not result:
                return None

            user_id, username, password_hash, nombre_completo, email, activo = result

            # Verificar contraseña
            if not verify_password(password, password_hash):
                return None

        # Segundo: UPDATE con conexión read-write (separada)
        try:
            with get_auth_db_connection_write() as conn_write:
                conn_write.execute("""
                    UPDATE usuarios
                    SET ultimo_login = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (user_id,))
        except Exception as update_error:
            # Log el error pero no fallar el login
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

    # Buscar usuario en la base de datos
    try:
        with get_auth_db_connection() as conn:
            result = conn.execute("""
                SELECT id, username, nombre_completo, email, activo
                FROM usuarios
                WHERE username = ? AND activo = true
            """, (username,)).fetchone()

            if not result:
                raise credentials_exception

            user_id, username, nombre_completo, email, activo = result

            return Usuario(
                id=user_id,
                username=username,
                nombre_completo=nombre_completo,
                email=email,
                activo=activo
            )
    except Exception as e:
        print(f"Error en verify_token: {e}")
        raise credentials_exception

def create_user(username: str, password: str, nombre_completo: Optional[str] = None, email: Optional[str] = None) -> Usuario:
    """Crea un nuevo usuario en la base de datos"""
    import uuid

    try:
        # Usar conexión de escritura para crear usuarios
        with get_auth_db_connection_write() as conn:
            # Verificar si el usuario ya existe
            existing = conn.execute("""
                SELECT COUNT(*) FROM usuarios WHERE username = ?
            """, (username,)).fetchone()

            if existing[0] > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"El usuario '{username}' ya existe"
                )

            # Crear nuevo usuario
            user_id = str(uuid.uuid4())
            password_hash = get_password_hash(password)

            conn.execute("""
                INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (user_id, username, password_hash, nombre_completo, email, True))

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
        # First check with read-only connection
        with get_auth_db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]

        if count == 0:
            # No users exist - create admin with write connection
            with get_auth_db_connection_write() as conn:
                user_id = str(uuid.uuid4())
                password_hash = get_password_hash("admin123")

                conn.execute("""
                    INSERT INTO usuarios (id, username, password_hash, nombre_completo, email, activo, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (user_id, "admin", password_hash, "Administrador", "admin@fluxion.ai", True))

                print("✅ Auto-bootstrap: Admin user created (username: admin, password: admin123)")
                return True
        else:
            print(f"✅ Database has {count} user(s) - skipping auto-bootstrap")
            return False
    except Exception as e:
        print(f"⚠️  Auto-bootstrap failed: {e}")
        return False
