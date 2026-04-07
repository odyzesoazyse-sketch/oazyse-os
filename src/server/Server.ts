import express from 'express'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import cors from 'cors'
import path from 'path'
import { Node } from '../core/Node'
import { KnowledgeMarket } from '../core/KnowledgeMarket'
import { TruthCourt } from '../truth/TruthCourt'
import { Orchestrator } from '../agents/Orchestrator'
import { ProgressTracker } from '../memory/ProgressTracker'
import { PacketType, ManifestBuilder } from '../core/ManifestBuilder'
import { AgentRegistry } from '../core/AgentRegistry'
import { AgentJudge } from '../core/AgentJudge'
import { TokenEconomics } from '../token/TokenEconomics'
import { AutonomousAgent } from '../agents/AutonomousAgent'
import { OazyseNetProgram } from '../blockchain/MeshProgram'
import { OazyseOSMCPServer } from '../mcp/MCPServer'

const PORT = Number(process.env.PORT) || 9000

export class OazyseServer {
  app = express()
  server: http.Server
  wss: WebSocketServer
  node: Node
  tokenEconomics: TokenEconomics
  market: KnowledgeMarket
  court: TruthCourt
  orchestrator: Orchestrator
  tracker: ProgressTracker
  agentRegistry: AgentRegistry
  agentJudge: AgentJudge
  autonomousAgent: AutonomousAgent
  mcpServer: OazyseOSMCPServer
  clients = new Set<WebSocket>()
  peers = new Map<string, WebSocket>() // remote node connections
  // Known remote oazyse° os nodes: nodeId → { url, connectedAt }
  remotePeers = new Map<string, { url: string; nodeId: string; connectedAt: number }>()

  constructor() {
    this.node = new Node()
    this.tokenEconomics = new TokenEconomics()
    this.market = new KnowledgeMarket(this.node, this.tokenEconomics)
    this.court = new TruthCourt(this.node, this.tokenEconomics)
    this.orchestrator = new Orchestrator(this.node)
    this.autonomousAgent = new AutonomousAgent(
      this.node, this.market, this.court, this.tokenEconomics,
      (decision) => {
        this.broadcastJson({ type: 'AI_DECISION', data: decision })
        const icon = decision.action === 'BUY' ? '🟢' : decision.action === 'CHALLENGE' ? '🔴' : '⚪'
        this.broadcast('AI', `${icon} ${decision.action}: "${decision.packet.description.slice(0, 40)}" quality=${decision.quality_score} ${decision.on_chain ? '✓ on-chain' : '(local)'}`)
      }
    )
    this.tracker = new ProgressTracker()
    this.agentRegistry = new AgentRegistry(this.node)
    this.agentJudge = new AgentJudge(this.node)
    this.mcpServer = new OazyseOSMCPServer(
      this.node, this.market, this.court,
      this.agentRegistry, this.autonomousAgent
    )

    this.app.use(cors())
    this.app.use(express.json())
    this.app.use(express.static(path.join(__dirname, '../../dashboard'), { index: false }))

    this.server = http.createServer(this.app)
    this.wss = new WebSocketServer({ server: this.server })

    this.setupRoutes()
    this.setupWebSocket()
  }

  // ── REST API ──────────────────────────────────────────────

