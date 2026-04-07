import { BaseAgent, AgentSignal, AgentAction } from './BaseAgent'
import { Node } from '../core/Node'
import { ManifestPacket } from '../core/ManifestBuilder'

export interface KnownPacket {
  id: string;
  type: 'VIBE' | 'DATA' | 'COMPUTE' | 'UI';
  title: string;
  description: string;
  price: string;
  content: string; // The HTML/JS/CSS code or data
  author: string;
}

export class KnowledgeAgent extends BaseAgent {
  private knowledgeBase: Map<string, { content: string; quality: number; timestamp: number }> = new Map()
  
  // Market Store for UI and VIBE packets
  public marketStore: Map<string, KnownPacket> = new Map()

  constructor(node: Node) {
    super(node, 'KnowledgeAgent')
    this.seedMarket()
  }

  private seedMarket() {
    this.addMarketPacket({
      id: 'vibe-1', type: 'VIBE', title: 'Light Mode Material',
      description: 'Instantly changes OS canvas to clean, white aesthetic.',
      price: '0.05 oazyse', author: 'genesis',
      content: `document.body.style.background='#F8F9FA'; document.body.style.color='#111'; document.getElementById('cmd').style.color='#111'; document.getElementById('cmd').style.background='#fff'; document.getElementById('cmd').style.borderColor='#ddd';`
    })
    this.addMarketPacket({
      id: 'vibe-2', type: 'VIBE', title: 'Synthwave Dreams',
      description: 'Deep purple gradients and neon aesthetic inject packet.',
      price: '0.02 oazyse', author: 'genesis',
      content: `document.body.style.background='linear-gradient(45deg, #2a0845 0%, #6441A5 100%)'; document.body.style.color='#fff'; document.getElementById('cmd').style.background='rgba(0,0,0,0.3)';`
    })
  }

  addMarketPacket(packet: KnownPacket) {
    this.marketStore.set(packet.id, packet)
  }

  getMarketPackets(): KnownPacket[] {
    return Array.from(this.marketStore.values())
  }

  // Store knowledge with quality score
  store(key: string, content: string, quality = 0.5) {
    this.knowledgeBase.set(key, { content, quality, timestamp: Date.now() })
  }

  // Find relevant knowledge
  search(query: string): { key: string; content: string; relevance: number }[] {
    const queryWords = query.toLowerCase().split(' ')
    const results: { key: string; content: string; relevance: number }[] = []

    this.knowledgeBase.forEach((value, key) => {
      const keyWords = key.toLowerCase().split(' ')
      const contentWords = value.content.toLowerCase().split(' ')
      const allWords = [...keyWords, ...contentWords]

      const matchCount = queryWords.filter(qw => allWords.some(w => w.includes(qw))).length
      const relevance = matchCount / queryWords.length

      if (relevance > 0.2) {
        results.push({ key, content: value.content, relevance })
      }
    })

    return results.sort((a, b) => b.relevance - a.relevance)
  }

  analyze(input: { query?: string; manifest?: ManifestPacket }): AgentSignal[] {
    const signals: AgentSignal[] = []

    if (input.manifest) {
      this.store(
        input.manifest.payload.description,
        JSON.stringify(input.manifest.payload.metadata),
        0.7
      )
      signals.push({
        type: 'KNOWLEDGE_STORED',
        value: { key: input.manifest.payload.description, type: input.manifest.payload.type },
        confidence: 0.9,
        timestamp: Date.now(),
        source: 'knowledge_ingestion'
      })
    }

    if (input.query) {
      const results = this.search(input.query)
      if (results.length > 0) {
        signals.push({
          type: 'KNOWLEDGE_FOUND',
          value: results.slice(0, 5),
          confidence: results[0].relevance,
          timestamp: Date.now(),
          source: 'knowledge_search'
        })
      }
    }

    signals.forEach(s => this.emit(s))
    return signals
  }

  decide(signals: AgentSignal[]): AgentAction[] {
    const actions: AgentAction[] = []

    const found = signals.find(s => s.type === 'KNOWLEDGE_FOUND')
    if (found && found.confidence > 0.7) {
      actions.push({
        type: 'OFFER',
        payload: { message: `High-confidence match found`, results: found.value },
        priority: 'MEDIUM'
      })
    }

    actions.forEach(a => this.queue(a))
    return actions
  }

  getStats() {
    return {
      totalKnowledge: this.knowledgeBase.size,
      avgQuality: Array.from(this.knowledgeBase.values()).reduce((s, v) => s + v.quality, 0) / (this.knowledgeBase.size || 1)
    }
  }
}
