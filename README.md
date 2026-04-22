# Triune Takeoff Haldeman (Vercel)

HVAC takeoff conversion tool — rewritten from the Streamlit app for Vercel deployment.

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind
- **Backend**: Python serverless functions (`api/*.py`) using pandas + openpyxl
- **Auth**: JWT in httpOnly cookie, single admin account via env vars

## Features

- Upload CSV/Excel takeoff → auto-detect column mapping
- Manual product ordering and per-product tag ordering (textarea)
- HVAC cross-reference lookup (62 brands, 1,174 equivalency groups)
- Per-product XBRAND override with multi-model pick
- Styled Excel output (header/product/zebra fills, zoom 80%, two sheets)
- Data Unit Sheet builder (raw takeoff × unit matrix multiplier)

## Local development

```bash
# One-time install
npm install
python -m pip install -r requirements.txt

# Copy env template and fill in
cp .env.example .env.local

# Run both servers concurrently
npm run dev
```

This starts:
- Next.js on `http://localhost:3000`
- Python dev API on `http://localhost:3001` (proxied from `/api/*` in dev)

## Deployment

On Vercel, the `api/*.py` files become Python serverless functions automatically
(no dev proxy needed). Set `AUTH_SECRET`, `APP_USERNAME`, and `APP_PASSWORD`
under Project Settings → Environment Variables.

## Project structure

```
app/                    Next.js App Router (UI + auth routes)
  login/page.tsx        Login page
  api/auth/             Login / logout endpoints
  page.tsx, layout.tsx  Main app shell
components/             React components (TakeoffTab, DataUnitTab, AppShell)
lib/                    Auth helpers, constants, client utilities
api/                    Vercel Python serverless functions
  _lib/                 Shared Python helpers (parsing, grouping, styling, crossref)
  parse.py              File upload → auto-detect mapping
  generate-takeoff.py   Main takeoff Excel generation
  generate-data-unit.py Data unit sheet generation
  crossref-lookup.py    Per-row XMODEL lookup
scripts/dev-server.py   Local Python dev API (not used in production)
middleware.ts           Route protection (JWT)
requirements.txt        Python deps
vercel.json             Function memory / duration config
```
