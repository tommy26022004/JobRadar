# How to Run JobRadar Locally

## Prerequisites
- Docker + Docker Compose
- Node.js 20+ (chỉ cần nếu chạy frontend ngoài Docker)
- Python 3.12+ (chỉ cần nếu chạy backend ngoài Docker)

---

## Chạy với Docker (khuyên dùng)

### Lần đầu setup
```bash
# 1. Clone repo
git clone https://github.com/tommy26022004/JobRadar.git
cd JobRadar

# 2. Tạo file .env cho backend
cp jobradar-backend/.env.example jobradar-backend/.env
# Mở .env và điền GROQ_API_KEY=gsk_...

# 3. Build và start toàn bộ
docker compose up --build -d

# 4. (Optional) Seed demo account
docker compose exec backend python scripts/seed_demo.py
```

### Start / Stop / Restart
```bash
# Start (lần đầu hoặc sau khi stop)
docker compose up -d

# Stop (giữ data)
docker compose down

# Restart toàn bộ
docker compose down && docker compose up -d

# Restart 1 service cụ thể
docker compose restart backend
docker compose restart frontend
docker compose restart db

# Rebuild + restart (sau khi thay đổi code backend/frontend)
docker compose up --build -d

# Rebuild 1 service cụ thể
docker compose up --build -d backend
docker compose up --build -d frontend
```

### Xem logs
```bash
# Tất cả services
docker compose logs -f

# Từng service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

### Xem trạng thái containers
```bash
docker compose ps
```

---

## URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

---

## Database

### Chạy migration thủ công
```bash
docker compose exec backend alembic upgrade head
```

### Tạo migration mới (sau khi thay đổi model)
```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

### Xem lịch sử migration
```bash
docker compose exec backend alembic history
```

### Vào PostgreSQL shell
```bash
docker compose exec db psql -U postgres -d jobradar
```

### Reset database hoàn toàn (xóa hết data)
```bash
docker compose down -v        # xóa cả volume
docker compose up -d          # tạo lại từ đầu
docker compose exec backend alembic upgrade head
```

---

## Tests

### Backend (pytest)
```bash
# Chạy trong Docker
docker compose exec backend pytest tests/ -v

# Chạy local (cần Python env)
cd jobradar-backend
pip install -r requirements.txt
pytest tests/ -v
```

### Frontend E2E (Playwright)
```bash
# Đảm bảo Docker đang chạy trước
cd jobradar-frontend
npx playwright test

# Chạy với UI browser (headed)
npx playwright test --headed

# Chạy 1 file test cụ thể
npx playwright test e2e/auth.spec.ts

# Xem report
npx playwright show-report
```

---

## Dev Mode (ngoài Docker)

### Backend
```bash
cd jobradar-backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # điền GROQ_API_KEY
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd jobradar-frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local
npm run dev
```

---

## Demo Account
```
Email:    demo@jobradar.dev
Password: Demo1234!
```
Tạo bằng: `docker compose exec backend python scripts/seed_demo.py`
