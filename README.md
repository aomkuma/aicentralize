# AI Centralize - Meeting Minute Intelligence Platform

ระบบคลังข้อมูล minute meeting แบบรวมศูนย์สำหรับองค์กร พร้อม AI query และระบบแจ้งเตือนงานที่ได้รับมอบหมาย

## Core Capabilities

- จัดเก็บ minute meeting แยกตาม project และ session
- เก็บ action item พร้อม assignee และ due date
- ค้นหา/ถามตอบข้อมูลด้วย endpoint `/ai/ask` จากข้อมูลที่เก็บแล้ว
- แจ้งเตือนงาน `upcoming` และ `overdue` อัตโนมัติผ่าน scheduler
- แจ้งเตือนผ่านอีเมล (SMTP) เมื่อมีงานใกล้ครบกำหนดหรือเกินกำหนด
- ค่าเริ่มต้นช่องทางแจ้งเตือนเป็น In-app (email/push ปิดไว้จนกว่าจะเปิดเอง)
- รองรับ role-based access: `ADMIN`, `PM`, `MEMBER`

## Architecture (MVP)

- API: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- AI Retrieval: keyword/full-text retrieval layer (vector-ready via `EmbeddingChunk`)
- Scheduler: node-cron (ตรวจงานตามคาบเวลา)
- Notification channel: In-app DB notification + SMTP email
- Auth: JWT

## Data Model Summary

- `User`: ผู้ใช้งานและบทบาท
- `Project`: โปรเจกต์
- `Meeting`: session ประชุม
- `MinuteEntry`: รายการบันทึกนาทีประชุม
- `ActionItem`: งานที่มอบหมายในที่ประชุม
- `Notification`: การแจ้งเตือนงาน
- `EmbeddingChunk`: ช่องสำหรับเก็บ embedding/vector ในอนาคต

## Quick Start

1. ติดตั้ง dependencies

```bash
npm install
```

2. สตาร์ทฐานข้อมูล PostgreSQL

```bash
docker compose up -d
```

3. ตั้งค่า env

```bash
copy .env.example .env
```

4. สร้าง Prisma client และ migrate

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

5. seed ข้อมูลตัวอย่าง

```bash
npm run prisma:seed
```

6. รันระบบ

```bash
npm run dev
```

7. ตั้งค่า SMTP เพื่อเปิดใช้งานอีเมลแจ้งเตือน

```bash
SMTP_HOST="smtp.your-org.local"
SMTP_PORT=587
SMTP_USER="smtp-user"
SMTP_PASS="smtp-pass"
SMTP_SECURE=false
MAIL_FROM="AI Centralize <noreply@your-org.local>"
```

- API base: `http://localhost:4000`
- Swagger UI: `http://localhost:4000/docs`

## Example Flow

1. Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "pm@org.local",
  "password": "Pm123456!"
}
```

2. สร้าง meeting minute

```http
POST /meetings
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "<project-id>",
  "title": "Weekly PM Sync",
  "sessionAt": "2026-06-20T09:00:00.000Z",
  "summary": "สรุปสถานะงานและประเด็นติดขัด",
  "minutes": [
    { "section": "Decision", "content": "เพิ่ม backup approver" }
  ],
  "actionItems": [
    {
      "task": "ส่งแผน mitigation",
      "assigneeId": "<user-id>",
      "dueDate": "2026-06-22T09:00:00.000Z"
    }
  ]
}
```

3. ถาม AI จาก minute ที่จัดเก็บ

```http
POST /ai/ask
Authorization: Bearer <token>
Content-Type: application/json

{ "question": "งานที่ยังไม่เสร็จของโปรเจกต์ Alpha มีอะไรบ้าง" }
```

4. ดูแจ้งเตือนของฉัน

```http
GET /notifications/me
Authorization: Bearer <token>
```

5. ตั้งค่าการแจ้งเตือนของฉัน

```http
GET /notifications/settings/me
Authorization: Bearer <token>
```

```http
PATCH /notifications/settings/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "inAppEnabled": true,
  "emailEnabled": false,
  "pushEnabled": false
}
```

- หน้า settings แบบง่าย: `GET /notifications/settings/page`

6. จัดการ Push subscription (สำหรับ PWA)

สร้าง VAPID keys อัตโนมัติ (one-shot setup)

```bash
npm run setup:push
```

ถ้าต้องการ regenerate ใหม่

```bash
npm run setup:push:force
```

หรือสร้างผ่าน API (เฉพาะ ADMIN)

```http
POST /notifications/push/generate-vapid
Authorization: Bearer <admin-token>
```

ส่ง broadcast push (เฉพาะ ADMIN)

```http
POST /notifications/push/broadcast
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "title": "System Notice",
  "message": "Maintenance starts at 22:00",
  "onlyPushEnabled": true
}
```

- หน้า Broadcast แบบง่าย: `GET /notifications/push/broadcast/page`

```http
GET /notifications/push/vapid-public-key
```

```http
GET /notifications/push-subscriptions/me
Authorization: Bearer <token>
```

```http
POST /notifications/push-subscriptions/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/fcm/send/....",
  "expirationTime": null,
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

```http
DELETE /notifications/push-subscriptions/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...."
}
```

หมายเหตุ: เวอร์ชันนี้รองรับการส่ง push จริงผ่าน `web-push` แล้วเมื่อกำหนดค่า `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

## HANDOVER

### Current Status

- Backend core stack is running on Node.js + Express + Prisma + PostgreSQL.
- Local PostgreSQL setup works with migrated schema and seeded demo data.
- Push notification flow is available (user subscription + admin broadcast).
- Local Ollama model `qwen2.5:7b` is installed and tested.

### New Features Delivered

- Notification settings per user with defaults:
  - `inAppEnabled=true`
  - `emailEnabled=false`
  - `pushEnabled=false`
- Push subscription endpoints:
  - `GET /notifications/push-subscriptions/me`
  - `POST /notifications/push-subscriptions/me`
  - `DELETE /notifications/push-subscriptions/me`
- Push broadcast endpoints/pages:
  - `POST /notifications/push/broadcast` (admin)
  - `GET /notifications/push/broadcast/page`
- AI playground:
  - `GET /ai/playground/page`
  - `POST /ai/playground/generate`

### Voice V1 (Playground)

- Browser recording is enabled from playground page.
- Recording is uploaded and stored at `uploads/recordings`.
- V1 speaker flow is manual tagging (A/B/C buttons while recording).
- Segment analysis route:
  - `POST /ai/playground/diarize-analyze`
- Recording routes:
  - `POST /ai/playground/record/upload`
  - `GET /ai/playground/recordings/:fileName`

### Known Limitations

- Speaker diarization is not fully automatic yet (manual A/B/C in V1).
- Auto speaker diarization (Whisper + pyannote) is planned for V2.
- Vitest may fail in this environment due to `tinypool spawn UNKNOWN` runtime issue.

### Runbook (Local)

1. `npm install`
2. Ensure PostgreSQL is running and `.env` has valid `DATABASE_URL`.
3. `npm run prisma:generate`
4. `npm run prisma:migrate -- --name init`
5. `npm run prisma:seed`
6. `npm run setup:push`
7. `npm run dev`

## Notes For Production

- ควรต่อ Notification channel จริง เช่น Email/Slack/LINE
- ควรเปลี่ยน retrieval เป็น hybrid search + vector DB
- ควรเพิ่ม audit log, SSO, tenancy isolation
- ควรตั้ง worker แยก process จาก API เพื่อทำ reminder และ AI indexing
