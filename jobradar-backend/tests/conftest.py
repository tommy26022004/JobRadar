import pytest
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db

# Use SQLite in-memory for tests — isolated from production DB
TEST_DB_URL = "sqlite:///./test_jobradar.db"

os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-32chars!!")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ["TESTING"] = "true"  # disables rate limiting in tests

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    from app.main import app  # import after env vars set
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_db():
    yield
    with engine.connect() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"DELETE FROM {table.name}"))
        conn.commit()


@pytest.fixture(scope="session")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def registered_user(client):
    """Register + login, return auth headers."""
    client.post("/api/auth/register", json={
        "email": "test@jobradar.dev",
        "password": "Test1234!",
        "full_name": "Test User",
    })
    r = client.post("/api/auth/login", json={
        "email": "test@jobradar.dev",
        "password": "Test1234!",
    })
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_with_cv(client, registered_user):
    """User that already has a CV."""
    client.post("/api/cvs/", json={
        "name": "Software Engineer CV",
        "content": "Python FastAPI React TypeScript PostgreSQL Docker experienced software engineer 3 years",
    }, headers=registered_user)
    return registered_user
