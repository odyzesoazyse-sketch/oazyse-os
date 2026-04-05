import * as fs from 'fs'
import * as path from 'path'
import { NODE_DIR } from '../core/Node'

export interface LongTermEntry {
  key: string
  value: any
  category: string
  importance: number // 0-1
  createdAt: number
  updatedAt: number
  accessCount: number
}

export class LongTermMemory {
  private entries = new Map<string, LongTermEntry>()
  private dataPath = path.join(NODE_DIR, 'memory', 'longterm.json')

  constructor() {
    this.load()
  }

  private load() {
    if (fs.existsSync(this.dataPath)) {
      const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'))
      data.forEach((e: LongTermEntry) => this.entries.set(e.key, e))
    }
  }

  private save() {
    fs.writeFileSync(this.dataPath, JSON.stringify(Array.from(this.entries.values()), null, 2))
  }

  store(key: string, value: any, category = 'general', importance = 0.5) {
    const existing = this.entries.get(key)
    if (existing) {
      existing.value = value
      existing.updatedAt = Date.now()
      existing.importance = Math.max(existing.importance, importance)
    } else {
      this.entries.set(key, {
        key, value, category, importance,
        createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0
      })
    }
    this.save()
  }

  recall(key: string): any {
    const entry = this.entries.get(key)
    if (entry) {
      entry.accessCount++
      return entry.value
    }
    return null
  }

  searchByCategory(category: string): LongTermEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.category === category)
      .sort((a, b) => b.importance - a.importance)
  }

  getMostImportant(count = 10): LongTermEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, count)
  }

  getStats() {
    return {
      totalEntries: this.entries.size,
      categories: [...new Set(Array.from(this.entries.values()).map(e => e.category))],
      avgImportance: Array.from(this.entries.values()).reduce((s, e) => s + e.importance, 0) / (this.entries.size || 1)
    }
  }
}
