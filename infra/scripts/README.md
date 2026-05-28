# IEX Infrastructure Scripts

Scripts for running, deploying, and auditing the Intelligence Exchange stack.

---

## `server-up.sh`

Bring up the full stack (broker + web dev server) for demo or development.

```bash
./infra/scripts/server-up.sh           # Start broker + web
./infra/scripts/server-up.sh --build   # Build broker first, then start
./infra/scripts/server-up.sh --caddy   # Also start Caddy reverse proxy
./infra/scripts/server-up.sh --build --caddy
```

**What it does:**
1. Checks prerequisites: `node`, `bun`, Postgres reachability, Redis reachability
2. Copies `.env.example` → `.env` if `.env` doesn't exist (with a warning)
3. Runs database migrations via `bun run src/db/migrate.ts`
4. Starts broker in background (`nohup bun run src/index.ts`) → PID saved to `/tmp/iex-broker.pid`
5. Starts web dev server (`nohup bun run dev`) → PID saved to `/tmp/iex-web.pid`
6. Optionally starts Caddy if `--caddy` is passed (requires Caddy installed)
7. Prints stack URLs and log paths

**Output:**
- Broker: `http://localhost:3001`
- Web: `http://localhost:3100`
- Logs: `tail -f /tmp/iex-broker.log /tmp/iex-web.log`

**Production-only actions required:**
- Fill in all secrets in `.env` (never commit `.env`)
- Set `NODE_ENV=production` to enable security warnings for Redis/Postgres/CORS
- Set `CORS_ALLOWED_ORIGINS=https://yourdomain.com` (see 1c below)
- Redis: add `requirepass` and `bind 127.0.0.1` to `redis.conf`
- Postgres: use a dedicated low-privilege user; enable `scram-sha-256` auth

---

## `server-down.sh`

Tear down the running stack.

```bash
./infra/scripts/server-down.sh          # Stop broker + web
./infra/scripts/server-down.sh --caddy  # Also stop Caddy
```

Kills PIDs saved by `server-up.sh`. Escalates to SIGKILL if needed.

---

## `security-scan.sh`

Run a lightweight security scan against the running stack.

```bash
./infra/scripts/security-scan.sh
./infra/scripts/security-scan.sh --host http://localhost
./infra/scripts/security-scan.sh --host http://168.119.15.122 --report-dir docs/security
```

**Checks performed:**
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
- `Server` header absent/redacted
- `/.env`, `/package.json`, `/.git/config`, `/.npmrc` → expect 403/404
- `/v1/cannes/health` → expect 200
- CORS: wildcard origin + credentials is flagged as FAIL (OWASP A05)

**Output:** Timestamped Markdown report at `$REPORT_DIR/scan-YYYYMMDD.md`

**Exit code:** `1` if any checks fail, `0` if all pass (or only warnings).

---

## `deploy-caddy.sh`

Install Caddy and deploy the IEX Caddyfile for self-hosted production.

```bash
./infra/scripts/deploy-caddy.sh --ip YOUR_SERVER_IP
./infra/scripts/deploy-caddy.sh  # auto-detects public IP
```

**What it does:**
1. Installs Caddy via apt (Debian/Ubuntu) if not already installed
2. Copies `infra/caddy/Caddyfile` to `/etc/caddy/Caddyfile`
3. Substitutes the placeholder IP with your server IP
4. Validates and restarts Caddy via systemd

**Requires:** `sudo` access, Ubuntu/Debian, open ports 80 (and 443 if using TLS).

---

## Security hardening checklist (production)

| # | Area | Required action |
|---|------|----------------|
| 1a | Redis | Set `requirepass <strong-password>` in `redis.conf`; `bind 127.0.0.1` |
| 1a | Redis URL | Update `REDIS_URL=redis://:<password>@127.0.0.1:6379` |
| 1b | Postgres | Use a dedicated low-privilege DB user; enable `scram-sha-256` in `pg_hba.conf` |
| 1c | CORS | Set `CORS_ALLOWED_ORIGINS=https://yourdomain.com` in broker `.env` |
| 1d | Rate limit | Caddy rate-limit plugin for edge protection (see `infra/caddy/Caddyfile` comments) |
| 1d | Rate limit | Switch in-memory rate limiter to Redis-backed (`rate-limiter-flexible`) for multi-instance |
| 1e | Secrets | Never `console.log` env vars; use `Boolean(process.env.SECRET)` for presence checks |
| — | TLS | Set `auto_https on` in Caddyfile and use a domain name instead of bare IP |
| — | Firewall | Block ports 3001, 3100, 5432, 6379 from public internet; expose only 80/443 via Caddy |
