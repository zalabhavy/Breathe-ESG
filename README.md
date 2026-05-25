# Breathe ESG — Emissions Ingestion Platform

A Django REST + React prototype that ingests emissions data from three enterprise source types, normalizes it, and surfaces a review dashboard for analyst sign-off before audit.

## Architecture

```
React (Vite)  ──→  Django REST Framework  ──→  PostgreSQL/SQLite
   Upload UI         Parsers & API              Normalized records
   Review Dashboard  Audit trail                Multi-tenant
```

## Data Sources

| Source | Format | Scope | Ingestion |
|--------|--------|-------|-----------|
| SAP Fuel & Procurement | Semicolon-delimited flat file (SE16 export) | Scope 1 | File upload |
| Utility Electricity | CSV from utility portal | Scope 2 | File upload |
| Corporate Travel | CSV from Concur/Navan export | Scope 3 | File upload |

## Local Development

### Backend
```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r ../requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to Django at `localhost:8000`.

## Sample Data

Pre-built sample files are in `backend/sample_data/`:
- `sap_fuel_export.csv` — SAP MM flat file with German headers and number formatting
- `utility_electricity.csv` — Utility portal CSV with multiple meters and billing periods
- `corporate_travel.csv` — Concur-style travel expense export

## Key Documentation

- [MODEL.md](MODEL.md) — Data model design and rationale
- [DECISIONS.md](DECISIONS.md) — Every ambiguity resolved and why
- [TRADEOFFS.md](TRADEOFFS.md) — What I deliberately did not build
- [SOURCES.md](SOURCES.md) — Research on each data source format

## Deployment

Configured for Render via `render.yaml`. Set environment variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY` — Django secret key
- `DEBUG=false`
- `ALLOWED_HOSTS` — your domain
