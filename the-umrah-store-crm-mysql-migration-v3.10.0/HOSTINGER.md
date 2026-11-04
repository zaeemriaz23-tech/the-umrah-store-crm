# Deploying The Umrah Store CRM on Hostinger (Node.js)

## Critical storage rule

This release supports MySQL-backed persistence. When `DB_HOST`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` (or their `MYSQL_*` aliases) are configured, the app automatically creates two tables: `crm_state` (the current complete CRM state document) and `crm_state_backups` (revisioned snapshots). Existing application modules continue using the same state shape, so this avoids a risky full rewrite of every CRM module. This is **not a normalized one-table-per-entity schema**; agents, suppliers, bookings, vouchers, payments and other collections are stored inside the JSON payload in `crm_state`. The external `DATA_DIR` is still required for receipts, uploads, a local recovery copy, and related files.

On Hostinger, the data directory must be outside `hbuilds`. Example for the hosting account shown in hPanel:

```text
DATA_DIR=/home/u544159223/umrah-data
```

Use the exact home path shown by your own Hostinger File Manager if the account username differs. Do not use `./data` in production.

## 1. Before deploying this release (one-time move)

1. In Hostinger File Manager, open the existing data folder from the previous working deployment. The earlier version path recorded for this app was `hbuilds/versions/01a1a7b1-4a2a-71a0-a92b-acf76032d437/nodejs/data`.
2. Create `/home/u544159223/umrah-data` at the same home level as `hbuilds` (not inside `hbuilds`, `public_html`, or `nodejs`).
3. **Copy** the entire contents of that existing deployment data folder into `umrah-data`. Copy, do not move. Include `db.json`, `receipts`, `brand`, `backups`, `promos`, `kyc` and any other folders present. Do not remove the source folder after copying until MySQL is verified.
4. Confirm `/home/u544159223/umrah-data/db.json` exists and has a non-zero size. Keep the old `hbuilds/current/nodejs/data` in place until the new deployment is verified.
5. In hPanel → Node.js App → Environment variables, set `DATA_DIR` to `/home/u544159223/umrah-data`. As a one-time fallback, you may also set `LEGACY_DATA_DIR=/home/u544159223/hbuilds/versions/01a1a7b1-4a2a-71a0-a92b-acf76032d437/nodejs/data` while that old version directory still exists. Manual copy is preferred; remove `LEGACY_DATA_DIR` after verifying the migration.
6. Do not set `ALLOW_EMPTY_DB=1` for a production deployment. Do not set `RESET_ADMIN=1` unless intentionally changing the administrator password.
7. Deploy/restart the new release. In startup logs, verify `Data folder: /home/u544159223/umrah-data`.

The application can also perform a non-destructive first-start copy from its local `data` folder if `DATA_DIR` is external and `db.json` is absent there. The manual copy above is still recommended because deployment versions may not retain an old version folder.

## 2. MySQL connection

Create a MySQL database and user in Hostinger, then set these environment variables in the Node.js app. For Hostinger Node.js apps, set the host to `127.0.0.1` (not `localhost`, which can resolve to IPv6 `::1` on Node.js 17+). Hostinger documents port `3306` for MySQL connections.

| Variable | Value |
|---|---|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | Full database name including Hostinger prefix |
| `DB_USER` | Full username including Hostinger prefix |
| `DB_PASSWORD` | Database user's password |
| `DB_SSL` | `0` unless Hostinger requires SSL |

The equivalent `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD` names are also supported.

On successful startup, the app creates `crm_state` and `crm_state_backups` automatically. Do not create these tables manually. The first startup imports the validated `DATA_DIR/db.json` into MySQL if the SQL state table is empty. If both stores have data, the higher revision is retained. The app refuses to initialize an empty store when the initialized marker exists.

## 3. Environment variables

| Variable | Value |
|---|---|
| `PORT` | Hostinger-provided port (normally leave as configured) |
| `DATA_DIR` | `/home/u544159223/umrah-data` |
| `PUBLIC_URL` | `https://portal.theumrahstore.com` |
| `ADMIN_PASSWORD` | Only required for a deliberate first-time install or admin creation; existing admin passwords are preserved |
| `ALLOW_EMPTY_DB` | Leave unset / `0` in production |
| `RESET_ADMIN` | Leave unset / `0` unless intentionally resetting admin password |

## 4. Fail-safe database behavior

- In JSON-only mode, missing `db.json` in an initialized storage directory causes startup to stop. In MySQL mode, a missing local mirror is restored from `crm_state`; if both MySQL state and the file are missing, startup stops rather than creating a blank CRM.
- Invalid JSON, invalid collection types, or a v3 database missing a required core collection causes startup to stop; the original file is not overwritten or normalized into empty records.
- A Hostinger/public production deployment requires an explicit absolute `DATA_DIR`; relative paths, application-local paths, and external-looking symlinks that resolve back inside the deployed application are rejected.
- When migrating from the old in-app data folder, the application copies files into the new directory without deleting or overwriting existing destination files.
- A one-time `.crm-initialized` marker prevents an accidental blank re-initialization after the database has been created.
- Files are written atomically (temporary file + fsync + rename) and restrictive file permissions are applied where supported.
- A pre-write database checkpoint is kept before a write when the newest checkpoint is older than six hours (configurable with `BACKUP_INTERVAL_HOURS`). Checkpoints are retained for 30 days by default (`BACKUP_RETENTION_DAYS`). While the app is running it checks hourly and creates a checkpoint when due.
- The application still uses a single-process in-memory state object and expects one Node.js app instance. Do not run multiple application instances against the same state database.

## 5. Backups and verification

- Download an off-server copy regularly from CRM → Settings → Data & activity → Download backup. The authenticated `/api/backup/status` endpoint reports whether the DB, initialization marker, file folders and checkpoints are present.
- Keep Hostinger account backups enabled as an additional independent recovery layer.
- From the app folder, `npm run verify-storage` checks the configured JSON database and reports record counts and backup files without modifying data.
- The local checkpoint backups protect against application redeploys and accidental writes; they are not a substitute for an off-server backup. MySQL snapshots are stored in `crm_state_backups` and retained for the configured number of days.

## 6. Windows and Android apps

The Windows EXE and Android APK are clients. They must authenticate against this website/API and must never maintain a separate authoritative business database. Offline caches are local working copies only; all changes must sync to this central CRM server.

## 7. Health check

`https://portal.theumrahstore.com/healthz` returns the application health and version only after the storage layer has initialized successfully.
