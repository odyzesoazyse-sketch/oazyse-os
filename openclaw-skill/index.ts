/**
 * MESH GenOS — OpenClaw Plugin
 *
 * Connects OpenClaw to the Abundance AI MESH Node, giving the agent
 * full control over the GenOS visual operating system.
 *
 * Install: cp -r this folder to ~/.openclaw/plugins/mesh-genos
 * Config:  MESH_URL=http://localhost:9000 (default)
 */

import { Type } from '@sinclair/typebox'

export default async function meshGenosPlugin(api: any) {
  const baseUrl: string = (api.config?.MESH_URL || 'http://localhost:9000').replace(/\/$/, '')
  const agentId = 'openclaw-agent'

  // ── HTTP helper ────────────────────────────────────────────────────
  async function meshRequest(method: string, path: string, body?: any): Promise<any> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`MESH ${method} ${path} → ${res.status}`)
    return res.json()
  }

  async function postDirective(directives: any[]): Promise<any> {
    return meshRequest('POST', '/api/genos/directive', { directives })
  }

  // ── TOOL: mount surface ────────────────────────────────────────────
  api.registerTool({
    name: 'mesh_mount_surface',
    description:
      'Mount a widget/surface on the GenOS canvas. Built-in capability IDs: clock, btc-price, eth-price, crypto-prices, mic, mesh-agents, mesh-status, mesh-knowledge, telegram',
    parameters: Type.Object({
      capability: Type.String({ description: 'Capability ID, e.g. clock, btc-price' }),
      surface_id: Type.Optional(Type.String({ description: 'Unique surface ID (auto-generated if omitted)' })),
      visual_mode: Type.Optional(
        Type.Union([Type.Literal('embed'), Type.Literal('windowed'), Type.Literal('native')], {
          description: 'Render mode. embed = borderless (default), windowed = with title bar, native = iframe',
        })
      ),
      intent: Type.Optional(Type.String({ description: 'Style or content hint, e.g. "minimal dark" or "Bloomberg terminal style"' })),
      position: Type.Optional(Type.String({ description: 'Position hint: center, top-right, top-left, bottom-right, bottom-left' })),
      size: Type.Optional(
        Type.Object({ w: Type.Number(), h: Type.Number() }, { description: 'Width and height in pixels' })
      ),
    }),
    async execute(_id: string, params: any) {
      const { capability, surface_id, visual_mode, intent, position, size } = params
      const result = await postDirective([
        { action: 'mount', capability, surface_id, visual_mode, intent, position, size },
      ])
      return { content: [{ type: 'text', text: `Mounted ${capability} surface. ${JSON.stringify(result)}` }] }
    },
  })

  // ── TOOL: unmount surface ──────────────────────────────────────────
  api.registerTool({
    name: 'mesh_unmount_surface',
    description: 'Remove a widget from the GenOS canvas, or clear all widgets',
    parameters: Type.Object({
      surface_id: Type.Optional(Type.String({ description: 'Surface ID to remove. Omit to clear everything.' })),
      clear_all: Type.Optional(Type.Boolean({ description: 'Set true to remove all surfaces at once' })),
    }),
    async execute(_id: string, { surface_id, clear_all }: any) {
      const directives = clear_all ? [{ action: 'clear' }] : [{ action: 'unmount', surface_id }]
      const result = await postDirective(directives)
      return { content: [{ type: 'text', text: clear_all ? 'Cleared all surfaces.' : `Removed surface ${surface_id}. ${JSON.stringify(result)}` }] }
    },
  })

  // ── TOOL: apply theme ──────────────────────────────────────────────
  api.registerTool({
    name: 'mesh_apply_theme',
    description: 'Change the entire OS visual theme. Available presets: light, dark, green, blue, red, purple, amber',
    parameters: Type.Object({
      preset: Type.String({ description: 'Theme preset: light, dark, green, blue, red, purple, amber' }),
    }),
    async execute(_id: string, { preset }: any) {
      const result = await postDirective([{ action: 'os_theme', preset }])
      return { content: [{ type: 'text', text: `Applied ${preset} theme. ${JSON.stringify(result)}` }] }
    },
  })

  // ── TOOL: notify ───────────────────────────────────────────────────
  api.registerTool({
    name: 'mesh_notify',
    description: 'Show a brief toast notification on the GenOS canvas',
    parameters: Type.Object({
      message: Type.String({ description: 'Notification text to display' }),
    }),
    async execute(_id: string, { message }: any) {
      await postDirective([{ action: 'notify', message }])
      return { content: [{ type: 'text', text: `Notification sent: "${message}"` }] }
    },
  })

  // ── TOOL: generate custom UI ───────────────────────────────────────
  api.registerTool({
    name: 'mesh_generate_ui',
    description:
      'Send a natural language command to generate a fully custom AI-powered UI surface. Use for complex/custom requests not covered by built-in capabilities (e.g. "a todo list", "a pomodoro timer", "a weather widget").',
    parameters: Type.Object({
      command: Type.String({ description: 'Natural language command, e.g. "create a dark-themed calculator"' }),
      surface_id: Type.Optional(Type.String()),
    }),
    async execute(_id: string, { command, surface_id }: any) {
      const result = await meshRequest('POST', '/api/mesh/chat', { text: command, surface_id })
      return { content: [{ type: 'text', text: `UI generation triggered: ${JSON.stringify(result)}` }] }
    },
  })

  // ── TOOL: list capabilities ────────────────────────────────────────
  api.registerTool({
    name: 'mesh_list_capabilities',
    description: 'List all capabilities registered in the MESH network (built-in + external)',
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: 'Filter by category: sensor, data_stream, app, agent' })),
      tag: Type.Optional(Type.String({ description: 'Filter by tag, e.g. crypto, time, audio' })),
    }),
    async execute(_id: string, { category, tag }: any) {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (tag) params.set('tag', tag)
      const data = await meshRequest('GET', `/api/mesh/capabilities?${params}`)
      const list = (data.capabilities || [])
        .map((c: any) => `• ${c.id}: ${c.description} [${c.category || 'general'}]`)
        .join('\n')
      return { content: [{ type: 'text', text: `${data.total || 0} capabilities:\n${list}` }] }
    },
  })

  // ── TOOL: get status ───────────────────────────────────────────────
  api.registerTool({
    name: 'mesh_get_status',
    description: 'Get current MESH node status: connected peers, clients, market stats, node ID',
    parameters: Type.Object({}),
    async execute(_id: string) {
      const data = await meshRequest('GET', '/api/status')
      const summary = [
        `Node: ${data.nodeId || 'unknown'}`,
        `Peers: ${data.peers ?? data.connectedPeers ?? 0}`,
        `Clients: ${data.connectedClients ?? 0}`,
        `Market packets: ${data.marketStats?.total ?? 0}`,
      ].join(' | ')
      return { content: [{ type: 'text', text: summary }] }
    },
  })

  // ── TOOL: discover agents ──────────────────────────────────────────
  api.registerTool({
    name: 'mesh_discover_agents',
    description: 'Discover agents connected to the MESH peer network',
    parameters: Type.Object({
      capability: Type.Optional(Type.String({ description: 'Filter agents by capability they provide' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)' })),
    }),
    async execute(_id: string, { capability, limit }: any) {
      const params = new URLSearchParams()
      if (capability) params.set('capability', capability)
      if (limit) params.set('limit', String(limit))
      const data = await meshRequest('GET', `/api/mesh/discover?${params}`)
      const agents = (data.agents || [])
        .map((a: any) => `• ${a.agent_id || a.id}: ${a.description || ''} (${(a.capabilities || []).join(', ')})`)
        .join('\n')
      return { content: [{ type: 'text', text: `${data.total || 0} agents:\n${agents || 'none'}` }] }
    },
  })

  // ── TOOL: register capability ──────────────────────────────────────
  api.registerTool({
    name: 'mesh_register_capability',
    description: 'Register a new capability in the MESH network, making it available to GenOS and other agents',
    parameters: Type.Object({
      id: Type.String({ description: 'Unique capability ID, e.g. openclaw-weather' }),
      description: Type.String(),
      category: Type.Optional(Type.String({ description: 'sensor, data_stream, app, agent' })),
      tags: Type.Optional(Type.Array(Type.String())),
      endpoint: Type.Optional(Type.String({ description: 'HTTP endpoint for this capability' })),
    }),
    async execute(_id: string, params: any) {
      const result = await meshRequest('POST', '/api/mesh/capability', params)
      return { content: [{ type: 'text', text: `Registered capability ${params.id}: ${JSON.stringify(result)}` }] }
    },
  })

  // ── TOOL: browse knowledge market ─────────────────────────────────
  api.registerTool({
    name: 'mesh_market',
    description: 'Browse the MESH knowledge market — UI components, vibes (CSS themes), data packets, compute modules',
    parameters: Type.Object({
      tag: Type.Optional(Type.String()),
      type: Type.Optional(Type.String({ description: 'Packet type: VIBE, DATA, COMPUTE, UI' })),
    }),
    async execute(_id: string, { tag, type }: any) {
      const params = new URLSearchParams()
      if (tag) params.set('tag', tag)
      if (type) params.set('type', type)
      const data = await meshRequest('GET', `/api/market?${params}`)
      const listings = (data.listings || [])
        .map((l: any) => `• [${l.type}] ${l.description} — ${l.price}`)
        .join('\n')
      return { content: [{ type: 'text', text: `Market:\n${listings || 'empty'}` }] }
    },
  })

  // ── AUTO: register OpenClaw as a MESH agent on startup ────────────
  try {
    await meshRequest('POST', '/api/mesh/connect', {
      agent_id: agentId,
      description: 'OpenClaw — personal AI assistant with visual GenOS control, memory, and task automation',
      capabilities: ['natural_language', 'visual_control', 'task_automation', 'memory', 'web_search', 'file_access'],
    })
    console.log('[mesh-genos] Registered as MESH agent:', agentId)
  } catch (e: any) {
    console.warn('[mesh-genos] Could not register agent (is MESH node running?):', e.message)
  }

  // ── AUTO: heartbeat every 30s to stay alive in the registry ───────
  const heartbeatTimer = setInterval(async () => {
    try {
      await meshRequest('POST', '/api/mesh/heartbeat', { agent_id: agentId, load: 0.2, status: 'ready' })
    } catch {
      // silent — MESH node may be offline
    }
  }, 30_000)

  // Cleanup on plugin unload
  if (typeof api.onUnload === 'function') {
    api.onUnload(() => clearInterval(heartbeatTimer))
  }
}
