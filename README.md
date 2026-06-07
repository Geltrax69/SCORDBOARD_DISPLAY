# 🏆 Scoreboard Pro

A real-time sports scoreboard system with a broadcast-style display screen, admin dashboard, and mobile scorer panel.

![Tech Stack](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=flat&logo=docker&logoColor=white)

---

## ✨ Features

- **Live Scoreboard Display** — full-screen TV/projector view with real-time score updates
- **Pre-match Intro** — broadcast-style GSAP animated intro with team logos, player spotlight carousel
- **Mobile Scorer Panel** — connect your phone via QR code or 4-digit code, control the match
- **Admin Dashboard** — create matches, manage teams & players (with logos and photos), control display layout
- **WebSocket** — all score changes reflect instantly across all screens
- **Multi-match** — support for 1–4 simultaneous matches on screen
- **Timeout & Substitution** — overlays for timeouts, substitutions, announcements

---

## 🚀 Quick Start

### Prerequisites
- **Docker Desktop** — [download here](https://www.docker.com/products/docker-desktop/)
- **Go 1.21+** — [download here](https://go.dev/dl/) *(auto-installed on macOS with Homebrew)*
- **Node.js 18+** — [download here](https://nodejs.org/) *(auto-installed on macOS with Homebrew)*

### Run

```bash
git clone https://github.com/Geltrax69/scoreboard-pro.git
cd scoreboard-pro
chmod +x run
./run
```

The script will **automatically install** missing dependencies (Go, Node.js) on macOS via Homebrew, and on Linux via apt. It will also start Docker if it's not running.

When everything is ready you'll see:

```
╔════════════════════════════════════════════════════╗
║          ✅  Everything is running!                ║
╠════════════════════════════════════════════════════╣
║  🖥  Admin Dashboard  → http://localhost:3000      ║
║  📺  Display Screen   → http://localhost:3000/display ║
║  📱  Scorer Connect   → http://localhost:3000/connect ║
║  ⚙️   Backend API      → http://localhost:8080/api  ║
╠════════════════════════════════════════════════════╣
║  Default login:  admin@scoreboard.local            ║
║  Password:       Admin@1234                        ║
╚════════════════════════════════════════════════════╝
```

Press **Ctrl+C** to stop everything.

---

## 🏗 Project Structure

```
scoreboard-pro/
├── backend/          # Go (Gin) REST API + WebSocket server
│   ├── cmd/server/   # Entry point
│   ├── internal/
│   │   ├── handlers/ # HTTP handlers
│   │   ├── models/   # Data models
│   │   ├── repository/ # DB queries
│   │   ├── ws/       # WebSocket hub
│   │   ├── auth/     # JWT auth
│   │   └── db/       # Migrations
│   └── uploads/      # User-uploaded logos & player photos
│
├── frontend/         # React + TypeScript (Vite)
│   └── src/
│       ├── pages/    # Display, Dashboard, Connect, Login
│       ├── components/
│       ├── store/    # Zustand state
│       └── services/ # API + WebSocket
│
├── nginx/            # Reverse proxy config (production)
├── docker-compose.yml       # Production stack
├── docker-compose.dev.yml   # Dev Postgres only
└── run               # One-shot launcher script
```

---

## 📱 How to Use

### 1. Create a Match
- Go to **Admin Dashboard** → `http://localhost:3000`
- Click **New Match**, fill in team names, colors, logos, and players
- Click **Create**

### 2. Connect the Scorer Phone
- On the dashboard, click the **QR** icon on a match
- Scan the QR code with your phone, OR open `http://<your-ip>:3000/connect` and enter the 4-digit code
- You'll get a scorer panel with score buttons, timer, timeout controls

### 3. Show the Display
- Open `http://localhost:3000/display` on a TV/projector browser
- When a match is **pending** → broadcast-style animated pre-match intro plays
- When you press **Start Match** on the phone → instantly transitions to live scoreboard

### 4. Control Layout
- The admin can set 1-match, 2-match, or 4-match display layouts from the dashboard

---

## ⚙️ Configuration

Copy `.env.example` to `backend/.env` and edit:

```env
JWT_SECRET=your_secret_here_min_32_chars
DB_PASSWORD=your_db_password
```

The `./run` script creates `backend/.env` automatically from `.env.example` if it doesn't exist.

---

## 🐳 Production Deployment

For a production server (VPS, cloud, etc.):

```bash
./run --prod
```

This builds Docker images and starts the full stack (Postgres + Go backend + React frontend + Nginx) on port 80.

Stop with:
```bash
docker compose down
```

---

## 🛑 Stop Dev Server

```bash
./run --stop
# or just press Ctrl+C in the terminal where ./run is running
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21, Gin, WebSocket (gorilla/websocket) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | PostgreSQL 16 |
| Animations | GSAP 3 |
| State | Zustand |
| Auth | JWT (device tokens + admin tokens) |
| Infra | Docker, Nginx |
