import { Node } from '../core/Node'
import { ManifestPacket } from '../core/ManifestBuilder'

export interface AgentSignal {
  type: string
  value: any
  confidence: number
  timestamp: number
  source: string
}

export interface AgentAction {
  type: 'OFFER' | 'REQUEST' | 'ALERT' | 'ANCHOR' | 'ANALYZE'
  payload: any
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export abstract class BaseAgent {
  node: Node
  name: string
  signals: AgentSignal[] = []
  actions: AgentAction[] = []
  isRunning = false

  constructor(node: Node, name: string) {
    this.node = node
    this.name = name
  }

  abstract analyze(input: any): AgentSignal[]
  abstract decide(signals: AgentSignal[]): AgentAction[]

  emit(signal: AgentSignal) {
    this.signals.push(signal)
    if (this.signals.length > 1000) this.signals = this.signals.slice(-500)
  }

  queue(action: AgentAction) {
    this.actions.push(action)
  }

  getRecentSignals(seconds = 60): AgentSignal[] {
    const cutoff = Date.now() - seconds * 1000
    return this.signals.filter(s => s.timestamp > cutoff)
  }

  summarize(): string {
    return `[${this.name}] signals: ${this.signals.length} | actions: ${this.actions.length}`
  }
}
