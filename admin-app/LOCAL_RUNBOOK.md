# Admin app local runbook

Run these commands from the project root:

```bash
cd admin-app
npm install
npm run dev
```

To bind the development server to all interfaces and use port 3000:

```bash
cd admin-app
npm run dev -- --hostname 0.0.0.0 --port 3000
```

After the server starts, verify the health page and existing dashboard API:

```bash
curl -i http://localhost:3000/
curl -i "http://localhost:3000/api/air-quality/dashboard?period=currentWeek&metric=pm25"
```

Do not put `OPENAQ_API_KEY` in frontend code, URLs, logs, or responses. It must remain a server-only environment variable.

When changing `admin-app/.env.local`, stop the Next.js development server and
start it again from `C:\Users\ACER\projectweb\admin-app`; Next.js reads local
environment files at startup. Use `npm run dev` and wait for the ready message
before checking API routes.
