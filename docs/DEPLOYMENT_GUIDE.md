# Deployment Guide for Intelligence Exchange

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│   Vercel        │         │   Backend Server │
│   (Frontend)    │◄───────►│   (Bun + Hono)   │
│   React + Vite  │  HTTPS  │   Port 3001      │
└─────────────────┘         └────────┬─────────┘
                                     │
                              ┌──────┴──────┐
                              │   Postgres  │
                              │   Redis     │
                              └─────────────┘
```

---

## Option 1: Vercel + Railway (Recommended)

### Why This Combo?
- **Vercel**: Best-in-class frontend hosting, automatic previews, edge CDN
- **Railway**: Native Bun support, managed Postgres/Redis, easy env vars
- **Cost**: Free tier covers hackathon demo, ~$10-20/mo for production

### Step 1: Deploy Backend to Railway

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project
railway init --name intelligence-exchange-broker

# 4. Add Postgres
railway add --database postgres

# 5. Add Redis
railway add --database redis

# 6. Deploy
railway up
```

**Railway Environment Variables:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PORT=3001
BROKER_URL=https://your-app.up.railway.app

# World
WORLD_APP_ID=...
WORLD_ACTION_ID=...
WORLD_SIGNING_KEY=...

# Arc
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_ESCROW_CONTRACT_ADDRESS=0x...
ARC_PRIVATE_KEY=0x...

# Worldchain
WORLDCHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
IEX_IDENTITY_GATE_ADDRESS=0x...
IEX_AGENT_REGISTRY_ADDRESS=0x...
```

### Step 2: Deploy Frontend to Vercel

```bash
# 1. Build locally first to test
cd apps/intelligence-exchange-cannes-web
corepack pnpm build

# 2. Deploy to Vercel
vercel --prod
```

**Vercel Environment Variables:**
```
VITE_BROKER_URL=https://your-app.up.railway.app/v1/cannes
```

**vercel.json** (create in web app root):
```json
{
  "buildCommand": "cd ../.. && corepack pnpm --filter intelligence-exchange-cannes-web build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/v1/(.*)",
      "destination": "https://your-app.up.railway.app/v1/$1"
    }
  ]
}
```

---

## Option 2: Single Server with Docker (Simpler)

### Best For:
- Quick demos
- Full control
- No external service dependencies

### Setup:

**Dockerfile** (create in project root):
```dockerfile
# Build frontend
FROM node:20-alpine AS web-build
WORKDIR /app
COPY . .
RUN corepack enable && corepack pnpm install
RUN pnpm --filter intelligence-exchange-cannes-web build

# Backend
FROM oven/bun:1-alpine AS broker
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/intelligence-exchange-cannes-broker/package.json ./apps/intelligence-exchange-cannes-broker/
COPY packages/*/package.json ./packages/*/
RUN corepack enable && corepack pnpm install --frozen-lockfile

# Copy source
COPY . .

# Copy built frontend
COPY --from=web-build /app/apps/intelligence-exchange-cannes-web/dist ./apps/intelligence-exchange-cannes-broker/public

# Build backend
RUN pnpm --filter intelligence-exchange-cannes-broker build

# Expose port
EXPOSE 3001

# Start
CMD ["bun", "run", "apps/intelligence-exchange-cannes-broker/dist/index.js"]
```

**docker-compose.prod.yml**:
```yaml
version: '3.9'
services:
  app:
    build: .
    ports:
      - '3001:3001'
    environment:
      - DATABASE_URL=postgres://iex:iex@postgres:5432/iex_cannes
      - REDIS_URL=redis://redis:6379
      - PORT=3001
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: iex
      POSTGRES_PASSWORD: iex
      POSTGRES_DB: iex_cannes
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app

volumes:
  postgres_data:
