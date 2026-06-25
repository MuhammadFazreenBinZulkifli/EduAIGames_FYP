# Deploying EduAIGames to Render (via GitHub)

This repo ships a [`render.yaml`](./render.yaml) blueprint, so Render can create
the database, the web service, and a persistent disk for you in one step.

---

## 1. Push the code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

> Create the empty repo first at https://github.com/new (no README/.gitignore —
> this project already has them), then run the commands above.

Secrets are safe: `.gitignore` excludes `.env` files, `node_modules/`, build
output, and `server/uploads/`.

---

## 2. Deploy on Render (Blueprint)

1. Go to the [Render Dashboard](https://dashboard.render.com) -> **New -> Blueprint**.
2. Connect your GitHub account and pick this repo.
3. Render reads `render.yaml` and shows the plan: a **PostgreSQL** database +
   a **Docker web service** with a 1 GB disk. Click **Apply**.
4. Wait for the first build/deploy to finish (watch the logs). On first boot the
   server runs `setupDatabase()` and creates all tables automatically.

### After the first deploy — set the public URL
The app needs to know its own URL for CORS and email links.

1. Copy your service URL, e.g. `https://eduaigames.onrender.com`.
2. In the service -> **Environment**, set `FRONTEND_URL` to that URL.
3. (Optional) Also fill in `OPENAI_API_KEY` and the `SMTP_*` values for AI
   features and email.
4. Saving env vars triggers an automatic redeploy.

---

## Why these settings?

- **`DB_NAME` is auto-set to Render's database name.** The startup code only
  *creates* the DB if it's missing; since Render already created it, the app
  just creates its tables inside it. (Render roles can't run `CREATE DATABASE`.)
- **`DB_SSL=false`** because the DB and web service are in the same region and
  use Render's internal (private) network. If you ever connect from outside
  Render, set `DB_SSL=true`.
- **Persistent disk at `/app/server/uploads`** keeps uploaded class materials
  across deploys. (Without a disk, Render's filesystem is wiped on every deploy.)
- **Health check `/api/health`** lets Render verify the service is up.

---

## Plans & cost

- The **disk requires a paid web service** (Starter, ~$7/mo). That's why
  `render.yaml` sets `plan: starter`.
- The **free PostgreSQL plan expires after ~30 days** — upgrade for production.
- **Want it fully free instead?** In `render.yaml`, change the web service to
  `plan: free` and delete the `disk:` block. Uploaded files will then be lost on
  each deploy, but quizzes/games still work.

---

## 3. Updating the site after it's live

Render auto-deploys on every push to `main`:

```bash
# make changes locally, test with: docker compose up --build
git add .
git commit -m "Describe your change"
git push
```

Render rebuilds the Docker image and does a zero-downtime rolling deploy.

- **Schema changes:** adding tables/columns applies automatically on the next
  deploy (startup uses `CREATE TABLE IF NOT EXISTS`). Destructive changes
  (drops/renames/type changes) must be run manually via `psql`.
- **Rollback:** the **Deploys** tab can instantly roll back to a previous build.
- **Manual deploy:** use **Manual Deploy -> Deploy latest commit** if needed.

### What survives a deploy
- ✅ Database data (separate managed service)
- ✅ Uploaded files (only because of the persistent disk)