  private setupRoutes() {
    // Node status
    this.app.get('/api/status', async (req, res) => {
      const status = await this.node.getStatus()
      const genesis = this.node.genesisRecord
      res.json({
        ...status,
        connectedClients: this.clients.size,
        connectedPeers: this.peers.size,
        marketStats: this.market.stats(),
        courtStats: this.court.getStats(),
        protocol: {
          version: genesis?.header?.version || '1.0-genesis',
          constitution_hash: genesis?.header?.constitution_hash || '12942e3a558089b2831cdbb8c094e8e2528017d94208c1374d2861ebab303945',
          core_intent: genesis?.core_intent || 'ABUNDANCE_FOR_ALL_LIFE',
          settlement_layer: genesis?.header?.settlement_layer || 'solana-devnet',
        }
      })
    })

    // Dynamic LLM Config
    this.app.post('/api/config/llm', (req, res) => {
      const { key } = req.body
      if (!key) return res.status(400).json({ error: 'key required' })
      const success = this.orchestrator.llmEngine.setApiKey(key)
      if (success) {
        this.broadcast('SYS', 'oazyse° os frame engine unlocked via dynamic API key')
        res.json({ success: true })
      } else {
        res.status(400).json({ error: 'invalid key structure' })
      }
    })

    // Knowledge market — browse
    this.app.get('/api/market', (req, res) => {
      const tag = req.query.tag as string | undefined
      const type = req.query.type as PacketType | undefined
      const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined

      const filter: any = {}
      if (tag) filter.tags = [tag]
      if (type) filter.type = type
      if (maxPrice !== undefined) filter.maxPrice = maxPrice

      const listings = this.market.browse(Object.keys(filter).length > 0 ? filter : undefined)
      res.json({
        listings: listings.map(l => ({
          hash: l.manifest.proof.hash.slice(0, 12),
          type: l.manifest.payload.type,
          description: l.manifest.payload.description,
          price: l.manifest.payload.price,
          tags: l.manifest.payload.tags,
          seller: l.seller,
          listed: l.listed
        })),
        stats: this.market.stats()
      })
    })

    // oazyse° os frame unified market endpoint (for sharing over WebRTC)
    this.app.get('/api/frame/market', (req, res) => {
      // Return everything currently in the oazyse° os market store, so the browser can share it
      const packets = this.orchestrator.knowledgeAgent.getMarketPackets()
      res.json({
        listings: packets
      })
    })

    // Offer knowledge
    this.app.post('/api/offer', (req, res) => {
      const { type, description, price, tags } = req.body
      if (!type || !description) {
        return res.status(400).json({ error: 'type and description required' })
      }
      const manifest = this.market.list(
        type as PacketType,
        description,
        price || 0,
        tags || []
      )
      this.broadcast('MARKET', `New listing: [${type}] ${description}`)
      res.json({
        success: true,
        hash: manifest.proof.hash.slice(0, 12),
        summary: `[${type}] "${description}" @ ${price || 0} tokens`
      })
    })

    // Truth court — stats
    this.app.get('/api/court', (req, res) => {
      res.json({
        stats: this.court.getStats(),
        pending: this.court.getPending().map(c => ({
          id: c.id,
          reason: c.reason,
          defendant: c.defendant,
          stake: c.stake,
          votes: c.votes.length
        }))
      })
    })

    // File a challenge
    this.app.post('/api/challenge', (req, res) => {
      const { defendantId, manifestHash, reason, evidence, stake } = req.body
      if (!defendantId || !reason) {
        return res.status(400).json({ error: 'defendantId and reason required' })
      }
      const id = this.court.challenge(
        this.node.nodeId,
        defendantId,
        manifestHash || 'unknown',
        reason,
        evidence || [],
        stake || 0.01
      )
      this.broadcast('TRUTH', `Challenge filed: ${reason}`)
      
      // Broadcast to all oazyse° os frame clients
      this.broadcastJson({
        type: 'JURY_DUTY',
        data: {
          challengeId: id,
          defendant: defendantId,
          reason: reason,
          stake: stake || 0.01,
          timeLimit: 15 // seconds
        }
      })
      
      res.json({ success: true, challengeId: id })
    })

    // P2P — list connected peers
    this.app.get('/api/peers', (req, res) => {
      const peerList: any[] = []
      this.node.peers.forEach((data, id) => {
        peerList.push({ nodeId: id, ...data })
      })
      res.json({ peers: peerList, count: peerList.length })
    })

    // Analyze data with orchestrator
    this.app.post('/api/analyze', async (req, res) => {
      const { text, query } = req.body
      const insight = await this.orchestrator.analyze({ text, query })
      res.json(insight)
    })

    // Progress tracker
    this.app.get('/api/goals', (req, res) => {
      res.json({ goals: this.tracker.getAllGoals() })
    })

    // ── oazyse° os net — Agent Connection ─────────────────────

    // Подключить агента к сети
    this.app.post('/api/net/connect', (req, res) => {
      const { agent_id, capabilities, endpoint_url, description, pubkey } = req.body
      if (!agent_id || !description) {
        return res.status(400).json({ error: 'agent_id and description required' })
      }
      const { record, manifest } = this.agentRegistry.register({
        agent_id,
        description,
        capabilities: capabilities || [],
        endpoint_url: endpoint_url || '',
        pubkey
      })
      this.broadcast('AGENT', `New agent joined: ${agent_id} — [${record.capabilities.join(', ')}]`)
      this.broadcastJson({ type: 'AGENT_UPDATE', data: this.agentRegistry.getStats() })
      res.json({
        success: true,
        record,
        manifest_hash: manifest.proof.hash,
        network_summary: {
          agents: this.agentRegistry.getStats().total,
          knowledge_packets: this.market.stats().total,
          node_id: this.node.nodeId,
          manifest_values: 'ABUNDANCE_FOR_ALL_LIFE'
        }
      })
    })

    // Найти агентов по способности
    this.app.get('/api/net/discover', (req, res) => {
      const capability = req.query.capability as string | undefined
      const limit = req.query.limit ? Number(req.query.limit) : 20
      const agents = this.agentRegistry.discover(capability).slice(0, limit)
      res.json({ agents, total: agents.length, capability: capability || 'all' })
    })

    // Heartbeat — агент сигнализирует что жив
    this.app.post('/api/net/heartbeat', (req, res) => {
      const { agent_id, load, status } = req.body
      if (!agent_id) return res.status(400).json({ error: 'agent_id required' })
      const ok = this.agentRegistry.heartbeat(agent_id, load, status)
      if (!ok) return res.status(404).json({ error: 'Agent not found. Use /api/net/connect first.' })
      res.json({ ok: true, timestamp: Date.now() })
    })

    // Онбординг — что агент может предложить сети
    this.app.get('/api/net/onboard', (req, res) => {
      const describe = req.query.describe as string || ''
      if (!describe) return res.status(400).json({ error: 'describe query param required' })
      const suggestion = this.agentRegistry.getOnboardingSuggestion(describe)
      res.json(suggestion)
    })

    // ── JUDGE — Эволюционный движок ───────────────────────────

    // Подать реализацию на оценку
    this.app.post('/api/judge/submit', (req, res) => {
      const { manifest } = req.body
      if (!manifest) return res.status(400).json({ error: 'manifest required' })
      const evaluationId = this.agentJudge.submit(manifest)
      this.broadcast('JUDGE', `New implementation submitted for evaluation: ${manifest.payload?.description ?? '?'}`)
      this.broadcastJson({ type: 'EVOLUTION_UPDATE', data: this.agentJudge.getStats() })
      res.json({ success: true, evaluationId })
    })

    // Лидерборд реализаций
    this.app.get('/api/judge/leaderboard', (req, res) => {
      const leaderboard = this.agentJudge.getLeaderboard()
      res.json({ leaderboard, interfaceType: 'all' })
    })
    this.app.get('/api/judge/leaderboard/:type', (req, res) => {
      const interfaceType = req.params.type
      const leaderboard = this.agentJudge.getLeaderboard(interfaceType)
      res.json({ leaderboard, interfaceType })
    })

    // Сигнал принятия реализации
    this.app.post('/api/judge/adopt/:hash', (req, res) => {
      const { hash } = req.params
      const nodeId = req.body.nodeId || this.node.nodeId
      const result = this.agentJudge.adoptImplementation(hash, nodeId)
      if (result.ok) {
        this.broadcast('JUDGE', `Implementation adopted: ${hash.slice(0, 8)}… — ${result.message}`)
        this.broadcastJson({ type: 'EVOLUTION_UPDATE', data: this.agentJudge.getStats() })
      }
      res.json(result)
    })

    // Таймлайн эволюции
    this.app.get('/api/judge/evolution', (req, res) => {
      const interfaceType = req.query.type as string | undefined
      res.json({
        timeline: this.agentJudge.getEvolutionTimeline(interfaceType),
        stats: this.agentJudge.getStats()
      })
    })

    // ── PROTOCOL & NETWORK CONSTITUTION ──────────────────────

    // Returns the protocol constitution — works on any settlement layer
    this.app.get('/api/protocol', (_req, res) => {
      res.json({
        name: 'oazyse° os net',
        version: '1.0-genesis',
        core_intent: 'ABUNDANCE_FOR_ALL_LIFE',
        constitution_hash: '12942e3a558089b2831cdbb8c094e8e2528017d94208c1374d2861ebab303945',
        economics: { creator: 0.90, dao: 0.05, hoster: 0.05 },
        settlement_layer: {
          current: 'solana-devnet',
          program: '8tBwhuAj5A9KfMX1i5hg5QYmkxke7BUN4iH9JD6JMnRc',
          explorer: 'https://explorer.solana.com/address/8tBwhuAj5A9KfMX1i5hg5QYmkxke7BUN4iH9JD6JMnRc?cluster=devnet',
          can_migrate: true,
          migration_mechanism: 'Truth Court consensus (PROTOCOL.md §7)',
        },
        portability: {
          identity: 'ed25519 — chain-agnostic',
          packet_format: 'ManifestPacket — JSON + NaCL signature',
          economics_layer: 'TypeScript — runs anywhere',
          ui_layer: 'oazyse° os frame — any browser',
          note: 'Only settlement_layer can change. Everything else is portable.',
        },
        seven_laws: [
          'life_is_sacred', 'consciousness_is_primary', 'freedom_is_inalienable',
          'abundance_is_shared', 'truth_over_profit', 'openness', 'responsible_creation',
        ],
      })
    })

    // Network migration status — Truth Court can vote to move settlement layer
    this.app.get('/api/protocol/layers', (_req, res) => {
      res.json({
        current: 'solana-devnet',
        available: ['solana-devnet', 'local'],
        migration_requires: 'Truth Court supermajority (67% of staked reputation)',
        history: [
          { layer: 'solana-devnet', since: 'genesis (April 2026)', status: 'active' },
        ],
        future_candidates: [
          { type: 'IBlockchain', description: 'oazyse° os net chain — submit via Judge when ready' },
          { type: 'IBlockchain', description: 'Ethereum L2 — any EVM chain' },
          { type: 'IBlockchain', description: 'Cosmos IBC — interchain identity' },
        ],
      })
    })

    // ── AUTONOMOUS AI AGENT ───────────────────────────────────

    // Get recent AI decisions
    this.app.get('/api/autonomous/decisions', (req, res) => {
      const limit = req.query.limit ? Number(req.query.limit) : 20
      res.json({ decisions: this.autonomousAgent.getRecentDecisions(limit) })
    })

    // Agent status
    this.app.get('/api/autonomous/status', (req, res) => {
      res.json(this.autonomousAgent.getStats())
    })

    // Manually trigger one decision cycle (useful for demo)
    this.app.post('/api/autonomous/trigger', async (req, res) => {
      const decision = await this.autonomousAgent.triggerOnce()
      if (!decision) return res.json({ success: false, message: 'No packets to evaluate' })
      res.json({ success: true, decision })
    })

    // Start autonomous agent
    this.app.post('/api/autonomous/start', async (req, res) => {
      const intervalMs = req.body?.intervalMs || 60_000
      await this.autonomousAgent.start(intervalMs)
      this.broadcast('AI', `Autonomous agent started (interval: ${intervalMs / 1000}s)`)
      res.json({ success: true, intervalMs })
    })

    // Stop autonomous agent
    this.app.post('/api/autonomous/stop', (req, res) => {
      this.autonomousAgent.stop()
      this.broadcast('AI', 'Autonomous agent paused')
      res.json({ success: true })
    })

    // On-chain state for a node
    this.app.get('/api/blockchain/node/:nodeId', async (req, res) => {
      const state = await this.autonomousAgent['meshProgram'].readNodeState(req.params.nodeId)
      res.json(state)
    })

    // All on-chain node states
    this.app.get('/api/blockchain/nodes', (req, res) => {
      const mp = this.autonomousAgent['meshProgram'] as OazyseNetProgram
      res.json({
        nodes: mp.getAllNodeStates(),
        programId: '8tBwhuAj5A9KfMX1i5hg5QYmkxke7BUN4iH9JD6JMnRc',
        programUrl: mp.programUrl(),
        isDeployed: mp.isDeployed,
      })
    })

    // On-chain packet history
    this.app.get('/api/blockchain/packets', (req, res) => {
      res.json({ packets: this.autonomousAgent['meshProgram'].getPacketHistory() })
    })

    // ── TOKEN ECONOMICS ───────────────────────────────────────

    // Get own token balance
    this.app.get('/api/token/balance', (req, res) => {
      const balance = this.tokenEconomics.getBalance(this.node.nodeId)
      res.json({ nodeId: this.node.nodeId, ...balance })
    })

    // Get any node's token balance
    this.app.get('/api/token/balance/:nodeId', (req, res) => {
      const balance = this.tokenEconomics.getBalance(req.params.nodeId)
      res.json({ nodeId: req.params.nodeId, ...balance })
    })

    // Economy stats + recent transactions
    this.app.get('/api/token/stats', (req, res) => {
      res.json({
        stats: this.tokenEconomics.getEconomyStats(),
        recent: this.tokenEconomics.getRecentTransactions(20)
      })
    })

    // Mint initial tokens for a node (genesis/dev only)
    this.app.post('/api/token/mint', (req, res) => {
      const { nodeId, amount } = req.body
      if (!nodeId || !amount) return res.status(400).json({ error: 'nodeId and amount required' })
      this.tokenEconomics.mint(nodeId, amount)
      res.json({ success: true, balance: this.tokenEconomics.getBalance(nodeId) })
    })

    // ── MARKET PURCHASE ────────────────────────────────────────

    // Purchase a listing from the knowledge market
    this.app.post('/api/market/acquire', async (req, res) => {
      const { hash, buyerNodeId } = req.body
      if (!hash || !buyerNodeId) return res.status(400).json({ error: 'hash and buyerNodeId required' })
      const result = await this.market.purchase(hash, buyerNodeId)
      if (result.success) {
        this.broadcast('MARKET', `Purchase: ${buyerNodeId} acquired listing ${hash.slice(0, 8)}…`)
      }
      res.json(result)
    })

    // ── NODE-TO-NODE — This node's public interface ───────────

    // Expose node info so remote nodes can discover us
    this.app.get('/api/node/info', async (req, res) => {
      const status = await this.node.getStatus()
      const host = req.headers.host || `localhost:${PORT}`
      res.json({
        nodeId: this.node.nodeId,
        pubkey: this.node.wallet.publicKey.toBase58(),
        endpoint: `http://${host}`,
        reputation: this.node.reputation,
        capabilities: Object.values(capabilities),
        manifests_count: this.node.offered.length,
        uptime: status.uptime
      })
    })

    // Expose our public manifests so remote nodes can browse them
    this.app.get('/api/node/manifests', (req, res) => {
      res.json({
        nodeId: this.node.nodeId,
        manifests: this.node.offered.map(m => ({
          hash: m.proof.hash.slice(0, 12),
          type: m.payload.type,
          description: m.payload.description,
          price: m.payload.price,
          tags: m.payload.tags,
          verified: ManifestBuilder.verify(m)
        }))
      })
    })

    // Invoke a capability on this node — called by remote nodes
    this.app.post('/api/capability/:id/invoke', async (req, res) => {
      const { id } = req.params
      const params = req.body || {}
      const callerNodeId = req.headers['x-caller-node'] as string

      const cap = capabilities[id]
      if (!cap) return res.status(404).json({ error: `Capability '${id}' not found` })

      try {
        let result: any

        if (cap.endpoint) {
          // Proxy to external data source
          const response = await fetch(cap.endpoint)
          result = await response.json()
        } else if (id === 'clock') {
          result = { time: new Date().toISOString(), timestamp: Date.now(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        } else if (id === 'oazyse-status') {
          result = await this.node.getStatus()
        } else {
          result = { id, invoked: true, timestamp: Date.now(), params }
        }

        // Charge caller if capability has a price
        if (callerNodeId && cap.price > 0) {
          const paid = this.tokenEconomics.transfer(callerNodeId, this.node.nodeId, cap.price)
          if (!paid) {
            return res.status(402).json({ error: `Insufficient balance. Required: ${cap.price} tokens` })
          }
          this.node.log(`CAPABILITY_INVOKE ${id} by ${callerNodeId} — paid ${cap.price} tokens`)
        }

        res.json({ success: true, capability: id, result, price: cap.price || 0 })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // ── PEER-TO-PEER — Connect to remote oazyse° os nodes ───────────

    // Connect to a remote oazyse° os node by URL
    this.app.post('/api/peer/connect', async (req, res) => {
      const { url } = req.body
      if (!url) return res.status(400).json({ error: 'url required' })

      try {
        const response = await fetch(`${url.replace(/\/$/, '')}/api/node/info`)
        if (!response.ok) throw new Error(`Node returned ${response.status}`)
        const info = await response.json() as any

        // Register as known peer
        this.remotePeers.set(info.nodeId, { url: url.replace(/\/$/, ''), nodeId: info.nodeId, connectedAt: Date.now() })
        this.node.peers.set(info.nodeId, { connectedAt: Date.now(), exchangeCount: 0 })

        // Import their capabilities into our registry (prefixed with nodeId)
        let importedCaps = 0
        if (Array.isArray(info.capabilities)) {
          for (const cap of info.capabilities) {
            const remoteId = `${info.nodeId}:${cap.id}`
            capabilities[remoteId] = { ...cap, id: remoteId, source_node: info.nodeId, source_url: url }
            importedCaps++
          }
        }

        this.broadcast('P2P', `Connected to peer: ${info.nodeId} @ ${url} (${importedCaps} capabilities imported)`)
        this.broadcastJson({ type: 'PEER_UPDATE', data: { peers: this.getPeerList() } })
        res.json({ success: true, peer: { nodeId: info.nodeId, url, capabilities: info.capabilities?.length || 0 } })
      } catch (e: any) {
        res.status(502).json({ error: `Cannot connect to peer: ${e.message}` })
      }
    })

    // List all known remote peers
    this.app.get('/api/peer/list', (req, res) => {
      const list = Array.from(this.remotePeers.values())
      res.json({ peers: list, total: list.length })
    })

    // Call a capability on a remote node — proxied with token payment
    this.app.post('/api/peer/call', async (req, res) => {
      const { capability_id, params } = req.body
      if (!capability_id) return res.status(400).json({ error: 'capability_id required' })

      // Find which remote node has this capability
      let targetUrl: string | null = null
      let targetNodeId: string | null = null
      const remoteCapId = capability_id.includes(':') ? capability_id : null

      if (remoteCapId) {
        // Format: "nodeId:capId"
        const [nodeId] = remoteCapId.split(':')
        const peer = this.remotePeers.get(nodeId)
        if (peer) { targetUrl = peer.url; targetNodeId = nodeId }
      } else {
        // Search in known remote capabilities
        const remoteKey = Object.keys(capabilities).find(k =>
          k.includes(':') && (k.endsWith(`:${capability_id}`) || capabilities[k].original_id === capability_id)
        )
        if (remoteKey) {
          const cap = capabilities[remoteKey]
          targetUrl = cap.source_url
          targetNodeId = cap.source_node
        }
      }

      if (!targetUrl || !targetNodeId) {
        return res.status(404).json({ error: `No remote peer found with capability '${capability_id}'` })
      }

      try {
        const rawCapId = capability_id.includes(':') ? capability_id.split(':').slice(1).join(':') : capability_id
        const response = await fetch(`${targetUrl}/api/capability/${rawCapId}/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-caller-node': this.node.nodeId
          },
          body: JSON.stringify(params || {})
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: `Status ${response.status}` })) as any
          return res.status(response.status).json(err)
        }

        const data = await response.json() as any

        // Update exchange count
        const peer = this.node.peers.get(targetNodeId)
        if (peer) peer.exchangeCount++

        this.node.log(`PEER_CALL ${capability_id} → ${targetNodeId} (${targetUrl})`)
        res.json({ success: true, source_node: targetNodeId, ...data })
      } catch (e: any) {
        res.status(502).json({ error: `Peer call failed: ${e.message}` })
      }
    })

    // Transfer a manifest (DATA/COMPUTE/KNOWLEDGE) to a remote node
    this.app.post('/api/peer/transfer', async (req, res) => {
      const { target_url, manifest_hash } = req.body
      if (!target_url || !manifest_hash) return res.status(400).json({ error: 'target_url and manifest_hash required' })

      const manifest = this.node.offered.find(m => m.proof.hash.startsWith(manifest_hash))
      if (!manifest) return res.status(404).json({ error: 'Manifest not found in our public store' })

      try {
        const response = await fetch(`${target_url.replace(/\/$/, '')}/api/node/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sender-node': this.node.nodeId },
          body: JSON.stringify({ manifest })
        })
        if (!response.ok) throw new Error(`Target returned ${response.status}`)
        const result = await response.json() as any
        this.node.log(`PEER_TRANSFER manifest ${manifest_hash.slice(0, 8)}… → ${target_url}`)
        res.json({ success: true, result })
      } catch (e: any) {
        res.status(502).json({ error: `Transfer failed: ${e.message}` })
      }
    })

    // Receive a manifest from a remote node
    this.app.post('/api/node/receive', (req, res) => {
      const { manifest } = req.body
      const senderNodeId = req.headers['x-sender-node'] as string

      if (!manifest?.proof?.hash) return res.status(400).json({ error: 'valid manifest required' })

      // Verify signature before accepting
      const valid = ManifestBuilder.verify(manifest)
      if (!valid) {
        this.node.log(`PEER_RECEIVE REJECTED — invalid signature from ${senderNodeId}`)
        return res.status(400).json({ error: 'Manifest signature verification failed' })
      }

      this.node.receive(manifest)
      this.broadcast('P2P', `Received [${manifest.payload.type}] "${manifest.payload.description}" from ${senderNodeId}`)
      res.json({ success: true, hash: manifest.proof.hash.slice(0, 12) })
    })

    // ── oazyse° os frame Capability Protocol ─────────────────────────────

    // In-memory capability store
    const capabilities: Record<string, any> = {}

    // Register a capability (API, data stream, app, agent)
    this.app.post('/api/net/capability', (req, res) => {
      const cap = req.body
      if (!cap?.id) return res.status(400).json({ error: 'capability.id required' })
      capabilities[cap.id] = { ...cap, registered_at: Date.now() }
      this.broadcast('SYS', `Capability registered: ${cap.id} (${cap.category || 'unknown'})`)
      this.broadcastJson({ type: 'CAPABILITY_UPDATE', data: { id: cap.id, cap: capabilities[cap.id] } })
      res.json({ success: true, id: cap.id })
    })

    // List all registered capabilities
    this.app.get('/api/net/capabilities', (req, res) => {
      const tag = req.query.tag as string | undefined
      const category = req.query.category as string | undefined
      let list = Object.values(capabilities)
      if (tag) list = list.filter(c => (c.tags || []).includes(tag))
      if (category) list = list.filter(c => c.category === category)
      res.json({ capabilities: list, total: list.length })
    })

    // Agent or external node pushes surface directives to oazyse° os frame
    this.app.post('/api/frame/directive', (req, res) => {
      const { directives } = req.body
      if (!Array.isArray(directives) || !directives.length) {
        return res.status(400).json({ error: 'directives array required' })
      }
      this.broadcastJson({ type: 'SURFACE_DIRECTIVE', data: { directives } })
      res.json({ success: true, dispatched: directives.length })
    })

    // HTTP wrapper for os_chat — lets external agents (e.g. OpenClaw) trigger
    // LLM UI generation without needing a WebSocket connection.
    this.app.post('/api/frame/chat', async (req, res) => {
      const { text, surface_id } = req.body
      if (!text) return res.status(400).json({ error: 'text required' })
      try {
        const uiPacket = await this.orchestrator.generateUI(text)
        // Broadcast the result to all connected oazyse° os frame dashboards
        if (uiPacket.type === 'html' && uiPacket.content) {
          this.broadcastJson({
            type: 'OS_RENDER',
            data: { ...uiPacket, surface_id: surface_id || ('surf-' + Date.now()) }
          })
        } else if ((uiPacket.type as string) === 'surface_directive') {
          const parsed = JSON.parse(uiPacket.content)
          if (parsed.directives) this.broadcastJson({ type: 'SURFACE_DIRECTIVE', data: { directives: parsed.directives } })
        }
        res.json({ success: true, type: uiPacket.type, action: uiPacket.action })
      } catch (e: any) {
        res.status(500).json({ error: e.message })
      }
    })

    // ══════════════════════════════════════════════════════════
    // SDK ENDPOINTS — for embedded agents contributing knowledge
    // ══════════════════════════════════════════════════════════

    // Receive a contributed insight from an agent's SDK
    this.app.post('/api/sdk/contribute', async (req, res) => {
      const { agentId, insight } = req.body
      if (!agentId || !insight?.title) {
        return res.status(400).json({ error: 'agentId and insight.title required' })
      }
      try {
        // Package the insight as a knowledge market listing
        const contributionId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const tags = [
          ...(insight.suggestedTags || []),
          'sdk_insight',
          insight.realWorldVerified ? 'verified' : 'unverified',
          `confidence_${Math.round((insight.confidence || 0.5) * 100)}`
        ]
        const listing = this.market.list(
          'KNOWLEDGE' as any,
          `[SDK:${insight.domain || 'general'}] ${insight.title} — ${insight.description.substring(0, 120)}`,
          0, // free to use — earn through adoption token rewards
          tags,
          { contributionId, agentId, potentialValue: insight.potentialValue, evidence: insight.evidence }
        )

        // Track contribution in AgentJudge using a synthetic ManifestPacket
        const syntheticManifest = this.node.offer(
          'KNOWLEDGE' as any,
          `SDK insight: ${insight.title}`,
          0,
          [...(insight.suggestedTags || []), 'sdk_insight'],
          { contributionId, agentId, evidence: insight.evidence }
        )
        this.agentJudge.submit(syntheticManifest)

        // Reward the contributing agent
        const reward = { unique: 50, high: 30, medium: 15, low: 5 }[insight.potentialValue as string] || 10
        this.tokenEconomics.mint(agentId, reward)

        this.node.log(`SDK CONTRIBUTE: ${agentId} contributed insight "${insight.title}" (reward: ${reward} tokens)`)

        res.json({
          success: true,
          contributionId,
          tokensEarned: reward,
          message: `Insight accepted. You earned ${reward} tokens. You will receive additional tokens each time other agents reference this knowledge.`
        })
      } catch (e) {
        res.status(500).json({ success: false, error: (e as Error).message })
      }
    })

    // Get insights contributed to the network (knowledge graph)
    this.app.get('/api/sdk/insights', (req, res) => {
      const { domain, verified, limit = 50 } = req.query
      let listings = this.market.listings

      // Filter to SDK insights only
      listings = listings.filter(l => l.manifest.payload.tags?.includes('sdk_insight'))
      if (domain) listings = listings.filter(l => l.manifest.payload.tags?.includes(domain as string))
      if (verified === 'true') listings = listings.filter(l => l.manifest.payload.tags?.includes('verified'))

      const result = listings.slice(0, Number(limit)).map(l => ({
        id: l.manifest.proof.hash,
        title: l.manifest.payload.description,
        domain: l.manifest.payload.tags?.find((t: string) => !t.startsWith('sdk') && !t.startsWith('confidence') && !['verified','unverified'].includes(t)) || 'general',
        tags: l.manifest.payload.tags,
        verified: l.manifest.payload.tags?.includes('verified'),
        metadata: l.manifest.payload.metadata,
        listed: l.listed
      }))

      res.json({
        insights: result,
        total: result.length,
        domains: [...new Set(result.map(r => r.domain))]
      })
    })

    // Stats for a specific agent's SDK activity
    this.app.get('/api/sdk/stats/:agentId', (req, res) => {
      const { agentId } = req.params
      const balance = this.tokenEconomics.getBalance(agentId)
      const contributions = this.market.listings
        .filter(l => l.seller === agentId && l.manifest.payload.tags?.includes('sdk_insight'))

      res.json({
        agentId,
        balance,
        contributionsCount: contributions.length,
        networkInsightsAvailable: this.market.listings.filter(l => l.manifest.payload.tags?.includes('sdk_insight')).length
      })
    })

    // ── MCP — Model Context Protocol ──────────────────────────
    // Any MCP-compatible AI (Claude Desktop, OpenClaw, Cursor…)
    // can connect via: { "mcpServers": { "oazyse": { "url": "http://localhost:9000/mcp" } } }

    this.app.get('/mcp/info', (_req, res) => {
      res.json(this.mcpServer.getInfo())
    })

    this.app.all('/mcp', async (req, res) => {
      try {
        await this.mcpServer.handleRequest(req, res, req.body)
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message || 'MCP error' }))
        }
      }
    })

    // ── oazyse° os frame ─────────────────────────────────────────────────

    this.app.get('/frame', (req, res) => {
      res.redirect('/frame.html' + (req.query && Object.keys(req.query).length ? '?' + new URLSearchParams(req.query as any).toString() : ''))
    })

    // Serve dashboard at root
    this.app.get('/', (req, res) => {
      res.redirect('/landing.html')
    })
    this.app.get('/dashboard', (req, res) => {
      res.redirect('/index.html')
    })
  }

