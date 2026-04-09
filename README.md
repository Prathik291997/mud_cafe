# Mudcup

Café stack: **React (Vite)** frontend and **Django REST** backend. Table QR ordering, payments, manager ETA, admin reports, offers, and email subscribers.

## Prerequisites

- Python 3.11+ (3.14 works here with Django 5.2)
- Node.js 20+

## Backend (Django)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # optional
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

API base: `http://127.0.0.1:8000/api/`

- JWT login: `POST /api/auth/login/` with JSON `{"email":"...","password":"..."}` (field name is `email`).
- Adjust `CORS_ALLOWED_ORIGINS` in `.env` if the React dev server uses another port.

### Demo accounts

| Role    | Email                 | Password   |
|---------|----------------------|------------|
| Admin   | `admin@mudcup.local` | `admin123` |
| Manager | `manager@mudcup.local` | `manager123` |

### Customer flow (app)

1. Home → **Customer** → allow camera → scan **table QR** (opens menu for that table).
2. Add items → **Review order** → **Continue to payment** (order is created server-side).
3. **Scan the payment QR** with your UPI app (or pay using the UPI ID), then tap **I’ve paid — confirm order**.
4. Leave a review / offer opt-in if you like.

Configure the payment QR: set **`MUDCUP_UPI_PA`** (and optionally **`MUDCUP_UPI_PAYEE_NAME`**) in the Django environment, or **`VITE_UPI_PA`** on the frontend build. Without this, the app shows manual-pay instructions only.

### Table ordering QRs (admin)

In **Admin → Tables & QR codes** you can add tables (Table 1, 2, 3, …), **download/preview a QR** that encodes `{FRONTEND_PUBLIC_URL}/t/{token}`, or **upload your own QR image** (e.g. from a designer). Set **`FRONTEND_PUBLIC_URL`** in the Django `.env` to your live customer site so printed codes open the correct host. Orders still use the same `qr_token` → correct table in the API.

## Frontend (React + Vite)

```bash
cd frontend
npm install
copy .env.example .env          # optional; default API is http://127.0.0.1:8000/api
npm run dev
```

Open `http://localhost:5173`.

If port **8000** is already used on your machine (common on Windows), run Django on another port, e.g. `runserver 8080`, and set:

```env
VITE_API_URL=http://127.0.0.1:8080/api
```

## Root shortcuts (optional)

From the repo root:

```bash
npm run dev:api    # Django on 8000
npm run dev:web    # Vite on 5173
npm run build:web  # production build → frontend/dist
```

## Project layout

- `backend/` — Django project `mudcup`, app `cafe`, SQLite `db.sqlite3`
- `frontend/` — React SPA, calls the API with `Authorization: Bearer <access>`

Offer emails use Django’s email backend (console in dev). Configure SMTP via `EMAIL_*` settings in `mudcup/settings.py` / environment as needed.
