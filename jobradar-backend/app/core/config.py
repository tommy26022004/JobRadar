from pydantic_settings import BaseSettings
from pydantic import model_validator

_DEFAULT_SECRET = "change-this-to-a-long-random-string-in-production"


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    GROQ_API_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "JobRadar <notifications@jobradar.app>"

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        if self.SECRET_KEY == _DEFAULT_SECRET:
            raise ValueError("SECRET_KEY must be changed from the default value before running")
        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return self

    class Config:
        env_file = ".env"


settings = Settings()
