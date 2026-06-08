# 🏆 Scoreboard Pro

A real-time sports scoreboard system with a broadcast-style display screen, admin dashboard, and mobile scorer panel.

![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=flat&logo=docker&logoColor=white)

---

## ✨ Features

- **Live Scoreboard Display** — full-screen TV/projector view with real-time score updates via WebSocket
- **Broadcast-style Intro** — GSAP animated pre-match intro with team logos, player spotlight carousel, and 5-second countdown
- **Mobile Scorer Panel** — connect phone via QR code or 4-digit code, control scores/timer/timeouts
- **Admin Dashboard** — create matches, manage teams & players with logos and photos
- **Multi-match support** — 1–4 matches on screen simultaneously

---

## 🚀 Quick Start

> **Only requirement: [Docker Desktop](https://www.docker.com/products/docker-desktop/)**
> Everything else (Go, Node.js) is installed automatically.

---

### 🪟 Windows

**Option A — Double-click (easiest):**
```
Double-click  run.bat
```

**Option B — PowerShell:**
```powershell
git clone https://github.com/Geltrax69/SCORDBOARD_DISPLAY.git
cd SCORDBOARD_DISPLAY
.\run.ps1
```
> If blocked by execution policy, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

### 🍎 macOS

```bash
git clone https://github.com/Geltrax69/SCORDBOARD_DISPLAY.git
cd SCORDBOARD_DISPLAY
chmod +x run
./run
```
> Requires [Homebrew](https://brew.sh) for auto-installing Go & Node.js. Or install them manually first.

---

### 🐧 Linux (Ubuntu / Debian / Kali / Arch)

```bash
git clone https://github.com/Geltrax69/SCORDBOARD_DISPLAY.git
cd SCORDBOARD_DISPLAY
chmod +x run
sudo ./run
```
> Go and Node.js are installed automatically via `apt` if missing.

---

### ✅ What you'll see when it's ready

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

Press **Ctrl+C** (or Enter on Windows) to stop everything.

---

## 📱 How to Use

### 1. Create a Match
- Open **Admin Dashboard** → `http://localhost:3000`
- Log in with `admin@scoreboard.local` / `Admin@1234`
- Click **New Match** → fill team names, colors, logos, and roster

### 2. Connect Scorer Phone
- Click the **QR** icon on a match card
- Scan QR with phone, or open `http://<your-ip>:3000/connect` and type the 4-digit code
- Score panel appears with +1/+2/+3, timer, timeout buttons

### 3. Display on TV / Projector
- Open `http://localhost:3000/display` in a browser on the TV
- **Pending match** → animated broadcast intro plays (logos, player spotlight carousel)
- Press **Start Match** on phone → 5-second countdown → live scoreboard

---

## 🛑 Stop / Restart

| OS | Command |
|---|---|
| macOS / Linux | `Ctrl+C` in the terminal, or `./run --stop` |
| Windows | Press Enter in the launcher window, or close PowerShell windows |

---

## 🐳 Production Mode (VPS / Server)

Builds Docker images and runs the full stack behind Nginx on port 80:

```bash
# macOS / Linux
./run --prod

# Windows
.\run.ps1 --prod
```

Stop with:
```bash
docker compose down       # Linux/macOS
docker-compose down       # older Docker
```

---

## 🏗 Project Structure

```
scoreboard-pro/
├── backend/              # Go (Gin) REST API + WebSocket
│   ├── cmd/server/       # Entry point
│   ├── internal/
│   │   ├── handlers/     # HTTP handlers
│   │   ├── models/       # Data models
│   │   ├── repository/   # DB queries
│   │   ├── ws/           # WebSocket hub
│   │   ├── auth/         # JWT (admin + device tokens)
│   │   └── db/migrations # Auto-applied SQL migrations
│   └── uploads/          # Logos & player photos
│
├── frontend/             # React + TypeScript (Vite)
│   └── src/
│       ├── pages/        # Display, Dashboard, Connect, Login
│       ├── components/
│       ├── store/        # Zustand state
│       └── services/     # API + WebSocket
│
├── nginx/                # Reverse proxy (production)
├── docker-compose.yml    # Production stack
├── run                   # Launcher — macOS / Linux / Git Bash
├── run.ps1               # Launcher — Windows (PowerShell)
└── run.bat               # Launcher — Windows (double-click)
```

---

## ⚙️ Configuration

The launcher auto-creates `backend/.env` from `.env.example`. To change secrets:

```env
JWT_SECRET=your_secret_here_min_32_chars   # change in production!
DB_PASSWORD=your_db_password
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21+, Gin, gorilla/websocket |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Animations | GSAP 3 |
| State | Zustand |
| Database | PostgreSQL 16 |
| Auth | JWT (admin tokens + device tokens) |
| Infra | Docker, Nginx |
