from decimal import Decimal
import mimetypes
import secrets

from django.db import transaction
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.core.mail import send_mail
from django.conf import settings
from django.http import FileResponse, HttpResponse
from rest_framework import exceptions, serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import (
    CafeTable,
    Combo,
    EmailSubscriber,
    MenuItem,
    Offer,
    Order,
    OrderItem,
    Payment,
    Review,
    StaffNotification,
)
from .permissions import IsAdmin, IsManagerOrAdmin
from .qr_png import qr_png_bytes
from .table_urls import table_ordering_url
from .utils_notify import notify_eta_sent, notify_offer_released, notify_payment_received


def _new_table_qr_slug(number: int) -> str:
    return f"table-{number}-{secrets.token_hex(6)}"


ORDER_STATUS_PENDING = "PENDING"
ORDER_STATUS_PAID = "PAID"
PAYMENT_PENDING = "PENDING"
PAYMENT_COMPLETED = "COMPLETED"


class StaffTokenSerializer(TokenObtainPairSerializer):
    """
    Login with `email` + `password`. Also accepts optional `username` (same value as email)
    for clients that follow the default SimpleJWT body shape.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Parent marks `email` required; allow either email or username (JWT default key).
        self.fields["email"] = serializers.EmailField(write_only=True, required=False, allow_blank=True)
        self.fields["username"] = serializers.CharField(write_only=True, required=False, allow_blank=True)

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["email"] = user.email
        token["name"] = user.get_full_name() or user.email
        return token

    def validate(self, attrs):
        raw = (attrs.get("email") or attrs.get("username") or "").strip()
        password = attrs.get("password")
        if not raw or not password:
            raise exceptions.AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )
        request = self.context.get("request")
        self.user = authenticate(request, email=raw, password=password)
        if not jwt_settings.USER_AUTHENTICATION_RULE(self.user):
            raise exceptions.AuthenticationFailed(
                self.error_messages["no_active_account"],
                "no_active_account",
            )
        refresh = self.get_token(self.user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
        if jwt_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, self.user)
        return data


class StaffTokenView(TokenObtainPairView):
    serializer_class = StaffTokenSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response(
            {
                "user": {
                    "id": u.id,
                    "email": u.email,
                    "name": u.get_full_name() or u.email,
                    "role": u.role,
                }
            }
        )


class PaymentConfigView(APIView):
    """Public UPI details for customer payment QR (optional)."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "upiPa": getattr(settings, "MUDCUP_UPI_PA", "") or "",
                "payeeName": getattr(settings, "MUDCUP_UPI_PAYEE_NAME", "Mudcup") or "Mudcup",
            }
        )


class PublicMenuView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        items = MenuItem.objects.filter(active=True).order_by("sort_order", "name")
        return Response(
            {
                "items": [
                    {
                        "id": i.id,
                        "name": i.name,
                        "description": i.description,
                        "price": str(i.price),
                        "supplierName": i.supplier_name,
                    }
                    for i in items
                ]
            }
        )


class PublicAnnouncementsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        offers = (
            Offer.objects.filter(active=True, released_at__isnull=False)
            .order_by("-released_at", "-created_at")[:20]
        )
        combos = (
            Combo.objects.filter(active=True, released_at__isnull=False)
            .order_by("-released_at", "-created_at")[:20]
        )
        return Response(
            {
                "offers": [
                    {
                        "id": o.id,
                        "title": o.title,
                        "body": o.body,
                        "releasedAt": o.released_at,
                    }
                    for o in offers
                ],
                "combos": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "description": c.description,
                        "originalPrice": str(c.original_price),
                        "comboPrice": str(c.combo_price),
                        "releasedAt": c.released_at,
                    }
                    for c in combos
                ],
            }
        )


