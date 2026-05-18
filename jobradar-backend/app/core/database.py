from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine = create_engine(
    settings.DATABASE_URL,
    # SQLite doesn't support pool config; skip for test environments
    **({} if _is_sqlite else {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 3600,
        "pool_pre_ping": True,
    })
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
