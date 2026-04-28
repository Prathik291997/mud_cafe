from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/login/", views.StaffTokenView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", views.MeView.as_view()),
    path("payment-config/", views.PaymentConfigView.as_view()),
    path("menu/", views.PublicMenuView.as_view()),
    path("menu/<int:pk>/image/", views.MenuItemImageView.as_view()),
    path("announcements/", views.PublicAnnouncementsView.as_view()),
    path("tables/by-token/<slug:token>/", views.TableByTokenView.as_view()),
    path("orders/", views.CreateOrderView.as_view()),
    path("orders/<int:pk>/", views.OrderDetailView.as_view()),
    path("orders/<int:pk>/pay/", views.PayOrderView.as_view()),
    path("admin/tables/", views.AdminTablesListCreateView.as_view()),
    path("admin/tables/<int:pk>/", views.AdminTableDetailView.as_view()),
    path("admin/tables/<int:pk>/qr.png/", views.AdminTableQrPngView.as_view()),
    path("admin/tables/<int:pk>/qr-upload/", views.AdminTableQrUploadView.as_view()),
    path("admin/tables/<int:pk>/qr-clear/", views.AdminTableQrClearView.as_view()),
    path("admin/menu/", views.AdminMenuListCreateView.as_view()),
    path("admin/menu/<int:pk>/", views.AdminMenuDetailView.as_view()),
    path("admin/orders/", views.AdminOrdersView.as_view()),
    path("admin/stats/", views.AdminStatsView.as_view()),
    path("admin/payments/", views.AdminPaymentsView.as_view()),
    path("admin/offers/", views.AdminOffersView.as_view()),
    path("admin/offers/<int:pk>/", views.AdminOfferDetailView.as_view()),
    path("admin/offers/<int:pk>/release/", views.AdminOfferReleaseView.as_view()),
    path("admin/combos/", views.AdminCombosView.as_view()),
    path("admin/combos/<int:pk>/", views.AdminComboDetailView.as_view()),
    path("admin/combos/<int:pk>/announce/", views.AdminComboAnnounceView.as_view()),
    path("manager/orders/", views.ManagerOrdersView.as_view()),
    path("manager/orders/<int:pk>/eta/", views.ManagerEtaView.as_view()),
    path("notifications/staff/", views.StaffNotificationsView.as_view()),
    path("reviews/", views.ReviewCreateView.as_view()),
    path("subscribe/", views.SubscribeView.as_view()),
]
