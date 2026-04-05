// ═══════════════════════════════════════════════════
// MESH Agent SDK — Interaction Recorder
// Records everything locally. Owner controls what leaves.
// ═══════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Interaction, SDKConfig } from './types'

export class Recorder {
  private interactions: Map<string, Interaction> = new Map()
  private dataPath: string

  constructor(private config: SDKConfig) {
    const dir = config.storageDir || path.join(os.homedir(), '.mesh-sdk', config.agentId)
    fs.mkdirSync(dir, { recursive: true })
    this.dataPath = path.join(dir, 'interactions.json')
    this.load()
  }

  // Main method — wrap any agent call
  async track<T>(
    fn: () => Promise<T>,
    context: {
      input: string
      domain?: string
      tags?: string[]
      metadata?: Record<string, any>
    }
  ): Promise<{ result: T; interactionId: string }> {
    const id = `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const start = Date.now()

    let output = ''
    let error: any = null

    try {
      const result = await fn()
      output = typeof result === 'string' ? result : JSON.stringify(result)

      const interaction: Interaction = {
        id,
        agentId: this.config.agentId,
        timestamp: start,
        domain: context.domain || this.inferDomain(context.input),
        input: this.config.privacyMode === 'strict'
          ? this.anonymize(context.input)
          : context.input,
        output: this.config.privacyMode === 'strict'
          ? this.anonymize(output)
          : output,
        outcome: 'unknown',
        verified: false,
        tags: context.tags || [],
        metadata: {
          ...(context.metadata || {}),
          durationMs: Date.now() - start
        }
      }

      this.interactions.set(id, interaction)
      this.save()

      return { result, interactionId: id }
    } catch (err) {
      error = err
      // Still record failed interactions — failures are also knowledge
      const interaction: Interaction = {
        id,
        agentId: this.config.agentId,
        timestamp: start,
        domain: context.domain || this.inferDomain(context.input),
        input: context.input,
        output: `ERROR: ${(err as Error).message}`,
        outcome: 'failure',
        verified: false,
        tags: [...(context.tags || []), 'error'],
        metadata: { durationMs: Date.now() - start }
      }
      this.interactions.set(id, interaction)
      this.save()
      throw err
    }
  }

  // Mark an interaction as verified with real-world outcome
  verify(
    interactionId: string,
    outcome: 'success' | 'failure',
    note: string,
    source: string = 'user_feedback'
  ) {
    const interaction = this.interactions.get(interactionId)
    if (!interaction) return false

    interaction.outcome = outcome
    interaction.outcomeNote = note
    interaction.verified = true
    interaction.verificationSource = source
    this.save()
    console.log(`[MeshSDK] Interaction ${interactionId} verified: ${outcome} — "${note}"`)
    return true
  }

  // Add tags to an interaction
  tag(interactionId: string, tags: string[]) {
    const interaction = this.interactions.get(interactionId)
    if (!interaction) return false
    interaction.tags = [...new Set([...(interaction.tags || []), ...tags])]
    this.save()
    return true
  }

  getAll(): Interaction[] {
    return Array.from(this.interactions.values())
  }

  getVerified(): Interaction[] {
    return this.getAll().filter(i => i.verified && i.outcome === 'success')
  }

  getByDomain(domain: string): Interaction[] {
    return this.getAll().filter(i => i.domain === domain)
  }

  getStats() {
    const all = this.getAll()
    const domains: Record<string, number> = {}
    for (const i of all) {
      domains[i.domain] = (domains[i.domain] || 0) + 1
    }
    return {
      total: all.length,
      verified: all.filter(i => i.verified).length,
      successful: all.filter(i => i.outcome === 'success').length,
      domains: Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => ({ domain, count }))
    }
  }

  // Infer domain from input text using keywords
  private inferDomain(input: string): string {
    const text = input.toLowerCase()
    if (/медицин|лечен|пациент|диагноз|симптом|болезн|medical|patient|diagnosis|treatment/.test(text)) return 'medical'
    if (/юридич|закон|правов|договор|иск|суд|legal|law|contract|court/.test(text)) return 'legal'
    if (/код|программ|функция|алгоритм|баг|ошибка|code|function|algorithm|bug|debug/.test(text)) return 'code'
    if (/финанс|инвестиц|акции|рынок|прибыль|finance|invest|stock|market|profit/.test(text)) return 'finance'
    if (/маркетинг|продвижен|реклам|клиент|продаж|marketing|advertising|sales/.test(text)) return 'marketing'
    if (/наук|исследован|эксперимент|данные|анализ|science|research|experiment|data/.test(text)) return 'research'
    if (/образован|учеб|студент|курс|обучен|education|learning|student|course/.test(text)) return 'education'
    return 'general'
  }

  // Basic anonymization for strict privacy mode
  private anonymize(text: string): string {
    return text
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{10,}\b/g, '[NUMBER]')
      .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]')
      .substring(0, 500) // truncate for privacy
  }

  private load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'))
        for (const i of data) this.interactions.set(i.id, i)
        console.log(`[MeshSDK] Loaded ${this.interactions.size} interactions`)
      }
    } catch (e) {
      console.error('[MeshSDK] Failed to load interactions:', e)
    }
  }

  private save() {
    try {
      fs.writeFileSync(
        this.dataPath,
        JSON.stringify(Array.from(this.interactions.values()), null, 2)
      )
    } catch (e) {
      console.error('[MeshSDK] Failed to save interactions:', e)
    }
  }
}
