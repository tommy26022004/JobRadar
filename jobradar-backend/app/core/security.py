from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(subject), "exp": expire}, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(subject), "exp": expire, "type": "refresh"}, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, token_type: str = "access") -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        # Refresh tokens carry type="refresh"; access tokens carry no type field
        if token_type == "access" and payload.get("type") == "refresh":
            return None
        if token_type == "refresh" and payload.get("type") != "refresh":
            return None
        return int(payload["sub"])
    except JWTError:
        return None
