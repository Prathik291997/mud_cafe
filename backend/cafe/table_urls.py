from django.conf import settings


def table_ordering_url(qr_token: str) -> str:
    base = getattr(settings, "FRONTEND_PUBLIC_URL", "http://127.0.0.1:5173").rstrip("/")
    return f"{base}/t/{qr_token}"
