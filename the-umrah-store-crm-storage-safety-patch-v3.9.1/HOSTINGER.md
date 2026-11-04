# Deploying The Umrah Store CRM on Hostinger (Node.js)

## Critical storage rule

This CRM release still uses its existing JSON document store (`db.json`). It is **not MySQL-backed**. Hostinger's hPanel `Database: None` label is therefore not the cause of data loss: the app reads and writes a JSON database file. Creating a MySQL database alone will not connect it. A MySQL migration would require refactoring the application's data layer and validating every module; do not attempt that as a quick setting change.

On Hostinger, the data directory must be outside `hbuilds`. Example for the hosting account shown in hPanel:

```text
DATA_DIR=/home/u544159223/umrah-data
```

Use the exact home path shown by your own Hostinger File Manager if the account username differs. Do not use `./data` in production.

## 1. Before deploying this release (one-time move)

1. In Hostinger File Manager, open `hbuilds/current/nodejs/data`.
2. Create `/home/u544159223/umrah-data` at the same home level as `hbuilds` (not inside `hbuilds`, `public_html`, or `nodejs`).
3. **Copy** the entire contents of `hbuilds/current/nodejs/data` into `umrah-data`. Copy, do not move. Include `db.json`, `receipts`, `brand`, `backups`, `promos`, `kyc` and any other folders present. The version path visible in File Manager was `hbuilds/versions/01a1a7b1-4a2a-71a0-a92b-acf76032d437/nodejs/data`; `hbuilds/current/nodejs/data` is simpler while that deployment remains active.
4. Confirm `/home/u544159223/umrah-data/db.json` exists and has a non-zero size. Keep the old `hbuilds/current/nodejs/data` in place until the new deployment is verified.
5. In hPanel → Node.js App → Environment variables, set `DATA_DIR` to `/home/u544159223/umrah-data`. As a one-time fallback, you may also set `LEGACY_DATA_DIR=/home/u544159223/hbuilds/versions/01a1a7b1-4a2a-71a0-a92b-acf76032d437/nodejs/data` while that old version directory still exists. Manual copy is preferred; remove `LEGACY_DATA_DIR` after verifying the migration.
6. Do not set `ALLOW_EMPTY_DB=1` for a production deployment. Do not set `RESET_ADMIN=1` unless intentionally changing the administrator password.
7. Deploy/restart the new release. In startup logs, verify `Data folder: /home/u544159223/umrah-data`.

The application can also perform a non-destructive first-start copy from its local `data` folder if `DATA_DIR` is external and `db.json` is absent there. The manual copy above is still recommended because deployment versions may not retain an old version folder.

## 2. Environment variables

| Variable | Value |
|---|---|
| `PORT` | Hostinger-provided port (normally leave as configured) |
| `DATA_DIR` | `/home/u544159223/umrah-data` |
| `PUBLIC_URL` | `https://portal.theumrahstore.com` |
| `ADMIN_PASSWORD` | Only required for a deliberate first-time install or admin creation; existing admin passwords are preserved |
| `ALLOW_EMPTY_DB` | Leave unset / `0` in production |
| `RESET_ADMIN` | Leave unset / `0` unless intentionally resetting admin password |

## 3. Fail-safe database behavior

- Missing `db.json` in an already initialized storage directory causes startup to stop. It will not silently create a blank database.
- Invalid JSON, invalid collection types, or a v3 database missing a required core collection causes startup to stop; the original file is not overwritten or normalized into empty records.
- A Hostinger/public production deployment requires an explicit absolute `DATA_DIR`; relative paths, application-local paths, and external-looking symlinks that resolve back inside the deployed application are rejected.
- When migrating from the old in-app data folder, the application copies files into the new directory without deleting or overwriting existing destination files.
- A one-time `.crm-initialized` marker prevents an accidental blank re-initialization after the database has been created.
- Files are written atomically (temporary file + fsync + rename) and restrictive file permissions are applied where supported.
- A pre-write database checkpoint is kept before a write when the newest checkpoint is older than six hours (configurable with `BACKUP_INTERVAL_HOURS`). Checkpoints are retained for 30 days by default (`BACKUP_RETENTION_DAYS`). While the app is running it checks hourly and creates a checkpoint when due.
- This is a single-instance JSON store. Do not run multiple Node.js instances/workers against the same `DATA_DIR`.

## 4. Backups and verification

- Download an off-server copy regularly from CRM → Settings → Data & activity → Download backup. The authenticated `/api/backup/status` endpoint reports whether the DB, initialization marker, file folders and checkpoints are present.
- Keep Hostinger account backups enabled as an additional independent recovery layer.
- From the app folder, `npm run verify-storage` checks the configured JSON database and reports record counts and backup files without modifying data.
- The local checkpoint backups protect against application redeploys and accidental writes; they are not a substitute for an off-server backup.

## 5. Windows and Android apps

The Windows EXE and Android APK are clients. They must authenticate against this website/API and must never maintain a separate authoritative business database. Offline caches are local working copies only; all changes must sync to this central CRM server.

## 6. Health check

`https://portal.theumrahstore.com/healthz` returns the application health and version only after the storage layer has initialized successfully.
