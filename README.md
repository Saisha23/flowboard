# Flowboard

Flowboard is a collaborative project-management app that combines Kanban boards with evidence-based delivery-risk signals. It helps teams see work that is overdue, approaching deadlines, stalled, blocked, or concentrated on one assignee before those signals become delivery surprises.

## Features

- **Workspaces and boards:** View and manage existing workspaces, boards, and lists, and collaborate with workspace roles. Board creation is implemented; the backend currently blocks workspace creation until its existing Supabase INSERT policies are verified.
- **Task management:** Create and edit tasks, set priorities and due dates, assign teammates, apply labels, and link blocking dependencies.
- **Dependency validation:** The backend verifies that referenced tasks, labels, assignees, and lists belong to the relevant board or workspace. Database functions and triggers reject invalid and cyclic task dependencies.
- **AI-powered Board Insights:** Generate a structured board summary with an executive summary, project overview, completed and pending work, blockers, recommendations, and a confidence value. The backend sends board/task evidence to a configurable OpenAI-compatible Chat Completions endpoint.
- **PDF export:** Build a self-contained printable summary in a separate browser window. Use the browser print dialog to save it as a PDF; pop-ups must be allowed.
- **Commitment Drift Radar:** Calculate a deterministic score from board risks and display contributing factors and task evidence. The score is computed from current board data; evaluation does not write a drift snapshot.
- **Workload distribution:** Show open and overdue task counts by assignee.
- **Evidence-based recovery recommendations:** Generate deterministic actions from measured risk factors and linked task evidence. These are identified as evidence-based, not AI-generated.
- **Activity history:** Display available activity records in chronological order and show an explicit empty state when none are available.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, dnd-kit, Framer Motion, Lucide React |
| Backend | Python, FastAPI, Pydantic Settings, HTTPX, PyJWT |
| Database and authentication | Supabase Auth and PostgreSQL, accessed through the Supabase Data API with user-scoped JWTs and existing row-level security |
| AI | Configurable OpenAI-compatible Chat Completions API; AI credentials are server-side only |

## Architecture

```text
React / TypeScript browser app
  ├─ Supabase Auth session
  └─ FastAPI requests with the user's bearer token
       ├─ verifies JWT issuer, audience, expiry, signature, and allowed algorithm
       ├─ calls Supabase Data API as that user (RLS remains authoritative)
       └─ calls the configured AI provider for structured board summaries
```

The browser uses the Supabase publishable/anon key for authentication; it does not use a service-role key. The FastAPI Supabase client forwards the authenticated user's token rather than using a shared service-role credential.

## Project structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/                 # Authentication and request dependencies
│   │   ├── core/                # Backend settings
│   │   ├── services/            # Supabase Data API and AI provider clients
│   │   └── main.py              # FastAPI routes and analytics
│   ├── tests/                   # Backend API and schema regressions
│   ├── .env.example
│   └── requirements.txt
├── public/                      # Static assets
├── src/
│   ├── components/              # Auth, board, shared, and UI components
│   ├── hooks/                   # Application state and auth lifecycle
│   ├── layouts/                 # Application shell
│   ├── lib/                     # API, Supabase client, PDF export, utilities
│   ├── pages/                   # Routed application pages and UI tests
│   ├── services/                # Frontend API mapping and service tests
│   └── types/                   # Shared frontend types
├── supabase/
│   ├── migrations/              # Ordered database SQL migrations
│   ├── manual/                  # Review-only SQL; see its safety header
│   └── task_persistence_readonly_diagnostic.sql
├── .env.example
├── package.json
└── vite.config.ts
```

## Prerequisites

- Node.js and npm
- Python 3.10 or later
- A Supabase project configured for the database schema and authentication used by this application
- An AI API key only if AI Board Insights are needed

## Local setup

From the project root, copy the example files and install frontend dependencies:

```powershell
Copy-Item .env.example .env.local
Copy-Item backend\.env.example backend\.env
npm install
```

Create and activate a Python environment, then install backend dependencies:

```powershell
Set-Location backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Set-Location ..
```

For macOS/Linux, activate the environment with `source backend/.venv/bin/activate` after creating it from the project root.

Fill in the copied environment files using the placeholders below. Do not commit the filled-in files.

### Frontend environment (`.env.local`)

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_API_URL=http://localhost:8000
```

The Vite variables are available to browser code. Use only a Supabase publishable/anon key here—never a service-role key or AI key.

### Backend environment (`backend/.env`)

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_JWT_SECRET=
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_AUDIENCE=authenticated
JWT_ISSUER=
JWT_ALGORITHMS=ES256,RS256,HS256

