# Deploying The Umrah Store CRM on Hostinger (Node.js)

Works on Hostinger **Business / Cloud** web hosting ("Node.js Web App" in hPanel) and on a VPS.

## 1. Upload
1. hPanel → **Websites → Add website → Node.js Apps** (or *Advanced → Node.js*).
2. Choose **Upload your website files** and upload this project's ZIP (or connect the GitHub repo).
3. Settings: **Node version 20 (or 18+)**, **Entry file `server.js`**, install command `npm install --omit=dev`, start command `npm start`.

## 2. Environment variables (hPanel → Node.js app → Environment variables)
| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | a strong password for the `admin` login (first start only; your existing admin keeps working) |
| `PUBLIC_URL` | `https://your-domain.com` |
| `DATA_DIR` | `/home/<your-user>/umrah-data` **(outside the app folder, so redeploying never erases data)** |

Existing data: copy your old `data/` folder content (db.json, receipts, brand, backups) into `DATA_DIR` before the first start. Nothing is migrated destructively: new fields are added automatically on start.

## 3. After the first start
- Sign in at `/app` with `admin`. Open **Settings → AI assistant** (Groq key, model `openai/gpt-oss-120b`) and **Settings → Email & notifications** (SMTP accounts: Hostinger mailbox = `smtp.hostinger.com`, port 465, SSL/TLS).
- Turn on HTTPS (SSL) for the domain in hPanel. Live chat uses Server-Sent Events with an automatic polling fallback, so it works even if the proxy buffers streams.
- Staff access: **Staff & access** now has *Live chat*, *Promotions* and group create/edit/delete permissions, and "AI assistant for group packages".

## 4. Updating
Upload the new ZIP and restart the app. Data in `DATA_DIR` is untouched. Back-ups are written to `DATA_DIR/backups`.

## 5. Health check
`https://your-domain.com/healthz` returns `{"ok":true,"version":"3.8.0"}`.
