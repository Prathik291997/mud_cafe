import uuid

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class StaffManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        user = self.model(email=email, username=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "ADMIN")
        return self.create_user(email, password, **extra_fields)


class Staff(AbstractUser):
    """Admin / manager login (email + password)."""

    email = models.EmailField("email address", unique=True)
    role = models.CharField(max_length=20)  # ADMIN | MANAGER
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = StaffManager()

    class Meta:
        db_table = "cafe_staff"

    def save(self, *args, **kwargs):
        self.username = self.email
        super().save(*args, **kwargs)


class CafeTable(models.Model):
    number = models.PositiveIntegerField(unique=True)
    qr_token = models.SlugField(max_length=120, unique=True)
    label = models.CharField(max_length=200, blank=True, null=True)
    qr_custom_image = models.ImageField(
        upload_to="table_qr/",
        blank=True,
        null=True,
        help_text="Optional: your own printed QR image. If empty, the app generates a QR from the ordering URL.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Table {self.number}"


class MenuItem(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    supplier_name = models.CharField(max_length=200, blank=True, null=True)
    active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Order(models.Model):
    customer_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    table = models.ForeignKey(CafeTable, on_delete=models.CASCADE, related_name="orders")
    status = models.CharField(max_length=20, default="PENDING")
    estimated_minutes = models.PositiveIntegerField(blank=True, null=True)
    eta_message = models.TextField(blank=True, null=True)
    eta_sent_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)


class Payment(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="payment")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=30)
    bank_details = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, default="PENDING")
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Review(models.Model):
    email = models.EmailField()
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class EmailSubscriber(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=120, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Offer(models.Model):
    title = models.CharField(max_length=300)
    body = models.TextField()
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(blank=True, null=True)


class Combo(models.Model):
    title = models.CharField(max_length=300)
    description = models.TextField()
    original_price = models.DecimalField(max_digits=10, decimal_places=2)
    combo_price = models.DecimalField(max_digits=10, decimal_places=2)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    released_at = models.DateTimeField(blank=True, null=True)


class StaffNotification(models.Model):
    type = models.CharField(max_length=40)
    title = models.CharField(max_length=300)
    body = models.TextField()
    table_number = models.PositiveIntegerField(blank=True, null=True)
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, blank=True, null=True, related_name="staff_notifications")
    amount = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    read_by_admin = models.BooleanField(default=False)
    read_by_manager = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