AI_PROVIDER=openai
AI_API_KEY=YOUR_AI_API_KEY
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
AI_TIMEOUT_SECONDS=20
```

`SUPABASE_JWT_SECRET` is needed only for legacy HS256 tokens; asymmetric ES256/RS256 tokens are verified through Supabase JWKS. Leave optional values empty or use the configured defaults when they are not needed. The API accepts only the configured JWT issuer, audience, and algorithm allow-list. The currently implemented AI provider is `openai` with an OpenAI-compatible Chat Completions API.

## Run locally

Start the backend from the `backend` directory:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend from the project root in another terminal:

```powershell
npm run dev
```

Vite prints the local frontend URL. FastAPI's interactive API documentation is available at `http://localhost:8000/docs` while the backend is running.

## Production deployment configuration

### Vercel frontend

The root `vercel.json` configures `npm run build`, the `dist` output directory, and SPA rewrites for the application routes. These rewrites do not proxy API calls or rewrite Vite asset paths.

Set these Vercel build environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key only)
- `VITE_API_URL` (the deployed backend origin)

The localhost API fallback is development-only. A production build without `VITE_API_URL` reports an explicit configuration error instead of sending API requests to localhost. Vite variables are included in browser code; do not put service-role keys, JWT secrets, or AI provider credentials in them.

### Render backend

The root `render.yaml` defines the backend service root, dependency installation, Uvicorn command, and `/health` liveness check. Configure its `sync: false` environment variables in Render's dashboard:

- Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `CORS_ORIGINS`.
- `CORS_ORIGINS` must be a comma-separated list of exact frontend origins (scheme and host, optional port), without paths or wildcards.
- `JWT_AUDIENCE` and `JWT_ALGORITHMS` use the Supabase defaults in `render.yaml`; override `JWT_ISSUER` only if the Auth issuer differs from the project URL.
- `SUPABASE_JWT_SECRET` is needed only for legacy HS256 tokens.
- For AI summaries, configure `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` in Render. For Groq's OpenAI-compatible API, keep `AI_PROVIDER=openai` and supply the Groq-compatible base URL and model in the dashboard. `AI_TIMEOUT_SECONDS` defaults to 20.

Render provides `PORT`; Uvicorn binds to `0.0.0.0` and uses that value. `/health` is a liveness check and does not verify Supabase connectivity or credentials.

### Supabase Auth

Set the Supabase Site URL to the deployed frontend origin and add the exact signup redirect (`/login`) and password-reset redirect (`/reset-password`) URLs to the Auth redirect allowlist. The frontend builds those redirects from `window.location.origin`; configure preview origins only if they are intentionally supported.

Deployment configuration does not apply database migrations. Review the existing project's schema and RLS policies before making any database changes.

## Tests and checks

Run frontend tests, TypeScript checking, and a production build from the project root:

```powershell
npm test
npm run typecheck
npm run build
```

Run backend tests from the project root:

```powershell
Set-Location backend
python -m pytest -q
Set-Location ..
```

## Database migrations

Review the SQL and the target Supabase project's current schema and RLS policies before applying migrations. The repository does not configure an automatic migration runner, and the migration set is not a blank-database bootstrap: later task migrations depend on existing objects such as `board_lists`, `task_assignees`, `task_labels`, `task_dependencies`, `labels`, and `has_board_role`. Confirm all prerequisites and permissions in a non-production environment first. Apply the numbered files from `supabase/migrations/` in order:

1. `202611180001_phase1_auth_database.sql`
2. `202611180002_phase2_profile_membership_visibility.sql`
3. `202611180003_phase3_activity_events.sql`
4. `202611180004_phase4_security_hardening.sql`
5. `202611200001_create_task_with_relationships.sql`
6. `202611210001_save_task_with_relationships.sql`

The file `supabase/manual/flowboard_schema_compatibility_rpcs.sql` is explicitly marked **review copy only—do not apply**. `supabase/task_persistence_readonly_diagnostic.sql` is read-only and does not apply or change schema.

**Activity schema note:** The backend reads activity from an existing `public.activities` table using `id`, `board_id`, `task_id`, `actor_id`, `event_type`, `description`, `metadata`, and `created_at`. The checked-in Phase 3 migration defines `public.activity_events` instead. These are not interchangeable: applying the migration does not create `public.activities`. If that existing table is absent or has no rows visible to the user, the API returns an empty activity list and the UI displays its empty state. No table or RLS policy is created automatically by the application.

## Security considerations

- Keep `.env`, `.env.local`, and `backend/.env` out of Git. The checked-in example files contain placeholders only.
- Treat the Supabase publishable/anon key as public configuration, not as authorization. Never put Supabase service-role keys, JWT signing secrets, or AI provider keys in Vite variables.
- The backend verifies user JWTs and forwards the user's token to Supabase so database access remains subject to existing RLS.
- Do not disable RLS to make an endpoint work. Review each migration and its effects in a non-production environment before applying it.
- Board task text is untrusted input to the AI provider; generated summaries should be reviewed before external sharing.
- PDF export opens a new window. Users must allow pop-ups and choose the browser's save-to-PDF option.
