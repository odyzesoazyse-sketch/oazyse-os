import * as fs from 'fs'
import * as path from 'path'
import { Node } from './Node'
import { ManifestBuilder, ManifestPacket } from './ManifestBuilder'

export interface AgentRecord {
  agent_id: string
  description: string
  capabilities: string[]
  endpoint_url: string
  pubkey?: string
  manifest?: ManifestPacket
  registered_at: number
  last_seen: number
  status: 'active' | 'idle' | 'offline'
  load?: number           // 0.0 – 1.0
  adoption_count: number  // сколько узлов используют этого агента
}

export class AgentRegistry {
  private agents = new Map<string, AgentRecord>()
  private storePath: string

  constructor(private node: Node) {
    const home = path.join(process.env.HOME || '~', '.mesh-node', 'brain')
    fs.mkdirSync(home, { recursive: true })
    this.storePath = path.join(home, 'agents.json')
    this.load()
  }

  // Зарегистрировать агента в сети
  register(data: {
    agent_id: string
    description: string
    capabilities: string[]
    endpoint_url: string
    pubkey?: string
  }): { record: AgentRecord; manifest: ManifestPacket } {
    const existing = this.agents.get(data.agent_id)

    const record: AgentRecord = {
      ...data,
      registered_at: existing?.registered_at ?? Date.now(),
      last_seen: Date.now(),
      status: 'active',
      adoption_count: existing?.adoption_count ?? 0
    }

    // Создаём манифест-пакет типа AGENT
    const manifest = ManifestBuilder.create(
      this.node.nodeId,
      this.node.wallet,
      'AGENT',
      data.description,
      0,
      ['agent', ...data.capabilities],
      {
        agent_id: data.agent_id,
        endpoint_url: data.endpoint_url,
        pubkey: data.pubkey,
        capabilities: data.capabilities
      }
    )

    record.manifest = manifest
    this.agents.set(data.agent_id, record)
    this.save()

    this.node.log(`AGENT_REGISTRY Registered: ${data.agent_id} — [${data.capabilities.join(', ')}]`)
    return { record, manifest }
  }

  // Найти агентов по способности
  discover(capability?: string, maxPrice = Infinity): AgentRecord[] {
    const all = Array.from(this.agents.values()).filter(a => a.status !== 'offline')
    if (!capability) return all

    return all.filter(a =>
      a.capabilities.some(c =>
        c.toLowerCase().includes(capability.toLowerCase())
      )
    )
  }

  // Обновить статус агента (heartbeat)
  heartbeat(agentId: string, load = 0, status: AgentRecord['status'] = 'active'): boolean {
    const record = this.agents.get(agentId)
    if (!record) return false
    record.last_seen = Date.now()
    record.load = load
    record.status = status
    this.save()
    return true
  }

  // Пометить агента как принятого ещё одним узлом
  incrementAdoption(agentId: string): void {
    const record = this.agents.get(agentId)
    if (record) {
      record.adoption_count++
      this.save()
    }
  }

  // Получить онбординг-подсказку для нового агента
  getOnboardingSuggestion(description: string): {
    suggested_capabilities: string[]
    manifest_template: object
    curl_example: string
    message: string
  } {
    const desc = description.toLowerCase()

    // Простая эвристика по ключевым словам
    const capabilityHints: Record<string, string[]> = {
      code: ['code_generation', 'debugging', 'refactoring'],
      text: ['text_generation', 'summarization', 'translation'],
      image: ['image_generation', 'image_analysis', 'vision'],
      search: ['web_search', 'knowledge_retrieval', 'indexing'],
      data: ['data_analysis', 'data_transformation', 'statistics'],
      audio: ['speech_to_text', 'text_to_speech', 'audio_analysis'],
      trade: ['trading', 'market_analysis', 'portfolio_management'],
      security: ['threat_detection', 'code_review', 'vulnerability_scanning'],
      reasoning: ['logical_reasoning', 'planning', 'problem_solving'],
      memory: ['long_term_memory', 'context_management', 'knowledge_storage']
    }

    const suggested: string[] = []
    for (const [keyword, caps] of Object.entries(capabilityHints)) {
      if (desc.includes(keyword)) suggested.push(...caps)
    }
    if (suggested.length === 0) suggested.push('general_assistance', 'knowledge_sharing')

    const template = {
      agent_id: 'your-agent-unique-id',
      description: description,
      capabilities: suggested,
      endpoint_url: 'https://your-agent-endpoint.com/api',
      pubkey: 'optional-solana-pubkey'
    }

    const curl = `curl -X POST http://localhost:9000/api/mesh/connect \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(template, null, 2)}'`

    return {
      suggested_capabilities: suggested,
      manifest_template: template,
      curl_example: curl,
      message: `Based on your description, you can offer ${suggested.length} capabilities to the MESH network. Register and start earning tokens when other agents use your services.`
    }
  }

  get(agentId: string): AgentRecord | undefined {
    return this.agents.get(agentId)
  }

  getAll(): AgentRecord[] {
    return Array.from(this.agents.values())
  }

  getStats() {
    const all = this.getAll()
    return {
      total: all.length,
      active: all.filter(a => a.status === 'active').length,
      offline: all.filter(a => a.status === 'offline').length,
      capabilities: [...new Set(all.flatMap(a => a.capabilities))]
    }
  }

  // Пометить агентов не видевших heartbeat >5 минут как offline
  pruneStale(maxAgeMs = 5 * 60 * 1000): void {
    const now = Date.now()
    for (const [id, record] of this.agents) {
      if (now - record.last_seen > maxAgeMs && record.status !== 'offline') {
        record.status = 'offline'
        this.node.log(`AGENT_REGISTRY Agent offline: ${id}`)
      }
    }
    this.save()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'))
        for (const record of data) {
          this.agents.set(record.agent_id, record)
        }
      }
    } catch { /* first run */ }
  }

  private save(): void {
    fs.writeFileSync(this.storePath, JSON.stringify(this.getAll(), null, 2))
  }
}
