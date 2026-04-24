# MokshaVoice

A dream interpretation platform where customers submit voice/text dreams and decoders analyse and respond in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo SDK 53) |
| Backend | Fastify + TypeScript |
| Database | PostgreSQL (AWS RDS) |
| Cache / Queues | Redis + BullMQ |
| File Storage | AWS S3 + CloudFront |
| Auth | Firebase Phone Auth + JWT |
| Payments | RevenueCat (IAP) + Stripe |
| Real-time | Socket.io |
| ORM | Prisma |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
MokshaVoice/
├── apps/
│   ├── backend/          # Fastify API server
│   │   ├── prisma/       # Schema + migrations
│   │   └── src/
│   │       ├── routes/   # API route handlers
│   │       ├── services/ # Business logic
│   │       └── workers/  # BullMQ background jobs
│   └── mobile/           # Expo React Native app
│       ├── app/          # expo-router file-based routes
│       └── src/
│           ├── components/
│           ├── hooks/
│           ├── lib/
│           └── stores/
└── packages/
    └── shared-types/     # Shared TypeScript types
```

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ (or AWS RDS)
- Redis 7+
- Expo CLI (`npm install -g expo-cli`)
- AWS account (S3 + CloudFront configured)
- Firebase project (phone auth enabled)

---

## 1. Clone & Install

```bash
git clone https://github.com/krishnase/MokshaVoice.git
cd MokshaVoice
pnpm install
```

---

## 2. Backend Environment

Copy the example and fill in your values:

```bash
cp apps/backend/.env.example apps/backend/.env
```

### Required variables

```env
# App
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006

# Database (local)
DATABASE_URL=postgresql://mokshavoice:your_password@localhost:5432/mokshavoice

# Database (AWS RDS — production)
# DATABASE_URL=postgresql://mokshavoice:your_password@your-db.rds.amazonaws.com:5432/mokshavoice?sslmode=require

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT — generate two separate 32+ char random strings
JWT_SECRET=
JWT_REFRESH_SECRET=

# Firebase Admin SDK (from Firebase Console → Project Settings → Service Accounts)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# AWS
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
CLOUDFRONT_DOMAIN=
CLOUDFRONT_KEY_PAIR_ID=
CLOUDFRONT_PRIVATE_KEY=

# RevenueCat
RC_SECRET_API_KEY=
RC_WEBHOOK_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PREMIUM_MONTHLY_PRICE_ID=
STRIPE_PREMIUM_YEARLY_PRICE_ID=
```

---

## 3. Local Database Setup

```bash
# Start PostgreSQL and Redis (example with Docker)
docker run -d --name pg -e POSTGRES_USER=mokshavoice -e POSTGRES_PASSWORD=your_password -e POSTGRES_DB=mokshavoice -p 5432:5432 postgres:16
docker run -d --name redis -p 6379:6379 redis:7 redis-server --requirepass your_redis_password

# Run migrations
cd apps/backend
pnpm prisma migrate deploy

# (Optional) Open Prisma Studio
pnpm prisma studio
```

---

## 4. AWS RDS Setup (Production)

1. **Create RDS instance** — PostgreSQL 16, `db.t3.micro`, Public access: Yes
2. **Security group** — Add inbound rule: PostgreSQL port 5432, source: your IP
3. **Create database**
   ```bash
   psql -h your-db.rds.amazonaws.com -U mokshavoice -W -d postgres
   # inside psql:
   CREATE DATABASE mokshavoice;
   ```
4. **Update `DATABASE_URL`** in `.env` with RDS endpoint + `?sslmode=require`
5. **Run migrations**
   ```bash
   cd apps/backend
   pnpm prisma migrate deploy
   ```

---

## 5. AWS S3 + CloudFront Setup

1. Create an S3 bucket (private)
2. Create a CloudFront distribution pointing to the S3 bucket
3. Create a CloudFront key pair (for signed URLs) — save the private key
4. Fill in `S3_BUCKET_NAME`, `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY` in `.env`

---

## 6. Firebase Setup

1. Create a Firebase project, enable **Phone Authentication**
2. Download the **service account JSON** (Project Settings → Service Accounts → Generate new private key)
3. Copy `project_id`, `client_email`, and `private_key` into `.env`
4. For Android: download `google-services.json` → place in `apps/mobile/`
5. For iOS: download `GoogleService-Info.plist` → place in `apps/mobile/`

---

## 7. Mobile Environment

```bash
cp apps/mobile/.env.example apps/mobile/.env  # if applicable
```

Key Expo public vars in `apps/mobile/app.json` / `.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000        # local
EXPO_PUBLIC_SOCKET_URL=http://localhost:3000     # local
EXPO_PUBLIC_RC_IOS_KEY=                         # RevenueCat iOS key
EXPO_PUBLIC_RC_ANDROID_KEY=                     # RevenueCat Android key
```

---

## 8. Running Locally

### Backend

```bash
cd apps/backend
pnpm dev
```

Server starts on `http://localhost:3000`.

### Mobile

```bash
cd apps/mobile
pnpm start
```

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go for physical device

---

## 9. User Roles

| Role | Access |
|---|---|
| `CUSTOMER` | Submit dreams, chat with decoder |
| `DECODER` | View queue, claim/assign dreams, send voice/text replies |
| `MENTOR` | Same as Decoder |
| `ADMIN` | All of the above + user management dashboard |

Non-customer roles can switch between modes (Customer / Decoder / Admin) from the **Mode Select** screen after login.

---

## 10. Background Jobs (BullMQ)

| Job | Trigger | Purpose |
|---|---|---|
| `auto-assign` | New session created | Auto-assigns to previous decoder for that customer |
| `auto-assign-sweep` | Every 2 minutes | Catches any unassigned sessions |
| `quota-reset` | Scheduled | Resets monthly dream quota |
| `audio-cleanup` | Scheduled | Removes expired S3 audio files |

---

## 11. Key API Endpoints

```
POST   /v1/auth/send-otp
POST   /v1/auth/verify-otp
GET    /v1/sessions              # customer's own sessions
POST   /v1/sessions              # create new session
GET    /v1/sessions/:id
POST   /v1/sessions/:id/messages
PATCH  /v1/sessions/:id/claim
PATCH  /v1/sessions/:id/assign
PATCH  /v1/sessions/:id/reassign
PATCH  /v1/sessions/:id/unclaim
PATCH  /v1/sessions/:id/complete
GET    /v1/decoder/queue
GET    /v1/decoder/my-sessions
GET    /v1/decoder/team
GET    /v1/admin/stats
GET    /v1/admin/users
GET    /v1/admin/dreams
```

---

## 12. Database Migrations

```bash
# Create a new migration after schema changes
cd apps/backend
pnpm prisma migrate dev --name describe_your_change

# Apply migrations (CI / production)
pnpm prisma migrate deploy
```