```

**nginx.conf**:
```nginx
events {}
http {
  server {
    listen 80;
    
    location / {
      proxy_pass http://app:3001;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }
    
    location /v1 {
      proxy_pass http://app:3001;
    }
  }
}
```

Deploy to any VPS (DigitalOcean, Hetzner, AWS EC2):
```bash
# On server
git clone <repo>
cd intelligence-exchange-cannes-2026
docker-compose -f docker-compose.prod.yml up -d
```

---

## Option 3: Fly.io (Best for Bun)

### Why Fly.io?
- Native Bun support
- Postgres included
- Edge deployment
- Generous free tier

**fly.toml** (create in project root):
```toml
app = "intelligence-exchange"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3001"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 1024
```

Deploy:
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app
fly apps create intelligence-exchange

# Create Postgres
fly postgres create --name intelligence-exchange-db

# Attach database
fly postgres attach --app intelligence-exchange --postgres-app intelligence-exchange-db

# Deploy
fly deploy
```

---

## Comparison

| Factor | Vercel + Railway | Single Server | Fly.io |
|--------|------------------|---------------|--------|
| **Setup Time** | 15 min | 30 min | 20 min |
| **Maintenance** | Low | High | Low |
| **Cost (start)** | Free | $5-10/mo | Free |
| **Cost (scale)** | $20-50/mo | $20-50/mo | $10-30/mo |
| **Bun Support** | ✅ Railway | ✅ Docker | ✅ Native |
| **SSL** | Automatic | Let's Encrypt | Automatic |
| **CDN** | ✅ Vercel Edge | ❌ Manual | ✅ Fly Edge |

---

## Quick Start Recommendation

### For Hackathon Submission (Today):
```bash
# 1. Use Railway for backend
cd apps/intelligence-exchange-cannes-broker
railway up

# 2. Use Vercel for frontend
cd apps/intelligence-exchange-cannes-web
vercel --prod

# 3. Done! You have:
#    - Frontend: https://intelligence-exchange.vercel.app
#    - Backend: https://intelligence-exchange.up.railway.app
```

### For Production (Later):
- Keep Vercel for frontend
- Move backend to Fly.io (cheaper long-term)
- Use managed Postgres (Neon, Supabase)

---

## Environment Variables Summary

### Frontend (Vercel)
```
VITE_BROKER_URL=https://your-backend.com/v1/cannes
```

### Backend (Railway/Fly/Server)
```
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Server
PORT=3001
BROKER_URL=https://your-backend.com

# World
WORLD_APP_ID=app_...
WORLD_ACTION_ID=...
WORLD_SIGNING_KEY=...
WORLD_VERIFICATION_SECRET=...

# Arc Testnet (Deployed 2026-04-05)
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_ESCROW_CONTRACT_ADDRESS=0x04b386e36f89e5bb568295779089e91ded070057
ARC_PRIVATE_KEY=0x...
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000

# Worldchain Sepolia (Deployed 2026-04-05)
WORLDCHAIN_RPC_URL=https://worldchain-sepolia.g.alchemy.com/public
WORLDCHAIN_CHAIN_ID=4801
IEX_IDENTITY_GATE_ADDRESS=0x0f917a7f6c41e5e86a0f3870baadf512a4742dd2
IEX_AGENT_REGISTRY_ADDRESS=0x88110316c5f96f3544cef90389e924c69eb8146d
IEX_ESCROW_ADDRESS=0x65e3d3c8032795c245f461439a01b8ad348bd3a1

# 0G Testnet (Deployed 2026-04-05)
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_CHAIN_ID=16602
ZERO_G_EXPLORER_BASE_URL=https://chainscan-galileo.0g.ai/tx/
ZERO_G_PRIVATE_KEY=0x...
ZERO_G_IDENTITY_GATE_ADDRESS=0x77331c208e7a6d4c05b0a0f87db2df9f154321a8
ZERO_G_AGENT_REGISTRY_ADDRESS=0xa3b182f8bc74a8bd7318c8591c1412f6e201f2e5
ZERO_G_ESCROW_ADDRESS=0xdf7628895b46d03a084669ddfed6a025447360b8
ZERO_G_ADVANCED_ESCROW_ADDRESS=0x04b386e36f89e5bb568295779089e91ded070057
```

---

## Troubleshooting

### CORS Issues
If frontend can't connect to backend:
```typescript
// In broker src/index.ts
app.use('*', cors({
  origin: ['https://your-frontend.vercel.app', 'http://localhost:3000'],
  credentials: true,
}));
```

### Bun Not Found
Some platforms don't support Bun natively:
```dockerfile
# Use Node.js with Bun compatibility
FROM node:20-alpine
RUN npm install -g bun
```

### Database Migrations
Run on deploy:
```bash
bun run db:migrate
bun run seed  # If first deploy
```