class TableByTokenView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        t = CafeTable.objects.filter(qr_token=token).first()
        if not t:
            return Response({"error": "Table not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"table": {"id": t.id, "number": t.number, "label": t.label, "qrToken": t.qr_token}})


class CreateOrderView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data or {}
        table_token = data.get("tableToken")
        lines = data.get("items") or []
        if not table_token or not isinstance(lines, list) or len(lines) == 0:
            return Response({"error": "Invalid order"}, status=status.HTTP_400_BAD_REQUEST)

        table = CafeTable.objects.filter(qr_token=table_token).first()
        if not table:
            return Response({"error": "Invalid table"}, status=status.HTTP_404_NOT_FOUND)

        menu_ids = list({str(x.get("menuItemId")) for x in lines if x.get("menuItemId")})
        menus = {str(m.id): m for m in MenuItem.objects.filter(id__in=menu_ids, active=True)}
        if len(menus) != len(menu_ids):
            return Response({"error": "Invalid menu items"}, status=status.HTTP_400_BAD_REQUEST)

        total = Decimal("0")
        line_objs = []
        for x in lines:
            mid = str(x.get("menuItemId"))
            qty = int(x.get("quantity") or 0)
            if mid not in menus or qty < 1 or qty > 99:
                return Response({"error": "Invalid item"}, status=status.HTTP_400_BAD_REQUEST)
            m = menus[mid]
            unit = m.price
            total += unit * qty
            line_objs.append((m, qty, unit))

        with transaction.atomic():
            order = Order.objects.create(table=table, status=ORDER_STATUS_PENDING)
            for m, qty, unit in line_objs:
                OrderItem.objects.create(order=order, menu_item=m, quantity=qty, unit_price=unit)
            Payment.objects.create(
                order=order,
                amount=total,
                method="OTHER",
                status=PAYMENT_PENDING,
            )

        return Response(
            {
                "orderId": order.id,
                "customerToken": str(order.customer_token),
                "tableNumber": table.number,
                "total": str(total),
                "status": order.status,
            }
        )


class OrderDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        token = request.query_params.get("token")
        if not token:
            return Response({"error": "token required"}, status=status.HTTP_400_BAD_REQUEST)
        order = Order.objects.filter(id=pk, customer_token=token).select_related("table", "payment").prefetch_related(
            "items__menu_item"
        ).first()
        if not order:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        pay = getattr(order, "payment", None)
        return Response(
            {
                "order": {
                    "id": order.id,
                    "status": order.status,
                    "tableNumber": order.table.number,
                    "estimatedMinutes": order.estimated_minutes,
                    "etaMessage": order.eta_message,
                    "etaSentAt": order.eta_sent_at,
                    "createdAt": order.created_at,
                    "items": [
                        {
                            "name": i.menu_item.name,
                            "quantity": i.quantity,
                            "unitPrice": str(i.unit_price),
                        }
                        for i in order.items.all()
                    ],
                    "payment": (
                        {
                            "amount": str(pay.amount),
                            "status": pay.status,
                            "method": pay.method,
                            "bankDetails": pay.bank_details,
                            "paidAt": pay.paid_at,
                        }
                        if pay
                        else None
                    ),
                }
            }
        )


class PayOrderView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, pk):
        data = request.data or {}
        customer_token = data.get("customerToken")
        method = data.get("method")
        bank_details = data.get("bankDetails")
        if not customer_token or not method:
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)

        order = (
            Order.objects.filter(id=pk, customer_token=customer_token)
            .select_related("payment", "table")
            .prefetch_related("items__menu_item")
            .first()
        )
        if not order or not hasattr(order, "payment"):
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        pay = order.payment
        if pay.status == PAYMENT_COMPLETED:
            return Response({"error": "Already paid"}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils import timezone

        with transaction.atomic():
            pay.method = str(method)[:30]
            pay.bank_details = bank_details
            pay.status = PAYMENT_COMPLETED
            pay.paid_at = timezone.now()
            pay.save()
            order.status = ORDER_STATUS_PAID
            order.save()

        items_summary = ", ".join(f"{i.menu_item.name} x{i.quantity}" for i in order.items.all())
        notify_payment_received(
            table_number=order.table.number,
            order_id=order.id,
            amount=pay.amount,
            items_summary=items_summary,
        )

        return Response({"ok": True, "paymentStatus": PAYMENT_COMPLETED})


class AdminMenuListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        items = MenuItem.objects.all().order_by("sort_order", "name")
        return Response(
            {
                "items": [
                    {
                        "id": i.id,
                        "name": i.name,
                        "description": i.description,
                        "price": str(i.price),
                        "supplierName": i.supplier_name,
                        "active": i.active,
                        "sortOrder": i.sort_order,
                    }
                    for i in items
                ]
            }
        )

    def post(self, request):
        d = request.data or {}
        name = d.get("name")
        price = d.get("price")
        if not name or price is None:
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)
        item = MenuItem.objects.create(
            name=name,
            price=Decimal(str(price)),
            description=d.get("description"),
            supplier_name=d.get("supplierName"),
            active=bool(d.get("active", True)),
            sort_order=int(d.get("sortOrder") or 0),
        )
        return Response({"item": {"id": item.id, "name": item.name, "price": str(item.price)}})


class AdminMenuDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        item = MenuItem.objects.filter(id=pk).first()
        if not item:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        d = request.data or {}
        if "name" in d:
            item.name = d["name"]
        if "price" in d:
            item.price = Decimal(str(d["price"]))
        if "description" in d:
            item.description = d["description"]
        if "supplierName" in d:
            item.supplier_name = d["supplierName"]
        if "active" in d:
            item.active = bool(d["active"])
        if "sortOrder" in d:
            item.sort_order = int(d["sortOrder"])
        item.save()
        return Response({"item": {"id": item.id, "price": str(item.price)}})

    def delete(self, request, pk):
        MenuItem.objects.filter(id=pk).delete()
        return Response({"ok": True})


class AdminOrdersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = Order.objects.all().select_related("table", "payment").prefetch_related("items__menu_item").order_by(
            "-created_at"
        )[:200]
        return Response({"orders": [_serialize_order_admin(o) for o in qs]})


class ManagerOrdersView(APIView):
    permission_classes = [IsManagerOrAdmin]

    def get(self, request):
        qs = Order.objects.all().select_related("table", "payment").prefetch_related("items__menu_item").order_by(
            "-created_at"
        )[:100]
        out = []
        for o in qs:
            pay = getattr(o, "payment", None)
            out.append(
                {
                    "id": o.id,
                    "tableNumber": o.table.number,
                    "status": o.status,
                    "estimatedMinutes": o.estimated_minutes,
                    "etaMessage": o.eta_message,
                    "createdAt": o.created_at,
                    "items": [
                        {"name": i.menu_item.name, "quantity": i.quantity, "unitPrice": str(i.unit_price)}
                        for i in o.items.all()
                    ],
                    "payment": (
                        {
                            "amount": str(pay.amount),
                            "status": pay.status,
                            "method": pay.method,
                            "received": pay.status == PAYMENT_COMPLETED,
                        }
                        if pay
                        else None
                    ),
                }
            )
        return Response({"orders": out})


def _serialize_order_admin(o):
    pay = getattr(o, "payment", None)
    suppliers = list({i.menu_item.supplier_name for i in o.items.all() if i.menu_item.supplier_name})
    return {
        "id": o.id,
        "tableNumber": o.table.number,
        "supplierNames": suppliers,
        "status": o.status,
        "createdAt": o.created_at,
        "items": [
            {
                "name": i.menu_item.name,
                "supplierName": i.menu_item.supplier_name,
                "quantity": i.quantity,
                "unitPrice": str(i.unit_price),
            }
            for i in o.items.all()
        ],
        "payment": (
            {
                "amount": str(pay.amount),
                "method": pay.method,
                "bankDetails": pay.bank_details,
                "status": pay.status,
                "paidAt": pay.paid_at,
                "received": pay.status == PAYMENT_COMPLETED,
            }
            if pay
            else None
        ),
    }


class AdminStatsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.utils import timezone

        period = request.query_params.get("period") or "today"
        now = timezone.now()
        if period == "week":
            from datetime import timedelta

            start = now - timedelta(days=7)
            label = "Last 7 days"
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            label = "This calendar month"
        else:
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            label = "Today"

        payments = Payment.objects.filter(status=PAYMENT_COMPLETED, paid_at__gte=start, paid_at__lte=now)
        total = sum(Decimal(p.amount) for p in payments)
        return Response(
            {
                "period": period,
                "label": label,
                "from": start.isoformat(),
                "to": now.isoformat(),
                "completedPayments": payments.count(),
                "revenue": float(total),
            }
        )


class AdminPaymentsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.utils import timezone

        period = request.query_params.get("period") or "today"
        now = timezone.now()
        if period == "week":
            from datetime import timedelta

            start = now - timedelta(days=7)
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        rows = (
            Payment.objects.filter(status=PAYMENT_COMPLETED, paid_at__gte=start, paid_at__lte=now)
            .select_related("order__table")
            .prefetch_related("order__items__menu_item")
            .order_by("-paid_at")[:500]
        )
        out = []
        for p in rows:
            o = p.order
            out.append(
                {
                    "id": p.id,
                    "amount": str(p.amount),
                    "method": p.method,
                    "bankDetails": p.bank_details,
                    "status": p.status,
                    "paidAt": p.paid_at,
                    "tableNumber": o.table.number,
                    "orderId": o.id,
                    "orderStatus": o.status,
                    "items": [{"name": i.menu_item.name, "quantity": i.quantity} for i in o.items.all()],
                }
            )
        return Response({"period": period, "payments": out})


class StaffNotificationsView(APIView):
    permission_classes = [IsManagerOrAdmin]

    def get(self, request):
        since = request.query_params.get("since")
        qs = StaffNotification.objects.all().order_by("-created_at")[:100]
        if since:
            from django.utils.dateparse import parse_datetime

            dt = parse_datetime(since)
            if dt:
                qs = StaffNotification.objects.filter(created_at__gte=dt).order_by("-created_at")[:100]
        return Response(
            {
                "notifications": [
                    {
                        "id": n.id,
                        "type": n.type,
                        "title": n.title,
                        "body": n.body,
                        "tableNumber": n.table_number,
                        "orderId": n.order_id,
                        "amount": str(n.amount) if n.amount is not None else None,
                        "readByAdmin": n.read_by_admin,
                        "readByManager": n.read_by_manager,
                        "createdAt": n.created_at,
                    }
                    for n in qs
                ]
            }
        )

    def post(self, request):
        ids = (request.data or {}).get("ids")
        if not ids or not isinstance(ids, list):
            return Response({"error": "ids required"}, status=status.HTTP_400_BAD_REQUEST)
        u = request.user
        if u.role == "ADMIN":
            StaffNotification.objects.filter(id__in=ids).update(read_by_admin=True)
        else:
            StaffNotification.objects.filter(id__in=ids).update(read_by_manager=True)
        return Response({"ok": True})


class ManagerEtaView(APIView):
    permission_classes = [IsManagerOrAdmin]

    def post(self, request, pk):
        d = request.data or {}
        minutes = d.get("minutes")
        message = (d.get("message") or "").strip()
        try:
            minutes = int(minutes)
        except (TypeError, ValueError):
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)
        if minutes < 1 or minutes > 240:
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)

        order = Order.objects.select_related("table").filter(id=pk).first()
        if not order:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if not message:
            message = f"Your order for table {order.table.number} will be ready in about {minutes} minutes. Thank you!"

        from django.utils import timezone

        order.estimated_minutes = minutes
        order.eta_message = message
        order.eta_sent_at = timezone.now()
        order.save()

        notify_eta_sent(table_number=order.table.number, order_id=order.id, message=message)
        return Response({"ok": True})


class ReviewCreateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        d = request.data or {}
        email = (d.get("email") or "").strip().lower()
        rating = d.get("rating")
        comment = (d.get("comment") or "").strip()
        subscribe = bool(d.get("subscribeOffers"))
        name = d.get("name")
        try:
            rating = int(rating)
        except (TypeError, ValueError):
            return Response({"error": "Invalid review"}, status=status.HTTP_400_BAD_REQUEST)
        if not email or rating < 1 or rating > 5 or not comment:
            return Response({"error": "Invalid review"}, status=status.HTTP_400_BAD_REQUEST)
        Review.objects.create(email=email, rating=rating, comment=comment)
        if subscribe:
            EmailSubscriber.objects.update_or_create(email=email, defaults={"name": name or None})
        return Response({"ok": True})


class SubscribeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        d = request.data or {}
        email = (d.get("email") or "").strip().lower()
        if not email:
            return Response({"error": "Invalid"}, status=status.HTTP_400_BAD_REQUEST)
        EmailSubscriber.objects.update_or_create(email=email, defaults={"name": d.get("name") or None})
        return Response({"ok": True})


class AdminOffersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        offers = Offer.objects.all().order_by("-created_at")[:50]
        return Response(
            {
                "offers": [
                    {
                        "id": o.id,
                        "title": o.title,
                        "body": o.body,
                        "active": o.active,
                        "releasedAt": o.released_at,
                    }
                    for o in offers
                ]
            }
        )

    def post(self, request):
        d = request.data or {}
        title = (d.get("title") or "").strip()
        body = (d.get("body") or "").strip()
        if not title or not body:
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)
        o = Offer.objects.create(title=title, body=body, active=bool(d.get("active", True)))
        return Response({"offer": {"id": o.id}})


class AdminOfferDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        offer = Offer.objects.filter(id=pk).first()
        if not offer:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        d = request.data or {}
        if "title" in d:
            offer.title = (d.get("title") or "").strip()
        if "body" in d:
            offer.body = (d.get("body") or "").strip()
        if "active" in d:
            offer.active = bool(d.get("active"))
        offer.save()
        return Response({"ok": True})

    def delete(self, request, pk):
        Offer.objects.filter(id=pk).delete()
        return Response({"ok": True})


class AdminOfferReleaseView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        offer = Offer.objects.filter(id=pk).first()
        if not offer:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        from django.utils import timezone

        offer.released_at = timezone.now()
        offer.active = True
        offer.save()
        notify_offer_released(title=offer.title, body=offer.body)

        subs = list(EmailSubscriber.objects.values_list("email", flat=True))
        for em in subs:
            try:
                send_mail(
                    subject=f"Mudcup offer: {offer.title}",
                    message=offer.body,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[em],
                    fail_silently=True,
                )
            except Exception:
                pass
        return Response({"ok": True, "emailsQueued": len(subs)})


