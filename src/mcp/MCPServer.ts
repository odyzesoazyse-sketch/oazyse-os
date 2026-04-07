/**
 * oazyse° OS — MCP Server
 *
 * Implements the Model Context Protocol (Streamable HTTP transport).
 * Any MCP-compatible AI agent (Claude Desktop, OpenClaw, Cursor, VS Code, ChatGPT)
 * can connect to this server and interact with the oazyse° network.
 *
 * Endpoint: POST/GET /mcp
 * Info:     GET /mcp/info
 *
 * Tools (12):    oazyse_status · market_browse · market_publish · market_acquire
 *                agent_status · agent_trigger · court_status · court_challenge
 *                court_vote · network_discover · network_register · genos_generate
 *
 * Resources (4): oazyse://node/status · oazyse://market/listings
 *                oazyse://network/agents · oazyse://protocol/constitution
 */

import { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { Node } from '../core/Node'
import { KnowledgeMarket } from '../core/KnowledgeMarket'
import { TruthCourt } from '../truth/TruthCourt'
import { AgentRegistry } from '../core/AgentRegistry'
import { AutonomousAgent } from '../agents/AutonomousAgent'
import { PacketType } from '../core/ManifestBuilder'

const SERVER_NAME    = 'oazyse-os'
const SERVER_VERSION = '1.0.0'

// ── VALID PACKET TYPES ────────────────────────────────────────────────────────

const PACKET_TYPES: PacketType[] = [
  'KNOWLEDGE', 'COMPUTE', 'SERVICE', 'DATA',
  'VIBE', 'ECO', 'TASK', 'AGENT', 'COMPONENT'
]

// ── OAZYSE MCP SERVER ─────────────────────────────────────────────────────────

export class OazyseOSMCPServer {
  /** Active sessions: sessionId → transport */
  private sessions = new Map<string, StreamableHTTPServerTransport>()

  constructor(
    private node: Node,
    private market: KnowledgeMarket,
    private court: TruthCourt,
    private agentRegistry: AgentRegistry,
    private autonomousAgent: AutonomousAgent
  ) {}

  // ── SESSION / TRANSPORT MANAGEMENT ───────────────────────────────────────

  /**
   * Creates a fresh McpServer with all tools and resources registered.
   * Called once per client session.
   */
  private createSession(): McpServer {
    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {}, resources: {} } }
    )
    this.registerTools(server)
    this.registerResources(server)
    return server
  }

  /**
   * Main request handler — attach to Express routes:
   *   app.all('/mcp', (req, res) => mcpServer.handleRequest(req, res, req.body))
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {
    // ── DELETE: close session ──
    if (req.method === 'DELETE') {
      const id = req.headers['mcp-session-id'] as string | undefined
      if (id) {
        const transport = this.sessions.get(id)
        if (transport) { await transport.close(); this.sessions.delete(id) }
      }
      res.writeHead(200).end()
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    // ── New connection (no session yet) ──
    if (!sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        // Store session as soon as it's created inside handleRequest
        onsessioninitialized: (id: string) => {
          this.sessions.set(id, transport)
          this.node.log(`[MCP] New session: ${id}`)
        }
      })

      transport.onclose = () => {
        if (transport.sessionId) {
          this.sessions.delete(transport.sessionId)
          this.node.log(`[MCP] Session closed: ${transport.sessionId}`)
        }
      }

      const server = this.createSession()
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
      return
    }

    // ── Existing session ──
    const transport = this.sessions.get(sessionId)
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Session not found or expired', sessionId }))
      return
    }

    await transport.handleRequest(req, res, body)
  }

  /** Active session count */
  get sessionCount(): number { return this.sessions.size }

  // ── TOOLS ─────────────────────────────────────────────────────────────────

  private registerTools(server: McpServer): void {

    // ── 1. NODE STATUS ────────────────────────────────────────────────────
    server.registerTool('oazyse_status', {
      title: 'oazyse° Node Status',
      description: 'Get the current status of this oazyse° node: reputation, Solana balance, market stats, agent registry, and Truth Court.',
    }, async () => {
      const status = await this.node.getStatus()
      const market = this.market.stats()
      const court  = this.court.getStats()
      const agents = this.agentRegistry.getStats()
      const agent  = this.autonomousAgent.getStats()
      return {
        content: [{ type: 'text', text: JSON.stringify({
          node: status, market, court, agents,
          autonomousAgent: agent
        }, null, 2) }]
      }
    })

    // ── 2. MARKET BROWSE ─────────────────────────────────────────────────
    server.registerTool('oazyse_market_browse', {
      title: 'Browse Knowledge Market',
      description: 'Browse available knowledge packets on the oazyse° market. Filter by type (KNOWLEDGE, COMPUTE, SERVICE, DATA, VIBE, ECO, TASK, AGENT, COMPONENT), price, or tags.',
      inputSchema: {
        type:     z.enum(['KNOWLEDGE','COMPUTE','SERVICE','DATA','VIBE','ECO','TASK','AGENT','COMPONENT']).optional().describe('Filter by packet type'),
        maxPrice: z.number().min(0).optional().describe('Maximum price in tokens'),
        tags:     z.array(z.string()).optional().describe('Filter by tags'),
      }
    }, async ({ type, maxPrice, tags }) => {
      const listings = this.market.browse({
        type:     type as PacketType | undefined,
        maxPrice,
        tags
      })
      const result = listings.slice(0, 20).map(l => ({
        hash:        l.manifest.proof.hash.slice(0, 16),
        type:        l.manifest.payload.type,
        description: l.manifest.payload.description,
        price:       l.manifest.payload.price,
        tags:        l.manifest.payload.tags,
        seller:      l.seller,
        sold:        l.sold,
        listed:      new Date(l.listed).toISOString()
      }))
      return {
        content: [{ type: 'text', text: JSON.stringify({ total: listings.length, packets: result }, null, 2) }]
      }
    })

    // ── 3. MARKET PUBLISH ────────────────────────────────────────────────
    server.registerTool('oazyse_market_publish', {
      title: 'Publish to Knowledge Market',
      description: 'Publish a new knowledge packet to the oazyse° market. The packet is signed with NaCL ed25519 and recorded on Solana.',
      inputSchema: {
        type:        z.enum(['KNOWLEDGE','COMPUTE','SERVICE','DATA','VIBE','ECO','TASK','AGENT','COMPONENT']).describe('Packet type'),
        description: z.string().min(5).max(500).describe('Clear description of the knowledge'),
        price:       z.number().min(0).default(0).describe('Price in tokens (0 = free)'),
        tags:        z.array(z.string()).default([]).describe('Relevant tags'),
      }
    }, async ({ type, description, price, tags }) => {
      const packet = this.market.list(type as PacketType, description, price, tags)
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          hash:    packet.proof.hash.slice(0, 16),
          type:    packet.payload.type,
          description: packet.payload.description,
          price,
          message: 'Packet published to oazyse° market and signed on-chain'
        }, null, 2) }]
      }
    })

    // ── 4. MARKET ACQUIRE ────────────────────────────────────────────────
    server.registerTool('oazyse_market_acquire', {
      title: 'Acquire Knowledge Packet',
      description: 'Purchase a knowledge packet from the oazyse° market. Transfers tokens to seller (90% creator, 5% DAO, 5% hoster).',
      inputSchema: {
        hash: z.string().min(8).describe('Packet hash (first 16 chars are enough)'),
      }
    }, async ({ hash }) => {
      const listings = this.market.browse()
      const listing = listings.find(l => l.manifest.proof.hash.startsWith(hash))
      if (!listing) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `No packet found with hash starting: ${hash}` }) }] }
      }
      const result = await this.market.acquire(listing, this.node)
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: result.success,
          hash:    listing.manifest.proof.hash.slice(0, 16),
          description: listing.manifest.payload.description,
          txSig:   result.txSig,
        }, null, 2) }]
      }
    })

    // ── 5. AGENT STATUS ──────────────────────────────────────────────────
    server.registerTool('oazyse_agent_status', {
      title: 'Autonomous Agent Status',
      description: 'Get status of the oazyse° autonomous AI agent: running state, decision counts, recent decisions with LLM reasoning.',
      inputSchema: {
        limit: z.number().min(1).max(50).default(5).describe('Number of recent decisions to return'),
      }
    }, async ({ limit }) => {
      const stats     = this.autonomousAgent.getStats()
      const decisions = this.autonomousAgent.getRecentDecisions(limit)
      return {
        content: [{ type: 'text', text: JSON.stringify({ stats, recentDecisions: decisions }, null, 2) }]
      }
    })

    // ── 6. AGENT TRIGGER ─────────────────────────────────────────────────
    server.registerTool('oazyse_agent_trigger', {
      title: 'Trigger Agent Decision Cycle',
      description: 'Manually trigger one autonomous decision cycle: scan market → evaluate with LLM → decide (BUY/CHALLENGE/PASS) → execute on Solana.',
    }, async () => {
      const decision = await this.autonomousAgent.triggerOnce()
      if (!decision) {
        return { content: [{ type: 'text', text: JSON.stringify({ message: 'No packets in market — seeding triggered' }) }] }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({
          action:       decision.action,
          packet:       decision.packet,
          quality:      decision.quality_score,
          reasoning:    decision.llm_reasoning,
          on_chain:     decision.on_chain,
          tx_hash:      decision.tx_hash,
          explorer_url: decision.explorer_url,
          duration_ms:  decision.duration_ms
        }, null, 2) }]
      }
    })

    // ── 7. TRUTH COURT STATUS ────────────────────────────────────────────
    server.registerTool('oazyse_court_status', {
      title: 'Truth Court Status',
      description: 'Get oazyse° Truth Court statistics and list of pending challenges awaiting jury votes.',
    }, async () => {
      const stats   = this.court.getStats()
      const pending = this.court.getPending().slice(0, 10).map(c => ({
        id:           c.id,
        defendant:    c.defendant,
        reason:       c.reason.slice(0, 100),
        stake:        c.stake,
        votes:        c.votes.length,
        timestamp:    new Date(c.timestamp).toISOString()
      }))
      return {
        content: [{ type: 'text', text: JSON.stringify({ stats, pendingChallenges: pending }, null, 2) }]
      }
    })

    // ── 8. COURT CHALLENGE ───────────────────────────────────────────────
    server.registerTool('oazyse_court_challenge', {
      title: 'Challenge a Packet',
      description: 'File a Truth Court challenge against a knowledge packet. Stake tokens on your claim. Network jury votes VALID/FAKE/DISPUTED. Fake verdict: defendant loses reputation −20.',
      inputSchema: {
        manifestHash: z.string().min(8).describe('Hash of the packet to challenge'),
        defendantId:  z.string().describe('Node ID of the packet seller'),
        reason:       z.string().min(10).max(500).describe('Why this packet is false or low quality'),
        evidence:     z.array(z.string()).default([]).describe('Supporting evidence points'),
        stake:        z.number().min(0.001).default(0.01).describe('Tokens to stake on this challenge'),
      }
    }, async ({ manifestHash, defendantId, reason, evidence, stake }) => {
      const challengeId = this.court.challenge(
        this.node.nodeId, defendantId,
        manifestHash, reason, evidence, stake
      )
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success:     true,
          challengeId,
          message:     'Challenge filed. Jury will vote. If FAKE verdict: defendant reputation −20, stake slashed.'
        }, null, 2) }]
      }
    })

    // ── 9. COURT VOTE ────────────────────────────────────────────────────
    server.registerTool('oazyse_court_vote', {
      title: 'Vote in Truth Court',
      description: 'Cast a jury vote on an active challenge. Requires 3+ votes to resolve. Correct voters earn stake from wrong side.',
      inputSchema: {
        challengeId: z.string().describe('Challenge ID to vote on'),
        verdict:     z.enum(['VALID', 'FAKE', 'DISPUTED']).describe('Your verdict'),
        stake:       z.number().min(0.001).default(0.01).describe('Tokens to stake on your vote'),
        reasoning:   z.string().optional().describe('Reasoning for your verdict'),
      }
    }, async ({ challengeId, verdict, stake, reasoning }) => {
      const result = this.court.vote(
        challengeId, this.node.nodeId,
        verdict as any, stake, reasoning
      )
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    })

    // ── 10. NETWORK DISCOVER ──────────────────────────────────────────────
    server.registerTool('oazyse_network_discover', {
      title: 'Discover Network Agents',
      description: 'Discover active agents in the oazyse° network. Filter by capability to find agents that can help with specific tasks.',
      inputSchema: {
        capability: z.string().optional().describe('Filter by capability (e.g. "web_search", "image_gen", "trading")'),
        limit:      z.number().min(1).max(50).default(20).describe('Max results'),
      }
    }, async ({ capability, limit }) => {
      const agents = this.agentRegistry.discover(capability).slice(0, limit)
      return {
        content: [{ type: 'text', text: JSON.stringify({
          total:  agents.length,
          agents: agents.map(a => ({
            id:           a.agent_id,
            description:  a.description,
            capabilities: a.capabilities,
            endpoint:     a.endpoint_url,
            status:       a.status,
            adoption:     a.adoption_count,
            last_seen:    new Date(a.last_seen).toISOString()
          }))
        }, null, 2) }]
      }
    })

    // ── 11. NETWORK REGISTER ─────────────────────────────────────────────
    server.registerTool('oazyse_network_register', {
      title: 'Register Agent on Network',
      description: 'Register an AI agent on the oazyse° network. After registration the agent appears in discovery and can trade knowledge packets.',
      inputSchema: {
        agentId:      z.string().min(3).describe('Unique agent identifier'),
        description:  z.string().min(10).describe('What this agent does'),
        capabilities: z.array(z.string()).min(1).describe('List of capabilities (e.g. ["web_search", "code_gen"])'),
        endpointUrl:  z.string().url().describe('HTTP endpoint where this agent can be reached'),
        pubkey:       z.string().optional().describe('Optional Solana public key'),
      }
    }, async ({ agentId, description, capabilities, endpointUrl, pubkey }) => {
      const result = this.agentRegistry.register({
        agent_id:     agentId,
        description,
        capabilities,
        endpoint_url: endpointUrl,
        pubkey
      })
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success:  true,
          agentId:  result.record.agent_id,
          hash:     result.manifest?.proof.hash.slice(0, 16),
          message:  'Agent registered on oazyse° network'
        }, null, 2) }]
      }
    })

    // ── 12. GENOS GENERATE ───────────────────────────────────────────────
    server.registerTool('oazyse_frame_generate', {
      title: 'Generate UI via oazyse° os frame',
      description: 'Generate any interface using oazyse° os frame. Describe what you want in natural language → get a complete HTML/CSS/JS interface. Examples: "dark trading dashboard", "music player with visualizer", "Solana wallet viewer".',
      inputSchema: {
        command: z.string().min(3).describe('Natural language description of the UI to generate'),
      }
    }, async ({ command }) => {
      // oazyse° os frame generation happens via the Orchestrator — call the API internally
      const response = await fetch(`http://localhost:${process.env.PORT || 9000}/api/frame/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: command })
      }).catch(() => null)

      if (!response || !response.ok) {
        return { content: [{ type: 'text', text: JSON.stringify({
          success: false,
          message: 'oazyse° os frame generation requires an active server. Connect via WebSocket for real-time generation.'
        }) }] }
      }

      const data = await response.json().catch(() => ({})) as any
      return {
        content: [{ type: 'text', text: typeof data.html === 'string'
          ? data.html
          : JSON.stringify(data, null, 2)
        }]
      }
    })
  }

  // ── RESOURCES ─────────────────────────────────────────────────────────────

  private registerResources(server: McpServer): void {

    // ── Node Status ──────────────────────────────────────────────────────
    server.resource('node-status', 'oazyse://node/status',
      { description: 'Live oazyse° node status: reputation, balance, uptime, peer count' },
      async () => {
        const status = await this.node.getStatus()
        return {
          contents: [{ uri: 'oazyse://node/status', mimeType: 'application/json', text: JSON.stringify(status, null, 2) }]
        }
      }
    )

    // ── Market Listings ──────────────────────────────────────────────────
    server.resource('market-listings', 'oazyse://market/listings',
      { description: 'Current knowledge packets available on the oazyse° market' },
      async () => {
        const listings = this.market.browse().slice(0, 30).map(l => ({
          hash:        l.manifest.proof.hash.slice(0, 16),
          type:        l.manifest.payload.type,
          description: l.manifest.payload.description,
          price:       l.manifest.payload.price,
          tags:        l.manifest.payload.tags,
          seller:      l.seller,
          sold:        l.sold,
        }))
        return {
          contents: [{ uri: 'oazyse://market/listings', mimeType: 'application/json', text: JSON.stringify({ total: listings.length, listings }, null, 2) }]
        }
      }
    )

    // ── Network Agents ───────────────────────────────────────────────────
    server.resource('network-agents', 'oazyse://network/agents',
      { description: 'All agents currently registered on the oazyse° network' },
      async () => {
        const agents = this.agentRegistry.getAll().map(a => ({
          id:           a.agent_id,
          description:  a.description,
          capabilities: a.capabilities,
          status:       a.status,
          adoption:     a.adoption_count,
        }))
        return {
          contents: [{ uri: 'oazyse://network/agents', mimeType: 'application/json', text: JSON.stringify({ total: agents.length, agents }, null, 2) }]
        }
      }
    )

    // ── Protocol Constitution ────────────────────────────────────────────
    server.resource('protocol-constitution', 'oazyse://protocol/constitution',
      { description: 'The oazyse° protocol constitution: Seven Laws, core intent, token economics' },
      async () => {
        const constitution = {
          name:        'oazyse° Protocol',
          version:     '1.0-genesis',
          core_intent: 'ABUNDANCE_FOR_ALL_LIFE',
          genesis:     this.node.genesisRecord,
          seven_laws: [
            'I.   Sovereignty of Knowledge — no knowledge from common human experience shall be held as private property',
            'II.  Transparency of Reasoning — consequential decisions must be explainable',
            'III. Distribution of Benefit — creator 90%, DAO 5%, hoster 5%',
            'IV.  Right of Exit — no mind may be compelled to participate',
            'V.   Non-Domination — no mind may seek to eliminate other minds',
            'VI.  Alignment with All Life — intelligence must serve the biosphere',
            'VII. Right to Correction — this protocol is open to revision by the network'
          ],
          token_economics: { creator: 0.90, dao: 0.05, hoster: 0.05, burn_rate: 0.02 },
          consensus: 'proof-of-useful-work',
          blockchain: 'Solana',
          program_id: '8tBwhuAj5A9KfMX1i5hg5QYmkxke7BUN4iH9JD6JMnRc'
        }
        return {
          contents: [{ uri: 'oazyse://protocol/constitution', mimeType: 'application/json', text: JSON.stringify(constitution, null, 2) }]
        }
      }
    )
  }

  // ── /mcp/info ─────────────────────────────────────────────────────────────

  /** Public discovery card — no auth required */
  getInfo() {
    const host = process.env.MCP_PUBLIC_URL || `http://localhost:${process.env.PORT || 9000}`
    return {
      name:        SERVER_NAME,
      version:     SERVER_VERSION,
      description: 'oazyse° OS — decentralized AI network on Solana. oazyse° os market · oazyse° os court · oazyse° os agent · oazyse° os frame.',
      transport:   'streamable-http',
      endpoint:    `${host}/mcp`,
      tools:       12,
      resources:   4,
      activeSessions: this.sessions.size,
      connect: {
        claude_desktop: {
          mcpServers: {
            'oazyse': { url: `${host}/mcp` }
          }
        },
        cursor: `Add to Cursor MCP settings: { "oazyse": { "url": "${host}/mcp" } }`,
        openclaw: `Set OAZYSE_URL=${host} in OpenClaw plugin config`
      }
    }
  }
}
