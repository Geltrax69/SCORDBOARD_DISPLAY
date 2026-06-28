# Deploying ScoreCast (Hetzner, Docker, HTTPS)

Production stack: Postgres + Go backend + React frontend + nginx, fronted by
**Caddy** for automatic HTTPS. Runs as the isolated `scorecast` compose project,
so it won't collide with anything else on the server.

## 0. Point the domain
In your DNS, create an **A record**:
```
scorecast.simpedu.in  →  46.62.157.163
```
Wait until `ping scorecast.simpedu.in` shows that IP before step 5 (Caddy needs it for the SSL cert).

## 1. Check the server is free for this app
SSH in and confirm nothing else owns the web ports / Postgres:
```bash
ssh root@46.62.157.163
docker ps                 # what's already running?
sudo lsof -i :80 -i :443  # is anything on 80/443?
```
- **80/443 are free** → continue below (Caddy will use them). ✅
- **80/443 are taken** by an existing reverse proxy → see "Already have a proxy" at the bottom.

## 2. Install Docker (skip if already installed)
```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code
```bash
cd /opt
git clone https://github.com/Geltrax69/SCORDBOARD_DISPLAY.git scorecast
cd scorecast
```

## 4. Configure secrets
```bash
cp .env.prod.example .env
# generate a strong JWT secret:
echo "JWT_SECRET=$(openssl rand -hex 32)"   # paste this value into .env
nano .env                                   # set DOMAIN, PUBLIC_BASE_URL, JWT_SECRET, DB_PASSWORD
```

## 5. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Caddy fetches the HTTPS cert automatically (give it ~30s on first run).

Open **https://scorecast.simpedu.in** →
- `/`         dashboard (log in)
- `/display`  TV scoreboard
- `/connect`  scorer phones

**Logins** (change passwords from the **Users** page after first login):
- Owner (manages users): `simpedu` / `scorecast.lalit`
- Admin (runs matches):  `scorecast.hsta` / `hsta2113@`

## Updating later
```bash
cd /opt/scorecast
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## Backups
The database lives in the `scorecast_postgres_data` Docker volume. Quick dump:
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U scoreboard scoreboard > backup_$(date +%F).sql
```

---

## Already have a proxy on 80/443?
Don't run the bundled Caddy. Instead expose the app on a loopback port and point
your existing nginx/Caddy/Traefik at it:

1. In `docker-compose.prod.yml`, delete the `caddy` service, and give `nginx` a
   loopback port: under the `nginx` service add
   ```yaml
       ports:
         - "127.0.0.1:8090:80"
   ```
2. `docker compose -f docker-compose.prod.yml up -d --build`
3. In your existing proxy, route `scorecast.simpedu.in` → `http://127.0.0.1:8090`
   (make sure it forwards WebSocket upgrade headers for `/ws`).
