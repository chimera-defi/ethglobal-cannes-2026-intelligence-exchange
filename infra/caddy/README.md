# Caddy Reverse Proxy Config

Used for self-hosted deployment — replaces Vercel (web) + Railway (broker).

## Setup

### HTTP-only mode (default)

```bash
# Install
apt-get install -y caddy

# Deploy config
cp infra/caddy/Caddyfile /etc/caddy/Caddyfile

# Edit IP in Caddyfile to match your server
sed -i 's/168.119.15.122/YOUR_SERVER_IP/g' /etc/caddy/Caddyfile

# Start
systemctl enable caddy
systemctl start caddy
```

### HTTPS mode with Let's Encrypt

Once DNS is configured to point to 168.119.15.122:

```bash
# Ensure DNS A record points to 168.119.15.122
# Wait for DNS propagation (can take up to 24 hours)

# Deploy HTTPS configuration
./infra/scripts/deploy-https.sh app.assayprotocol.io

# This script:
# - Replaces DOMAIN_PLACEHOLDER in Caddyfile.https with your domain
# - Deploys to /etc/caddy/Caddyfile
# - Updates CORS_ALLOWED_ORIGINS in broker .env
# - Restarts Caddy (Let's Encrypt certs auto-obtained on first request)
```

## Routes

| Path | Target | Notes |
|------|--------|-------|
| `/v1/*` | `localhost:3001` | Broker API — keep /v1 prefix |
| `/api/*` | `localhost:3001` | Broker API — strips /api prefix |
| `/*` | `localhost:3100` | Web app (Vite/built) |

## Security headers applied

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Server` header stripped

## Blocked paths (403)

- `/.env`, `/.git*`, `/package.json`, `/package-lock.json`, `/.npmrc`

## Teardown

```bash
systemctl stop caddy
systemctl disable caddy
```
