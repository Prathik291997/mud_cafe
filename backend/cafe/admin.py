from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import (
    CafeTable,
    EmailSubscriber,
    MenuItem,
    Offer,
    Order,
    OrderItem,
    Payment,
    Review,
    Staff,
    StaffNotification,
)


@admin.register(Staff)
class StaffAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "role", "is_staff", "is_active")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("first_name", "last_name", "role")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "role", "is_staff"),
            },
        ),
    )


admin.site.register(CafeTable)
admin.site.register(MenuItem)
admin.site.register(Order)
admin.site.register(OrderItem)
admin.site.register(Payment)
admin.site.register(Review)
admin.site.register(EmailSubscriber)
admin.site.register(Offer)
admin.site.register(StaffNotification)
