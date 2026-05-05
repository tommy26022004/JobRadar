from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/settings", tags=["settings"])

SUPPORTED_PROVIDERS = {
    "groq": {
        "name": "Groq",
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
        "default_model": "llama-3.3-70b-versatile",
        "key_url": "https://console.groq.com/keys",
        "free": True,
    },
    "gemini": {
        "name": "Google Gemini",
        "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
        "default_model": "gemini-1.5-flash",
        "key_url": "https://aistudio.google.com/app/apikey",
        "free": True,
    },
    "openai": {
        "name": "OpenAI",
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
        "default_model": "gpt-4o-mini",
        "key_url": "https://platform.openai.com/api-keys",
        "free": False,
    },
}


class AISettingsUpdate(BaseModel):
    provider: str
    api_key: str
    model: str | None = None


class AISettingsResponse(BaseModel):
    provider: str
    model: str | None
    has_custom_key: bool
    key_preview: str | None  # last 4 chars only


@router.get("/ai", response_model=AISettingsResponse)
def get_ai_settings(current_user: User = Depends(get_current_user)):
    key_preview = None
    if current_user.ai_api_key:
        key_preview = "..." + current_user.ai_api_key[-4:]
    return AISettingsResponse(
        provider=current_user.ai_provider or "groq",
        model=current_user.ai_model,
        has_custom_key=bool(current_user.ai_api_key),
        key_preview=key_preview,
    )


@router.put("/ai")
def update_ai_settings(
    body: AISettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {body.provider}")
    if not body.api_key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")

    current_user.ai_provider = body.provider
    current_user.ai_api_key = body.api_key.strip()
    current_user.ai_model = body.model or SUPPORTED_PROVIDERS[body.provider]["default_model"]
    db.commit()
    return {"message": "AI settings updated"}


@router.delete("/ai")
def clear_ai_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.ai_api_key = None
    current_user.ai_provider = "groq"
    current_user.ai_model = None
    db.commit()
    return {"message": "Reverted to server default"}


@router.get("/ai/providers")
def list_providers():
    return SUPPORTED_PROVIDERS
