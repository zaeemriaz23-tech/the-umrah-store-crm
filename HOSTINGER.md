# Deploying The Umrah Store CRM (v4.0.0) on Hostinger Node.js + MySQL

MySQL is the only database. The CRM stores every booking, account, payment, ledger entry, expense, voucher, user, session and setting in it.

## 1. Settings in hPanel -> Websites -> Node.js

| Setting | Value |
|---|---|
| Node.js version | **18.x** (20.x also works) |
| Application root | the folder that contains `server.js` and `package.json` (**not** a sub-folder) |
| Startup file / entry point | `server.js` |
| Install command | `npm install` (or `npm ci --omit=dev`) so that `mysql2` is installed |
| Start command | `npm start` (= `node server.js`) |

If you deploy from GitHub, the repository root must contain `server.js`, `package.json`, `package-lock.json`, `lib/`, `public/`, `scripts/` directly. If your repo has the project inside a sub-folder, set that folder as the application root.

## 2. Environment variables (hPanel -> Node.js -> Environment variables)

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u544159223_umrah_crm
DB_USER=u544159223_umrah_admin
DB_PASSWORD=<your MySQL password>
DB_SSL=0
DATA_DIR=/home/u544159223/umrah-data
ADMIN_PASSWORD=<a strong password for the "admin" login>
PUBLIC_URL=https://your-domain
```

* Enter the password only in hPanel. Never put it in the repository, `.env.example` or a chat.
* `DATA_DIR` must be an **absolute folder outside the deployed application**. It keeps receipts, uploaded files and `db.json` (the recovery snapshot and, on the very first start, the data that gets imported). Create it once (File Manager or SSH: `mkdir -p /home/u544159223/umrah-data`). Your existing `db.json` stays there.
* If `DB_*` are missing or `DATA_DIR` is wrong, the app refuses to use MySQL (it never silently uses JSON when MySQL is configured).

## 3. First deploy

1. Deploy / "Redeploy" the application.
2. The first start creates all tables automatically and, because MySQL is empty, imports `DATA_DIR/db.json` **once**. The log shows:
   `MySQL schema migrations applied: 1` and `MySQL was empty - imported DATA_DIR/db.json (N bookings, ...)`.
   A copy of the original file is saved as `DATA_DIR/backups/pre-mysql-migration-<time>.json`.
3. Open `https://your-domain/healthz`. It must show:
   ```json
   { "ok": true, "status": "healthy", "version": "4.0.0",
     "storage": { "driver": "mysql", "connected": true, "healthy": true, "pendingWrites": 0, ... } }
   ```
   HTTP 200 = healthy. HTTP 503 = not healthy (see Troubleshooting).
4. phpMyAdmin -> database `u544159223_umrah_crm` shows `crm_bookings`, `crm_parties`, `crm_payments`, `crm_ledger_entries`, `crm_expenses`, `crm_users`, `crm_sessions`, `crm_kv`, `crm_head`, `crm_backups`, ...
5. Acceptance test: create a booking, click **Restart** in hPanel, reopen the booking. It must still be there.

If the database already contains data, `db.json` is **never** imported over it.

## 4. Everyday operation

* **Restart / redeploy**: safe at any time. On SIGTERM the app finishes in-flight requests and commits pending data before exiting.
* **Backups**: automatic every 6 hours (newest 30 kept) in table `crm_backups`; plus `DATA_DIR/db.json` (always the last committed state) and daily copies in `DATA_DIR/backups/`. Admin API: `GET/POST /api/db/backups`.
* **CLI tools** (SSH, from the application root; same environment variables):
  ```
  node scripts/db-tool.js status
  node scripts/db-tool.js backups
  node scripts/db-tool.js backup
  node scripts/db-tool.js verify
  ```
* Run **one** instance only. If two instances ever overlap (for example during a deploy), the second one to write is refused with a 503 and re-syncs itself, so nothing is overwritten, but users will see a "not saved - try again" message once.

## 5. Troubleshooting `/healthz`

| What you see | Meaning / fix |
|---|---|
| `503`, `"driver":"mysql"`, error `Access denied` | wrong `DB_USER` / `DB_PASSWORD`. Fix the variables and restart. The app retries and stays offline; it does not use JSON. |
| `503`, error `ECONNREFUSED` / timeout | MySQL host/port wrong or MySQL temporarily down. On Hostinger use `DB_HOST=127.0.0.1`. The app reconnects automatically when MySQL returns. |
| `503`, `pendingWrites > 0` | a commit is in progress or failing; check the logs for `MySQL commit failed`. |
| `503`, "another instance wrote to it" | two copies of the app run against one database. Stop the extra one. |
| `"driver":"json"` | the `DB_*` variables are not set in the running process. Add them and restart. |
| Site shows "database temporarily unavailable" | the same, seen by visitors; `/healthz` explains why. |

## 6. Rollback

Your data is never deleted by this upgrade (`db.json` and its dated copies remain; the old tables, if any, are untouched).

**Back to the previous code**
1. In GitHub: `git revert <merge-or-commit-id>` then `git push` (or redeploy the previous commit/ZIP in hPanel).
2. Every earlier version starts from `DATA_DIR/db.json` (v3.8 and older use it directly; v3.10-v3.12 import it into their own table if their MySQL tables are empty). That file is refreshed from MySQL a few seconds after every change and again on shutdown, so it holds your latest committed data. Stop the app and keep a copy first: `cp /home/u544159223/umrah-data/db.json /home/u544159223/umrah-data/db-before-rollback.json`.
3. For v3.8 or older (no MySQL support) the `DB_*` variables are simply ignored. The `crm_*` tables stay in MySQL untouched, so you can return to v4.0.0 later: it keeps using them. Changes made while on the old version would then be missing from MySQL, so after rolling forward again restore with `node scripts/db-tool.js` or re-import (last section).

**Restore data inside MySQL** (bad edit, accidental deletion)
1. Stop the app in hPanel.
2. `node scripts/db-tool.js backups` -> pick the backup id.
3. `node scripts/db-tool.js restore <id>` (a `pre-restore` safety backup is taken first, so the restore itself can be undone).
4. Start the app and check `/healthz`.

**Rebuild MySQL from a JSON file** (last resort)
1. Stop the app. In phpMyAdmin drop all `crm_*` tables (or use a fresh database).
2. Put the wanted file at `DATA_DIR/db.json`, start the app: it migrates it once.
