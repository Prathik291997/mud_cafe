from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from cafe.models import CafeTable, MenuItem

User = get_user_model()


class Command(BaseCommand):
    help = "Seed Mudcup demo staff, tables, and menu"

    def handle(self, *args, **options):
        fixed_staff = [
            {
                "email": "admin@mudcup.local",
                "password": "admin123",
                "role": "ADMIN",
                "first_name": "Cafe",
                "last_name": "Admin",
            },
            {
                "email": "owner@mudcup.local",
                "password": "owner123",
                "role": "ADMIN",
                "first_name": "Cafe",
                "last_name": "Owner",
            },
            {
                "email": "manager@mudcup.local",
                "password": "manager123",
                "role": "MANAGER",
                "first_name": "Floor",
                "last_name": "Manager",
            },
        ]

        for s in fixed_staff:
            if not User.objects.filter(email=s["email"]).exists():
                User.objects.create_user(
                    s["email"],
                    password=s["password"],
                    role=s["role"],
                    first_name=s["first_name"],
                    last_name=s["last_name"],
                    is_staff=True,
                )
            else:
                u = User.objects.get(email=s["email"])
                u.role = s["role"]
                u.is_staff = True
                u.first_name = s["first_name"]
                u.last_name = s["last_name"]
                u.set_password(s["password"])
                u.save()

        for n in range(1, 13):
            CafeTable.objects.update_or_create(
                number=n,
                defaults={"qr_token": f"table-{n}-demo-token", "label": f"Table {n}"},
            )

        menu = [
            ("Espresso", 80, "Bean Co.", "Double shot"),
            ("Cappuccino", 120, "Bean Co.", "With steamed milk"),
            ("Cold Brew", 140, "Bean Co.", "Slow steeped"),
            ("Sandwich", 180, "Fresh Breads", "Veg grilled"),
            ("Brownie", 90, "Sweet Lab", "Chocolate"),
        ]
        for order, (name, price, supplier, desc) in enumerate(menu, start=1):
            MenuItem.objects.update_or_create(
                name=name,
                defaults={
                    "price": price,
                    "supplier_name": supplier,
                    "description": desc,
                    "sort_order": order,
                    "active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Seed OK — admin@mudcup.local / admin123, owner@mudcup.local / owner123, manager@mudcup.local / manager123"
            )
        )
        self.stdout.write("Table 1 path (frontend): /t/table-1-demo-token")
