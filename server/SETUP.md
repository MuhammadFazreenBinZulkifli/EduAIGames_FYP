# Setup Instructions

## Prerequisites
- PostgreSQL installed and running
- Node.js installed (v18+ recommended)
- npm installed
- SMTP email account (for OTP and password reset)

## Step 1: Install Dependencies

```bash
cd server
npm install
```

## Step 2: Configure Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required variables:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Step 3: Start Backend

```bash
npm run dev
```

Server runs on `http://localhost:5000`.

## Step 4: Start Frontend

```bash
cd ../EduAIGames
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## Step 5: Email Service Test

Use API to test SMTP:

```bash
curl -X POST http://localhost:5000/api/auth/email-service-test \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"your_email@example.com\"}"
```

Expected response:

```json
{ "message": "Test email sent to your_email@example.com" }
```

If this works, registration OTP and forgot-password OTP will also work.

## OTP Flows Enabled

- Registration now uses:
  - `POST /api/auth/register/request-otp`
  - `POST /api/auth/register/verify-otp`
- Forgot password now uses:
  - `POST /api/auth/password-reset/request`
  - `POST /api/auth/password-reset/verify`

## Troubleshooting

**Email errors**
- Verify `SMTP_*` credentials and host/port.
- For Gmail, use an App Password (not normal account password).

**DB connection errors**
- Make sure PostgreSQL is running.
- Verify `DB_*` values in `.env`.

**Port in use**
- Change `PORT` in `.env` or stop process using the port.
