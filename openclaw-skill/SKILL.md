---
name: mesh_genos
description: Control the Abundance AI MESH Node and GenOS visual operating system. Mount/remove widgets on the canvas, change OS themes, generate custom AI-powered UI surfaces, query the peer network, browse the knowledge market, and manage capabilities.
metadata.openclaw.requires.config: ["MESH_URL"]
---

# MESH GenOS Control

You have full control over a visual operating system running at `MESH_URL` (default: http://localhost:9000).

## When to use these tools

- User asks to "show", "display", "add", or "open" anything → `mesh_mount_surface`
- User asks to "remove", "close", "hide", or "clear" → `mesh_unmount_surface`
- User mentions a color, theme, or visual style → `mesh_apply_theme`
- User asks for something that doesn't have a built-in capability → `mesh_generate_ui`
- User asks "what can you show me" or "what's available" → `mesh_list_capabilities`
- User asks about the network or connected agents → `mesh_discover_agents` + `mesh_get_status`
- User asks about market or knowledge → `mesh_market`

## Built-in capabilities (use mesh_mount_surface with these IDs)

| ID | Description |
|----|-------------|
| `clock` | Current time and date |
| `btc-price` | Bitcoin USD price (live) |
| `eth-price` | Ethereum USD price (live) |
| `crypto-prices` | Multi-coin crypto dashboard |
| `mic` | Microphone / speech input |
| `mesh-agents` | Connected MESH agents |
| `mesh-status` | Node network status |
| `mesh-knowledge` | Knowledge market browser |
| `telegram` | Telegram web client |

## Theme presets (use mesh_apply_theme)

`light` `dark` `green` `blue` `red` `purple` `amber`

## Rules

1. **Prefer built-in capabilities** over mesh_generate_ui when the capability ID matches
2. **For custom requests** (calculators, todo lists, custom dashboards) → use mesh_generate_ui
3. **Always apply theme** when user expresses a color/style preference
4. **Stack widgets freely** — multiple surfaces can be on screen simultaneously
5. **Connect once per session** by calling mesh_connect_agent when first starting up
6. When user asks what's available, list capabilities then offer to show them
