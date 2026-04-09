from decimal import Decimal

from .models import StaffNotification


NOTIFY_PAYMENT = "PAYMENT_RECEIVED"
NOTIFY_ETA = "ETA_SENT"
NOTIFY_OFFER = "OFFER_RELEASED"


def notify_payment_received(*, table_number: int, order_id: int, amount: Decimal, items_summary: str) -> None:
    StaffNotification.objects.create(
        type=NOTIFY_PAYMENT,
        title=f"Payment received — Table {table_number}",
        body=f"Rs {amount} — {items_summary}",
        table_number=table_number,
        order_id=order_id,
        amount=amount,
    )


def notify_eta_sent(*, table_number: int, order_id: int, message: str) -> None:
    StaffNotification.objects.create(
        type=NOTIFY_ETA,
        title=f"ETA sent — Table {table_number}",
        body=message,
        table_number=table_number,
        order_id=order_id,
    )


def notify_offer_released(*, title: str, body: str) -> None:
    StaffNotification.objects.create(
        type=NOTIFY_OFFER,
        title=f"Offer released: {title}",
        body=body,
    )
