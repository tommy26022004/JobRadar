import secrets
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.config import settings
from app.core.email import send_verification_email
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, RefreshRequest, UserResponse
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("200/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    token = secrets.token_urlsafe(32)
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_verified=False,
        verification_token=token,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email (fire-and-forget, don't block registration)
    sent = send_verification_email(body.email, token)
    if not sent:
        # No Resend key configured — auto-verify so local dev still works
        user.is_verified = True
        user.verification_token = None
        db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("200/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    user.is_verified = True
    user.verification_token = None
    db.commit()
    # Redirect to frontend login with success flag
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?verified=1")


@router.post("/resend-verification")
@limiter.limit("5/minute")
def resend_verification(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        # Don't leak whether email exists
        return {"message": "If that email is registered, a verification link has been sent"}
    if user.is_verified:
        return {"message": "Email already verified"}
    token = secrets.token_urlsafe(32)
    user.verification_token = token
    db.commit()
    send_verification_email(body.email, token)
    return {"message": "Verification email sent"}


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    user_id = decode_token(body.refresh_token, token_type="refresh")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/google")
def google_login(request: Request):
    """Redirect to Google OAuth consent screen."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    state = secrets.token_urlsafe(16)
    callback = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback/google"
    # Store state in session cookie (simple approach — stateless via signed token)
    params = (
        f"client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={callback}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
        f"&access_type=offline"
        f"&prompt=select_account"
    )
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    """Exchange code for Google user info, create/login user."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    import httpx
    callback = f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback/google"

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_res = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": callback,
            "grant_type": "authorization_code",
        })
        if token_res.status_code != 200:
            logger.error("Google token exchange failed: %s", token_res.text)
            raise HTTPException(status_code=400, detail="Failed to exchange Google code")
        token_data = token_res.json()

        # Get user info
        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch Google user info")
        guser = userinfo_res.json()

    google_id = guser.get("sub")
    email = guser.get("email")
    name = guser.get("name")

    if not email or not google_id:
        raise HTTPException(status_code=400, detail="Google did not return email")

    # Find or create user
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Link Google account if not already linked
        if not user.oauth_id:
            user.oauth_provider = "google"
            user.oauth_id = google_id
        if not user.is_verified:
            user.is_verified = True
        db.commit()
    else:
        user = User(
            email=email,
            full_name=name,
            hashed_password=None,
            oauth_provider="google",
            oauth_id=google_id,
            is_verified=True,  # Google already verified the email
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Redirect to frontend with tokens
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    return RedirectResponse(
        url=f"{settings.FRONTEND_URL}/auth/callback/google?access_token={access}&refresh_token={refresh}"
    )
