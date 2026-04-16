# API smoke test (rate limits + origin)

Run these from a terminal against the running app (`npm run dev` → http://localhost:8080). In dev, `/conf`, `/pdfExport`, `/pandocExport`, `/userInfo` are served by Vite middleware — the `_utils.js` rate limit logic only runs on the real Vercel functions in `/api/*`. So: the most useful tests are against a **deployed preview** (`vercel dev` or a Vercel preview URL).

> Swap `$APP` below for your preview URL (e.g. `https://stackedit-preview.vercel.app`).

```bash
APP="http://localhost:3000"   # or the Vercel preview URL
```

## 1) /api/conf — rate-limited, should cache

```bash
curl -si "$APP/api/conf" | head -20
# Expect: 200, Cache-Control: private, max-age=60, JSON body with client IDs
```

## 2) /api/conf — hammer it

```bash
for i in $(seq 1 130); do
  curl -so /dev/null -w "%{http_code}\n" "$APP/api/conf"
done | sort | uniq -c
# Expect: ~120 x 200, ~10 x 429
```

## 3) /api/githubToken — requires same Origin

```bash
curl -si "$APP/api/githubToken?clientId=$GITHUB_CLIENT_ID&code=fake"
# Expect: 403 forbidden  (no Origin header)

curl -si -H "Origin: https://attacker.com" "$APP/api/githubToken?clientId=$GITHUB_CLIENT_ID&code=fake"
# Expect: 403 forbidden

HOST="${APP#https://}"; HOST="${HOST#http://}"
curl -si -H "Origin: $APP" "$APP/api/githubToken?clientId=wrong_client_id&code=fake"
# Expect: 400 invalid_client

curl -si -H "Origin: $APP" "$APP/api/githubToken"
# Expect: 400 missing_params
```

## 4) /api/githubToken — rate limit

```bash
for i in $(seq 1 15); do
  curl -so /dev/null -w "%{http_code}\n" \
    -H "Origin: $APP" \
    "$APP/api/githubToken?clientId=x&code=y"
done | sort | uniq -c
# Expect: ~10 x 400 (invalid_client), ~5 x 429
```

## 5) /api/pdfExport + /api/pandocExport — production stubs

```bash
curl -si -X POST "$APP/api/pdfExport" --data "<h1>hi</h1>"
# Expect: 501 pdf_export_unavailable

curl -si -X POST "$APP/api/pandocExport?format=pdf"
# Expect: 501 pandoc_export_unavailable
```

## 6) Security headers

```bash
curl -sI "$APP/" | grep -iE "strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|content-security-policy"
# Expect all 6 present
```

## 7) /api/googleDriveAction — not an open redirect

```bash
curl -si "$APP/api/googleDriveAction?state=foo"
# Expect: 302, Location: /app#providerId=googleDrive&state=foo  (fixed /app path)

curl -si "$APP/api/googleDriveAction?state=https://attacker.com"
# Expect: 302, Location: /app#providerId=googleDrive&state=https%3A%2F%2Fattacker.com
#         (the attacker string ends up in the hash fragment of OUR own /app, never a redirect to attacker.com)
```
