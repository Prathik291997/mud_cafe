# Mudcup — agent notes

- **Frontend**: `frontend/` — React 19 + Vite + TypeScript + React Router. API base URL: `VITE_API_URL` (default `http://127.0.0.1:8000/api`).
- **Backend**: `backend/` — Django 5 + Django REST Framework + SimpleJWT. Run `python manage.py runserver` from `backend/` after `migrate` and `seed_demo`.
- Staff auth: `POST /api/auth/login/` with `{"email","password"}`; send `Authorization: Bearer <access>` on protected routes.
