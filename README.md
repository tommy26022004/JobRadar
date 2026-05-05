# JobRadar

AI-powered job application tracker. Paste a job description → AI parses it, scores it against your CV, suggests improvements → track every application in a Kanban board.

![Tech Stack](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi)
![Tech Stack](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![Tech Stack](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Tech Stack](https://img.shields.io/badge/Groq-Llama_3.1-orange)
![Tests](https://img.shields.io/badge/backend_tests-42_passing-brightgreen)
![Tests](https://img.shields.io/badge/e2e_tests-19_passing-brightgreen)

## Live Demo

> **[jobradar.vercel.app](https://jobradar.vercel.app)** — try with demo account below

| Field | Value |
|---|---|
| Email | `demo@jobradar.dev` |
| Password | `Demo1234!` |

## Features

- **AI Job Analysis** — paste any job description, get parsed title/company/tech stack + match score against your CV
- **Discover Jobs** — scan 5 remote job boards (WeWorkRemotely, RemoteOK, Remotive, Jobicy, Arbeitnow) simultaneously, AI ranks by CV match
- **Auto-scan** — runs every 4 hours in background, feeds "New Matches For You" panel on Dashboard
- **Kanban Board** — drag-and-drop pipeline: Saved → Applied → Interview → Offer → Rejected
- **Multiple CVs** — upload several CV variants, pick which one to match per job
- **Custom RSS** — add any RSS job feed URL to Discover scan

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 + Tailwind CSS + shadcn/ui |
| Backend | FastAPI + Python 3.12 |
| AI | Groq Llama 3.1 8B Instant (free tier) |
| Database | PostgreSQL 16 + SQLAlchemy 2 + Alembic |
| Auth | JWT (access + refresh tokens) |
| Deploy | Vercel (frontend) + Railway (backend + DB) |
| Tests | pytest (42 tests) + Playwright E2E (19 tests) |

## Run Locally

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/tommy26022004/JobRadar.git
cd JobRadar

# Copy env and add your Groq API key (free at console.groq.com)
cp jobradar-backend/.env.example jobradar-backend/.env
# Edit .env and set GROQ_API_KEY=gsk_...

# Start everything
docker compose up --build

# Seed demo account (optional)
docker compose exec backend python scripts/seed_demo.py
```

Frontend: http://localhost:3000  
Backend API docs: http://localhost:8000/docs

## Environment Variables

### Backend (`jobradar-backend/.env`)

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/jobradar
SECRET_KEY=your-secret-key-min-32-chars
GROQ_API_KEY=gsk_...
ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

### Frontend (`jobradar-frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## Deploy

### Railway (Backend)

1. Create new project on [railway.app](https://railway.app)
2. Add PostgreSQL plugin
3. Connect this GitHub repo, set root to `/` and use `railway.toml`
4. Set environment variables (see above), with `DATABASE_URL` from Railway PostgreSQL
5. Railway auto-builds and runs migrations on deploy

### Vercel (Frontend)

1. Import repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `jobradar-frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app/api`
4. Deploy

## Project Structure

```
JobRadar/
├── jobradar-backend/
│   ├── app/
│   │   ├── api/          # FastAPI routers (auth, jobs, cvs, discover, ...)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── core/         # DB, security, config
│   │   └── agents/       # RSS fetchers, AI scoring
│   ├── alembic/          # DB migrations
│   ├── tests/            # pytest (42 tests)
│   └── scripts/          # seed_demo.py
├── jobradar-frontend/
│   ├── app/              # Next.js app router pages
│   ├── components/       # UI components
│   ├── lib/              # API client, auth context, scan context
│   └── e2e/              # Playwright tests (19 tests)
├── docker-compose.yml
└── railway.toml
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login → JWT tokens |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/cvs/` | List / create CVs |
| GET/POST | `/api/jobs/` | List / create jobs |
| POST | `/api/analyze/` | AI analyze JD (streaming SSE) |
| POST | `/api/discover/start` | Hard scan (100 jobs/source) |
| POST | `/api/discover/auto` | Auto-scan with cooldown |
| GET | `/api/discover/feed` | Today's matched jobs feed |
| GET | `/api/dashboard/stats` | Dashboard statistics |

Full interactive docs at `/docs` (Swagger UI).