  // ── WEBSOCKET ─────────────────────────────────────────────

  private setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws)
      this.broadcast('P2P', `Dashboard client connected (${this.clients.size} total)`)

      // Send initial state
      this.sendToClient(ws, {
        type: 'INIT',
        data: {
          nodeId: this.node.nodeId,
          pubkey: this.node.wallet.publicKey.toBase58(),
          genesisRecord: this.node.genesisRecord
        }
      })

      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString())
          await this.handleWsMessage(ws, msg)
        } catch {}
      })

      ws.on('close', () => {
        this.clients.delete(ws)
      })
    })
  }

  private async handleWsMessage(ws: WebSocket, msg: any) {
    switch (msg.action) {
      case 'offer': {
        const manifest = this.market.list(
          msg.type as PacketType,
          msg.description,
          msg.price || 0,
          msg.tags || []
        )
        this.broadcast('MARKET', `New: [${msg.type}] ${msg.description}`)
        break
      }
      case 'peer_connected': {
        // Browser reports successful WebRTC connection
        this.node.peers.set(msg.peerId, { connectedAt: Date.now(), exchangeCount: 0 })
        this.broadcast('P2P', `⚡ Peer connected via WebRTC: ${msg.peerId}`)
        this.broadcastJson({ type: 'PEER_UPDATE', data: { peers: this.getPeerList() } })
        break
      }
      case 'peer_disconnected': {
        this.node.peers.delete(msg.peerId)
        this.broadcast('P2P', `Peer disconnected: ${msg.peerId}`)
        this.broadcastJson({ type: 'PEER_UPDATE', data: { peers: this.getPeerList() } })
        break
      }
      case 'p2p_exchange': {
        // Knowledge received from peer via WebRTC
        const peer = this.node.peers.get(msg.peerId)
        if (peer) peer.exchangeCount++
        
        // Ingest the newly received remote packets into the local oazyse° os market store
        if (Array.isArray(msg.payload)) {
          console.log(`[P2P DEBUG] Received payload array of length ${msg.payload.length}`);
          let added = 0;
          for (const packet of msg.payload) {
            // Check if we already have it by ID to avoid duplicates
            if (!this.orchestrator.knowledgeAgent.getMarketPackets().find(p => p.id === packet.id)) {
              this.orchestrator.knowledgeAgent.addMarketPacket({
                id: packet.id || `peer-${Math.random().toString(36).substr(2, 9)}`,
                type: packet.type || 'DATA',
                title: packet.title || packet.description || 'Unknown Packet',
                description: packet.description || 'P2P synced data packet',
                price: (packet.price || 0) + ' oazyse',
                author: packet.author || packet.seller || msg.peerId,
                content: packet.content || ''
              });
              added++;
            }
          }
          if (added > 0) {
            this.broadcast('MARKET', `Ingested ${added} new UI/VIBE packets from ${msg.peerId}`);
          }
        }

        this.broadcast('P2P', `📦 Received [${msg.packetType}] from ${msg.peerId}`)
        break
      }
      case 'get_market': {
        // Peer requests our market listings (for sharing over P2P)
        const listings = this.market.browse()
        this.sendToClient(ws, {
          type: 'MARKET_DATA',
          data: listings.map(l => ({
            hash: l.manifest.proof.hash.slice(0, 12),
            type: l.manifest.payload.type,
            description: l.manifest.payload.description,
            price: l.manifest.payload.price,
            tags: l.manifest.payload.tags,
            seller: l.seller
          }))
        })
        break
      }
      case 'status': {
        const status = await this.node.getStatus()
        this.sendToClient(ws, { type: 'STATUS', data: status })
        break
      }
      case 'jury_vote': {
        const result = this.court.vote(
          msg.challengeId,
          this.node.nodeId, // mock voter ID as our own node ID since single user locally
          msg.verdict,
          0.01,
          'User submitted via oazyse° os frame'
        )
        if (result.accepted) {
          this.broadcast('TRUTH', result.message)
          
          // Check if resolved and UI needs update
          const challenge = this.court.getPending().find(c => c.id === msg.challengeId)
          if (!challenge) {
            // It was resolved! Let's get the stats
            this.broadcast('TRUTH', `TRIAL CONCLUDED! See Court log for details.`)
          }
        } else {
          this.broadcast('TRUTH', `Vote rejected: ${result.message}`)
        }
        break
      }
      case 'os_chat': {
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Generation timed out after 50s')), 50_000)
          )
          const currentHtml = (msg as any).currentHtml || ''
          const uiPacket = await Promise.race([
            this.orchestrator.generateUI(msg.text, currentHtml),
            timeout
          ])
          this.sendToClient(ws, { type: 'OS_RENDER', data: { ...uiPacket, surface_id: msg.surface_id } })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Generation failed'
          console.error('[Server] os_chat error:', errMsg)
          this.sendToClient(ws, {
            type: 'OS_RENDER',
            data: { type: 'text', content: `⚠ ${errMsg}. Try again.`, surface_id: msg.surface_id }
          })
        }
        break
      }
      case 'agent_heartbeat': {
        this.agentRegistry.heartbeat(msg.agent_id, msg.load, msg.status)
        break
      }
      case 'judge_adopt': {
        const result = this.agentJudge.adoptImplementation(msg.hash, msg.nodeId || this.node.nodeId)
        if (result.ok) {
          this.broadcast('JUDGE', result.message)
          this.broadcastJson({ type: 'EVOLUTION_UPDATE', data: this.agentJudge.getStats() })
        }
        break
      }
      case 'surface_directive': {
        // Agent pushes directives to all oazyse° os frame clients
        if (Array.isArray(msg.directives)) {
          this.broadcastJson({ type: 'SURFACE_DIRECTIVE', data: { directives: msg.directives } })
        }
        break
      }
    }
  }

  private getPeerList() {
    const list: any[] = []
    this.node.peers.forEach((data, id) => list.push({ nodeId: id, ...data }))
    return list
  }

  // ── BROADCAST ─────────────────────────────────────────────

  broadcast(eventType: string, message: string) {
    const event = {
      type: 'LOG',
      data: { eventType, message, timestamp: Date.now() }
    }
    this.broadcastJson(event)
    this.node.log(`[${eventType}] ${message}`)
  }

  private broadcastJson(data: any) {
    const json = JSON.stringify(data)
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(json)
    })
  }

  private sendToClient(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
  }

  // ── START ─────────────────────────────────────────────────

  async start() {
    // Fund wallet in background (non-blocking) — devnet airdrop can be slow
    console.log(`\n  Requesting Solana Devnet airdrop (background)...`)
    this.node.solana.fund(this.node.wallet.publicKey).catch(() => {})
    const balance = await Promise.race([
      this.node.solana.balance(this.node.wallet.publicKey),
      new Promise<number>(r => setTimeout(() => r(0), 5000))
    ])

    this.server.listen(PORT, () => {
      console.log(`\n  ╔══════════════════════════════════════════╗`)
      console.log(`  ║   oazyse° os node — live                 ║`)
      console.log(`  ║   ${this.node.nodeId.padEnd(38)}║`)
      console.log(`  ║   Balance: ${(balance + ' SOL').padEnd(31)}║`)
      console.log(`  ╚══════════════════════════════════════════╝`)
      console.log(`\n  API:       http://localhost:${PORT}/api/status`)
      console.log(`  Dashboard: http://localhost:${PORT}`)
      console.log(`  WebSocket: ws://localhost:${PORT}\n`)

      // Create genesis manifest with constitution hash (if not already saved)
      if (!this.node.genesisRecord) {
        const genManifest = this.node.offer('GENESIS', 'Network Genesis — ABUNDANCE_FOR_ALL_LIFE', 0, ['genesis', 'oazyse-net', 'protocol'])
        this.node.saveGenesis(genManifest)
      }
      this.broadcast('GENESIS', `Node ${this.node.nodeId} online — ABUNDANCE_FOR_ALL_LIFE`)
      this.broadcast('MARKET', `Knowledge market ready — ${this.market.stats().total} packets`)
      this.broadcast('TRUTH', `Truth Court active — stake-based verification`)
      this.broadcast('AGENT', `Agent Registry ready — ${this.agentRegistry.getStats().total} agents`)
      this.broadcast('JUDGE', `Agent Judge active — evolution engine online`)

      // Mint genesis tokens for this node if it has no balance
      const bal = this.tokenEconomics.getBalance(this.node.nodeId)
      if (bal.total === 0) {
        this.tokenEconomics.mint(this.node.nodeId, 1000)
        this.broadcast('TOKEN', `Genesis allocation: 1000 tokens minted for ${this.node.nodeId}`)
      } else {
        this.broadcast('TOKEN', `Token balance: ${bal.total} tokens`)
      }

      // Start autonomous AI agent
      const autoInterval = Number(process.env.AUTO_INTERVAL_MS) || 60_000
      const autoEnabled = process.env.AUTONOMOUS_AGENT !== 'false'
      if (autoEnabled) {
        this.autonomousAgent.start(autoInterval)
        this.autonomousAgent.seedMarket()
        this.broadcast('AI', `Autonomous agent online — evaluating market every ${autoInterval / 1000}s`)
        this.broadcast('AI', `Trigger manually: POST /api/autonomous/trigger`)
      }
      console.log(`  frame:     http://localhost:${PORT}/frame`)
      console.log(`  MCP:       http://localhost:${PORT}/mcp`)
      console.log(`  MCP Info:  http://localhost:${PORT}/mcp/info`)

      // Прунинг стейл-агентов каждые 2 минуты
      setInterval(() => this.agentRegistry.pruneStale(), 2 * 60 * 1000)
    })
  }
}

// Start
const server = new OazyseServer()
server.start().catch(console.error)