class AdminCombosView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        combos = Combo.objects.all().order_by("-created_at")[:100]
        return Response(
            {
                "combos": [
                    {
                        "id": c.id,
                        "title": c.title,
                        "description": c.description,
                        "originalPrice": str(c.original_price),
                        "comboPrice": str(c.combo_price),
                        "active": c.active,
                        "releasedAt": c.released_at,
                    }
                    for c in combos
                ]
            }
        )

    def post(self, request):
        d = request.data or {}
        title = (d.get("title") or "").strip()
        description = (d.get("description") or "").strip()
        original_price = d.get("originalPrice")
        combo_price = d.get("comboPrice")
        if not title or not description or original_price is None or combo_price is None:
            return Response({"error": "Invalid body"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            op = Decimal(str(original_price))
            cp = Decimal(str(combo_price))
        except Exception:
            return Response({"error": "Invalid prices"}, status=status.HTTP_400_BAD_REQUEST)
        if op <= 0 or cp <= 0:
            return Response({"error": "Prices must be positive"}, status=status.HTTP_400_BAD_REQUEST)
        c = Combo.objects.create(
            title=title,
            description=description,
            original_price=op,
            combo_price=cp,
            active=bool(d.get("active", True)),
        )
        return Response({"combo": {"id": c.id}})


class AdminComboDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        c = Combo.objects.filter(id=pk).first()
        if not c:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        d = request.data or {}
        if "title" in d:
            c.title = (d.get("title") or "").strip()
        if "description" in d:
            c.description = (d.get("description") or "").strip()
        if "originalPrice" in d:
            c.original_price = Decimal(str(d.get("originalPrice")))
        if "comboPrice" in d:
            c.combo_price = Decimal(str(d.get("comboPrice")))
        if "active" in d:
            c.active = bool(d.get("active"))
        c.save()
        return Response({"ok": True})

    def delete(self, request, pk):
        Combo.objects.filter(id=pk).delete()
        return Response({"ok": True})


class AdminComboAnnounceView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        c = Combo.objects.filter(id=pk).first()
        if not c:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        from django.utils import timezone

        c.released_at = timezone.now()
        c.active = True
        c.save()
        notify_offer_released(title=f"Combo: {c.title}", body=c.description)

        subs = list(EmailSubscriber.objects.values_list("email", flat=True))
        message = (
            f"{c.title}\n\n{c.description}\n\n"
            f"Original: Rs {c.original_price}\nCombo: Rs {c.combo_price}"
        )
        for em in subs:
            try:
                send_mail(
                    subject=f"Mudcup combo: {c.title}",
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[em],
                    fail_silently=True,
                )
            except Exception:
                pass
        return Response({"ok": True, "emailsQueued": len(subs)})


def _table_json(t: CafeTable) -> dict:
    return {
        "id": t.id,
        "number": t.number,
        "label": t.label,
        "qrToken": t.qr_token,
        "orderingUrl": table_ordering_url(t.qr_token),
        "hasCustomQr": bool(t.qr_custom_image),
    }


class AdminTablesListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        tables = CafeTable.objects.all().order_by("number")
        return Response(
            {
                "tables": [_table_json(t) for t in tables],
                "frontendPublicUrl": getattr(settings, "FRONTEND_PUBLIC_URL", ""),
            }
        )

    def post(self, request):
        d = request.data or {}
        try:
            number = int(d.get("number"))
        except (TypeError, ValueError):
            return Response({"error": "number required"}, status=status.HTTP_400_BAD_REQUEST)
        if number < 1:
            return Response({"error": "invalid number"}, status=status.HTTP_400_BAD_REQUEST)
        if CafeTable.objects.filter(number=number).exists():
            return Response({"error": "Table number already exists"}, status=status.HTTP_400_BAD_REQUEST)
        label = (d.get("label") or "").strip() or None
        token = _new_table_qr_slug(number)
        while CafeTable.objects.filter(qr_token=token).exists():
            token = _new_table_qr_slug(number)
        t = CafeTable.objects.create(number=number, qr_token=token, label=label)
        return Response({"table": _table_json(t)}, status=status.HTTP_201_CREATED)


class AdminTableDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        t = CafeTable.objects.filter(id=pk).first()
        if not t:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        d = request.data or {}
        if "label" in d:
            t.label = (d.get("label") or "").strip() or None
        if d.get("regenerateQrToken"):
            new_tok = _new_table_qr_slug(t.number)
            while CafeTable.objects.filter(qr_token=new_tok).exclude(pk=t.pk).exists():
                new_tok = _new_table_qr_slug(t.number)
            t.qr_token = new_tok
        if "number" in d:
            try:
                n = int(d["number"])
            except (TypeError, ValueError):
                return Response({"error": "invalid number"}, status=status.HTTP_400_BAD_REQUEST)
            if n < 1:
                return Response({"error": "invalid number"}, status=status.HTTP_400_BAD_REQUEST)
            if n != t.number and CafeTable.objects.filter(number=n).exists():
                return Response({"error": "Table number in use"}, status=status.HTTP_400_BAD_REQUEST)
            t.number = n
        t.save()
        return Response({"table": _table_json(t)})

    def delete(self, request, pk):
        t = CafeTable.objects.filter(id=pk).first()
        if not t:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if t.orders.exists():
            return Response({"error": "Table has orders; cannot delete"}, status=status.HTTP_400_BAD_REQUEST)
        if t.qr_custom_image:
            t.qr_custom_image.delete(save=False)
        t.delete()
        return Response({"ok": True})


class AdminTableQrPngView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        t = CafeTable.objects.filter(id=pk).first()
        if not t:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if t.qr_custom_image and t.qr_custom_image.name:
            try:
                with t.qr_custom_image.open("rb") as fh:
                    data = fh.read()
                ct, _ = mimetypes.guess_type(t.qr_custom_image.name)
                return HttpResponse(data, content_type=ct or "image/png")
            except OSError:
                pass
        url = table_ordering_url(t.qr_token)
        return HttpResponse(qr_png_bytes(url), content_type="image/png")


class AdminTableQrUploadView(APIView):
    permission_classes = [IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        t = CafeTable.objects.filter(id=pk).first()
        if not t:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        f = request.FILES.get("image") or request.FILES.get("file")
        if not f:
            return Response({"error": "image file required"}, status=status.HTTP_400_BAD_REQUEST)
        if f.size > 2 * 1024 * 1024:
            return Response({"error": "File too large (max 2MB)"}, status=status.HTTP_400_BAD_REQUEST)
        if t.qr_custom_image:
            t.qr_custom_image.delete(save=False)
        t.qr_custom_image.save(f.name[:120], f, save=True)
        return Response({"ok": True, "table": _table_json(t)})


class AdminTableQrClearView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        t = CafeTable.objects.filter(id=pk).first()
        if not t:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if t.qr_custom_image:
            t.qr_custom_image.delete(save=False)
            t.qr_custom_image = None
            t.save()
        return Response({"ok": True, "table": _table_json(t)})
