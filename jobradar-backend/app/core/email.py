import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, token: str) -> bool:
    """Send email verification link. Returns True on success."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — cannot send verification email to %s", to_email)
        return False
    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h1 style="font-size:24px;font-weight:700;color:#111;margin:0 0 8px">Verify your email</h1>
          <p style="color:#6b7280;font-size:15px;margin:0 0 28px">
            Thanks for signing up for JobRadar! Click the button below to confirm your email address.
          </p>
          <a href="{verify_url}"
             style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none">
            Verify email →
          </a>
          <p style="margin-top:24px;font-size:13px;color:#9ca3af">
            Or copy this link: <a href="{verify_url}" style="color:#2563eb">{verify_url}</a>
          </p>
          <p style="margin-top:16px;font-size:12px;color:#d1d5db">This link expires in 24 hours.</p>
        </div>
        """
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": "Verify your JobRadar account",
            "html": html,
        })
        logger.info("Verification email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Failed to send verification email to %s", to_email)
        return False


def send_job_matches_email(to_email: str, matches: list[dict]) -> bool:
    """Send email with top job matches. Returns True on success."""
    if not settings.RESEND_API_KEY:
        logger.debug("RESEND_API_KEY not set — skipping email notification")
        return False
    if not matches:
        return False

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY

        top = matches[:5]
        items_html = "".join(
            f"""
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <span style="font-size:22px;font-weight:700;color:{'#16a34a' if j['score']>=70 else '#ca8a04' if j['score']>=50 else '#6b7280'}">
                    {j['score']}%
                  </span>
                  <div>
                    <div style="font-weight:600;font-size:14px;color:#111">{j.get('title','Unknown')}</div>
                    <div style="font-size:12px;color:#6b7280">{j.get('company','') or ''} · {j.get('source','')}</div>
                    <div style="font-size:12px;color:#6b7280;margin-top:2px">{j.get('reason','')[:120]}</div>
                  </div>
                </div>
                <a href="{j.get('url','#')}" style="display:inline-block;margin-top:8px;font-size:12px;color:#2563eb;text-decoration:none;">
                  View job →
                </a>
              </td>
            </tr>
            """
            for j in top
        )

        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 4px">
            {len(matches)} new job{'s' if len(matches)!=1 else ''} matched your CV
          </h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 20px">
            JobRadar found these while scanning — here are the top picks.
          </p>
          <table style="width:100%;border-collapse:collapse">
            {items_html}
          </table>
          <div style="margin-top:24px;text-align:center">
            <a href="https://jobradar.app/discover"
               style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
              Open Discover →
            </a>
          </div>
          <p style="margin-top:20px;font-size:11px;color:#9ca3af;text-align:center">
            You're receiving this because you have job notifications enabled in JobRadar.
          </p>
        </div>
        """

        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": f"JobRadar: {len(matches)} new job match{'es' if len(matches)!=1 else ''} found",
            "html": html,
        })
        logger.info("Job match email sent to %s (%d matches)", to_email, len(matches))
        return True

    except Exception:
        logger.exception("Failed to send job match email to %s", to_email)
        return False
