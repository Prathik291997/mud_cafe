from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from cafe.models import CafeTable, MenuItem

User = get_user_model()


class Command(BaseCommand):
    help = "Seed Mudcup demo staff, tables, and menu"

    def handle(self, *args, **options):
        if not User.objects.filter(email="admin@mudcup.local").exists():
            User.objects.create_user(
                "admin@mudcup.local",
                password="admin123",
                role="ADMIN",
                first_name="Cafe",
                last_name="Admin",
                is_staff=True,
            )
        else:
            u = User.objects.get(email="admin@mudcup.local")
            u.role = "ADMIN"
            u.is_staff = True
            u.set_password("admin123")
            u.save()

        if not User.objects.filter(email="manager@mudcup.local").exists():
            User.objects.create_user(
                "manager@mudcup.local",
                password="manager123",
                role="MANAGER",
                first_name="Floor",
                last_name="Manager",
                is_staff=True,
            )
        else:
            u = User.objects.get(email="manager@mudcup.local")
            u.role = "MANAGER"
            u.is_staff = True
            u.set_password("manager123")
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

        self.stdout.write(self.style.SUCCESS("Seed OK — admin@mudcup.local / admin123, manager@mudcup.local / manager123"))
        self.stdout.write("Table 1 path (frontend): /t/table-1-demo-token")
