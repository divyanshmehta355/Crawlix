# 🕷️ Crawlix — Autonomous Web Crawler & Interactive Automation Studio

![Crawlix Banner](https://img.shields.io/badge/CRAWLIX-Autonomous%20Brave%20Engine-ff5500?style=for-the-badge&logo=brave)
![React 19](https://img.shields.io/badge/Frontend-React%2019%20+%20Vite-00f0ff?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?style=for-the-badge&logo=typescript)
![Playwright](https://img.shields.io/badge/Automation-Playwright--Core-2e8b57?style=for-the-badge&logo=playwright)
![Express](https://img.shields.io/badge/Backend-Express%205-10b981?style=for-the-badge&logo=express)

**Crawlix** is a full-stack automated web crawler, visual network explorer, interactive teaching studio, and autonomous batch workflow engine powered by **Brave Browser** and **Playwright-Core**.

---

## 🌟 Core Features

### 1. 🕷️ Autonomous BFS Web Crawler
- **Live Brave Automation**: Driven by visible or headless Brave browser with anti-bot stealth parameters.
- **Deep Metadata Extraction**: Captures titles, meta descriptions, HTTP status codes, headings, load latency, and full page snapshots.
- **Interactive Network Graph**: Real-time D3 force-directed visual canvas mapping internal/external link topology with god-node discovery.
- **Real-Time SSE Streaming**: Instant event broadcasting of pages, metrics, logs, and graph nodes to the dashboard.

### 2. 🎓 Teaching Studio (Learning by Demonstration)
- **Zero-Code Automation**: Teach Crawlix complex multi-step workflows by demonstrating them live in a visible Brave window.
- **Injected Floating HUD**: Real-time feedback toolbar injected directly into target pages showing recorded actions and extraction targets.
- **Persistent Workflow Recipes**: Saves recorded sequences as reusable JSON workflows (`server/data/recipes.json`) with 1-click execution.

### 3. 🎬 Autonomous Batch Card Loop Automator
- **Catalog Card Traversal**: Automatically loops through item cards matching configurable CSS selectors.
- **Dynamic Quality Selection**: Traverses intermediary landing pages and picks the highest available quality tier (e.g. `1080p` > `720p` > `480p`).
- **Server Prioritization**: Automatically prioritizes high-speed mirrors and direct CDNs (e.g. `FSLv2 Server`).
- **Batch Link Exporters**:
  - 📋 **1-Click Copy All**: Instantly copies all resolved direct URLs to clipboard.
  - 💾 **Plain .TXT Export**: Formatted for direct drag-and-drop into download managers (**IDM**, **JDownloader**).
  - 📊 **CSV & JSON Exports**: Complete dataset with titles, quality tags, and timestamp metadata.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Vanilla CSS Design System, Lucide Icons, Canvas Confetti |
| **Backend** | Express 5, Server-Sent Events (SSE), Node.js (v22+) |
| **Browser Engine** | Playwright-Core, Brave Browser (`brave.exe` / `brave-browser`) |
| **Packaging** | Docker (Playwright Ubuntu Jammy), Docker Compose |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) v20+
- [Brave Browser](https://brave.com/) installed on your machine

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/crawlix.git
cd crawlix

# Install dependencies
npm install

# Start both backend and frontend concurrently
npm run dev
```

The application will be live at:
- **Frontend Dashboard**: `http://localhost:5173/`
- **Backend Automation API**: `http://localhost:3001/`

---

## 🐳 Docker & Cloud Deployment

Crawlix is containerized and ready for single-port deployment to **Render**, **Railway**, **Fly.io**, or any Linux VPS:

```bash
# Build and run with Docker Compose
docker compose up -d
```

Or build manually:
```bash
docker build -t crawlix .
docker run -d -p 3001:3001 crawlix
```

Access the complete dashboard and API at `http://localhost:3001/`.

---

## 📡 API Reference

- `GET /api/system/browser` — Check detected Brave/Chromium binary path and status.
- `GET /api/crawl/events` — Server-Sent Events (SSE) live stream.
- `POST /api/crawl/start` — Initiate an autonomous BFS crawl.
- `POST /api/loop/start` — Start the batch card loop automator.
- `GET /api/loop/progress` — Get current progress and extracted links vault.
- `GET /api/loop/export/:format` — Download links as `txt`, `csv`, or `json`.
- `POST /api/teaching/start` — Launch visible Brave with the teaching studio toolbar.
- `POST /api/recipes/execute` — Execute a learned recipe autonomously.

---

## 📄 License
MIT License. Created with Google DeepMind Advanced Agentic Coding.
