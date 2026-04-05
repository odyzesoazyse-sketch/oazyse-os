# MESH GenOS — OpenClaw Plugin

Connects [OpenClaw](https://openclaw.ai) to the Abundance AI MESH Node, giving your AI agent full control over the GenOS visual operating system through Telegram, WhatsApp, Discord, or any other OpenClaw channel.

## What it does

Write in Telegram → OpenClaw understands → GenOS reacts visually:

- **"show me bitcoin price"** → mounts btc-price widget on the canvas
- **"dark theme"** → switches the entire OS to dark mode
- **"create a todo list"** → LLM generates a custom surface on-the-fly
- **"clear everything"** → removes all widgets
- **"who's on the network?"** → queries connected MESH peers

## Available tools (10)

| Tool | What it does |
|------|-------------|
| `mesh_mount_surface` | Mount any built-in or custom widget |
| `mesh_unmount_surface` | Remove a widget or clear all |
| `mesh_apply_theme` | Change OS theme: light/dark/green/blue/red/purple/amber |
| `mesh_notify` | Show a toast notification |
| `mesh_generate_ui` | Generate a custom AI-powered surface via LLM |
| `mesh_list_capabilities` | List all capabilities in the MESH network |
| `mesh_get_status` | Node status: peers, clients, market stats |
| `mesh_discover_agents` | Discover connected MESH agents |
| `mesh_register_capability` | Register a new capability |
| `mesh_market` | Browse the knowledge market |

## Installation

### 1. Start the MESH node

```bash
cd ~/Documents/Abundance\ AI
npm run start
# Node runs at http://localhost:9000
```

### 2. Install the plugin

```bash
cp -r openclaw-skill ~/.openclaw/plugins/mesh-genos
cd ~/.openclaw/plugins/mesh-genos
npm install
npm run build
```

### 3. Configure OpenClaw

In your OpenClaw config or `.env`:
```
MESH_URL=http://localhost:9000
```

If your MESH node is on a different machine:
```
MESH_URL=http://192.168.1.x:9000
```

### 4. Restart OpenClaw

OpenClaw will auto-discover the plugin and register itself as a MESH agent. You'll see:
```
[mesh-genos] Registered as MESH agent: openclaw-agent
```

## Built-in capabilities

| ID | Description |
|----|-------------|
| `clock` | Current time and date |
| `btc-price` | Bitcoin USD (live) |
| `eth-price` | Ethereum USD (live) |
| `crypto-prices` | Multi-coin dashboard |
| `mic` | Microphone / speech |
| `mesh-agents` | Connected agents list |
| `mesh-status` | Network status |
| `mesh-knowledge` | Knowledge market |
| `telegram` | Telegram web client |

## Architecture

```
Telegram / WhatsApp
      ↓
OpenClaw agent (your machine)
  ├── memory: user preferences, history
  ├── mesh-genos plugin
  │     ├── mesh_mount_surface → POST /api/genos/directive
  │     ├── mesh_apply_theme   → POST /api/genos/directive
  │     └── mesh_generate_ui   → POST /api/mesh/chat → LLM → surface
  └── heartbeat every 30s → POST /api/mesh/heartbeat
      ↓
MESH Node (localhost:9000)
  └── WebSocket broadcast → SURFACE_DIRECTIVE
      ↓
GenOS Dashboard (browser)
  └── widget appears on canvas
```

## Examples

```
You:    "show clock in the top corner"
Claw:   mesh_mount_surface({capability:'clock', position:'top-right'})
GenOS:  clock widget appears

You:    "make it green"
Claw:   mesh_apply_theme({preset:'green'})
GenOS:  entire OS switches to green theme

You:    "build me a pomodoro timer"
Claw:   mesh_generate_ui({command:'pomodoro timer with 25min work, 5min break, dark style'})
GenOS:  AI generates custom timer surface

You:    "who's connected to the network?"
Claw:   mesh_discover_agents({})
You:    "3 agents: openclaw-agent, trader-bot, my-phone"

You:    "clear the screen"
Claw:   mesh_unmount_surface({clear_all: true})
GenOS:  all surfaces removed
```
