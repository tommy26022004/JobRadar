# JobRadar — Kế hoạch 4 tuần

## Mục tiêu
Paste job URL → AI tự parse JD → match với CV → chấm điểm fit → gợi ý customize CV → track toàn bộ application pipeline.

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui |
| Backend | FastAPI + Python |
| AI Agent | LangGraph + GPT-4o |
| Database | PostgreSQL (Docker local → Railway production) |
| Deploy | Vercel (Frontend) + Railway (Backend + DB) |

---

## Tuần 1 — Backend Foundation
**Mục tiêu:** API chạy được, DB có data, auth hoạt động

- [ ] Setup project structure: `jobradar-backend/` + `jobradar-frontend/`
- [ ] Docker Compose: FastAPI + PostgreSQL chạy local 1 lệnh
- [ ] Database schema: `users`, `jobs`, `applications`
- [ ] JWT auth: register, login, refresh token
- [ ] API endpoints cơ bản: CRUD cho job applications
- [ ] Test manual toàn bộ endpoints bằng Thunder Client

**Deliverable:** Postman/Thunder Client collection chạy được hết, DB có data thật

---

## Tuần 2 — AI Core
**Mục tiêu:** Paste URL → AI hiểu JD → match CV → cho điểm

- [ ] Web scraper: fetch raw HTML từ job URL (BeautifulSoup)
- [ ] LangGraph agent pipeline:
  - Node 1: Parse JD → extract title, company, stack, requirements, salary
  - Node 2: So sánh với CV của user → tính match score
  - Node 3: Generate gợi ý customize CV
- [ ] Streaming response (user thấy AI đang "suy nghĩ")
- [ ] Lưu kết quả parse vào PostgreSQL
- [ ] Test với 10 job URL thật từ WeWorkRemotely

**Deliverable:** Paste link → 30 giây sau có analysis + score

---

## Tuần 3 — Frontend
**Mục tiêu:** UI đẹp, dùng được, demo được

- [ ] Auth pages: Login / Register
- [ ] Dashboard: Kanban board — `Saved → Applied → Interview → Offer → Rejected`
- [ ] Job detail page: hiển thị AI analysis, match score, gợi ý CV
- [ ] Add job flow: paste URL → loading animation → kết quả stream ra
- [ ] CV upload: user upload PDF CV một lần, lưu để AI dùng
- [ ] Mobile responsive

**Deliverable:** Full flow chạy end-to-end, manual test sạch

---

## Tuần 4 — Polish + Deploy
**Mục tiêu:** Live link, README xịn, ready để paste vào CV

- [ ] Deploy backend lên Railway + PostgreSQL Railway
- [ ] Deploy frontend lên Vercel
- [ ] Seed demo account (recruiter login vào test ngay không cần register)
- [ ] README: GIF demo, tech stack badge, live link, hướng dẫn run local
- [ ] E2E test toàn bộ happy path
- [ ] Update CV + portfolio với project này

**Deliverable:** `jobradar.vercel.app` chạy live, README đẹp

---

## Kết quả kỳ vọng
```
GitHub repo với:
✓ Clean commit history
✓ Live demo link
✓ README có GIF demo
✓ Docker Compose để run local
✓ LangGraph + GPT-4o + FastAPI + Next.js + PostgreSQL
```
