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

# =====================================================================================
# FUNCIONES DE AUTENTICACIÓN
# =====================================================================================

@contextmanager
def get_auth_db_connection():
    """Context manager para conexiones DuckDB de autenticación"""
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail="Base de datos no encontrada"
        )

    conn = None
    try:
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

            # Actualizar último login
            conn.execute("""
                UPDATE usuarios
                SET ultimo_login = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (user_id,))

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
