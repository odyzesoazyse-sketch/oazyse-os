import { BaseAgent, AgentSignal, AgentAction } from './BaseAgent'
import { Node } from '../core/Node'

export interface TextPattern {
  topic: string
  occurrences: number
  firstSeen: number
  lastSeen: number
  contexts: string[]
}

export class PatternAgent extends BaseAgent {
  private topicMap = new Map<string, TextPattern>()
  private dataLog: string[] = []

  constructor(node: Node) {
    super(node, 'PatternAgent')
  }

  // Add data entry to analysis
  addEntry(text: string, source: 'user' | 'ai' | 'network' = 'network') {
    this.dataLog.push(text)
    this.extractTopics(text)
  }

  private extractTopics(text: string) {
    const keywords = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(' ')
      .filter(w => w.length > 4)
      .filter(w => !['that', 'this', 'with', 'have', 'from', 'they', 'what', 'when', 'will', 'been', 'were'].includes(w))

    keywords.forEach(word => {
      const existing = this.topicMap.get(word)
      if (existing) {
        existing.occurrences++
        existing.lastSeen = Date.now()
        if (!existing.contexts.includes(text.slice(0, 50))) {
          existing.contexts.push(text.slice(0, 50))
        }
      } else {
        this.topicMap.set(word, {
          topic: word,
          occurrences: 1,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          contexts: [text.slice(0, 50)]
        })
      }
    })
  }

  // Find recurring themes in data streams
  getRecurringTopics(minOccurrences = 3): TextPattern[] {
    return Array.from(this.topicMap.values())
      .filter(p => p.occurrences >= minOccurrences)
      .sort((a, b) => b.occurrences - a.occurrences)
  }

  // Extract core data themes
  getCoreThemes(): { theme: string; importance: number }[] {
    const recurring = this.getRecurringTopics(2)
    return recurring.slice(0, 5).map(p => ({
      theme: p.topic,
      importance: Math.min(p.occurrences / 10, 1)
    }))
  }

  analyze(input: { text: string; role?: 'user' | 'ai' }): AgentSignal[] {
    const signals: AgentSignal[] = []
    this.addEntry(input.text, input.role || 'network')

    const recurring = this.getRecurringTopics(3)
    if (recurring.length > 0) {
      signals.push({
        type: 'RECURRING_TOPICS',
        value: recurring.slice(0, 3).map(t => t.topic),
        confidence: 0.8,
        timestamp: Date.now(),
        source: 'pattern_analysis'
      })
    }

    const themes = this.getCoreThemes()
    if (themes.length > 0) {
      signals.push({
        type: 'CORE_THEMES',
        value: themes,
        confidence: 0.75,
        timestamp: Date.now(),
        source: 'theme_extraction'
      })
    }

    signals.forEach(s => this.emit(s))
    return signals
  }

  decide(signals: AgentSignal[]): AgentAction[] {
    const actions: AgentAction[] = []

    const recurring = signals.find(s => s.type === 'RECURRING_TOPICS')
    if (recurring && recurring.value.length > 0) {
      actions.push({
        type: 'ALERT',
        payload: {
          message: `Topic "${recurring.value[0]}" detected ${this.topicMap.get(recurring.value[0])?.occurrences}x — significant data pattern`,
          suggestion: `Investigate pattern: "${recurring.value[0]}"`
        },
        priority: 'MEDIUM'
      })
    }

    actions.forEach(a => this.queue(a))
    return actions
  }

  getSessionReport() {
    return {
      totalEntries: this.dataLog.length,
      uniqueTopics: this.topicMap.size,
      recurringTopics: this.getRecurringTopics(2),
      coreThemes: this.getCoreThemes()
    }
  }
}
