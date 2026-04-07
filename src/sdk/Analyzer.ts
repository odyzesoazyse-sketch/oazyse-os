// ═══════════════════════════════════════════════════
// oazyse° os agent sdk — Insight Analyzer
// Finds unique patterns. Answers: "what do you know
// that the world doesn't?"
// ═══════════════════════════════════════════════════

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Interaction, Pattern, Insight, SDKConfig } from './types'

export class Analyzer {
  private patterns: Map<string, Pattern> = new Map()
  private insights: Map<string, Insight> = new Map()
  private dataPath: string
  private insightsPath: string

  constructor(private config: SDKConfig) {
    const dir = config.storageDir || path.join(os.homedir(), '.oazyse-sdk', config.agentId)
    this.dataPath = path.join(dir, 'patterns.json')
    this.insightsPath = path.join(dir, 'insights.json')
    this.load()
  }

  // Run full analysis on all interactions
  async analyze(interactions: Interaction[]): Promise<{
    newPatterns: number
    newInsights: number
    summary: string
  }> {
    console.log(`[MeshSDK] Analyzing ${interactions.length} interactions...`)

    const beforePatterns = this.patterns.size
    const beforeInsights = this.insights.size

    // Step 1: Find recurring patterns
    this.findPatterns(interactions)

    // Step 2: Score uniqueness
    this.scoreUniqueness()

    // Step 3: Generate insights from high-value patterns
    const newInsights = await this.generateInsights(interactions)

    this.save()

    const summary = this.buildSummary()
    return {
      newPatterns: this.patterns.size - beforePatterns,
      newInsights: this.insights.size - beforeInsights,
      summary
    }
  }

  // Find what patterns recur across interactions
  private findPatterns(interactions: Interaction[]) {
    // Group by domain
    const byDomain: Record<string, Interaction[]> = {}
    for (const i of interactions) {
      if (!byDomain[i.domain]) byDomain[i.domain] = []
      byDomain[i.domain].push(i)
    }

    // Within each domain, find similar interactions using keyword overlap
    for (const [domain, domainInteractions] of Object.entries(byDomain)) {
      if (domainInteractions.length < (this.config.minInteractionsForPattern || 3)) continue

      const clusters = this.clusterBySimilarity(domainInteractions)

      for (const cluster of clusters) {
        if (cluster.length < (this.config.minInteractionsForPattern || 3)) continue

        const patternId = `pat-${domain}-${cluster[0].id.slice(4, 12)}`

        if (!this.patterns.has(patternId)) {
          // Extract common keywords as description
          const keywords = this.extractCommonKeywords(cluster)
          const verifiedCount = cluster.filter(i => i.verified && i.outcome === 'success').length

          this.patterns.set(patternId, {
            id: patternId,
            interactions: cluster.map(i => i.id),
            frequency: cluster.length,
            domain,
            description: `Recurring pattern in ${domain}: ${keywords.join(', ')}`,
            uniquenessScore: 0,  // will be set in scoreUniqueness
            verifiedCount,
            firstSeen: Math.min(...cluster.map(i => i.timestamp)),
            lastSeen: Math.max(...cluster.map(i => i.timestamp))
          })
        } else {
          // Update existing pattern
          const p = this.patterns.get(patternId)!
          p.frequency = cluster.length
          p.interactions = cluster.map(i => i.id)
          p.verifiedCount = cluster.filter(i => i.verified && i.outcome === 'success').length
          p.lastSeen = Math.max(...cluster.map(i => i.timestamp))
        }
      }
    }
  }

  // Score how unique a pattern likely is
  // (without querying external network, we estimate based on domain specificity
  //  and how niche the keywords are)
  private scoreUniqueness() {
    for (const pattern of this.patterns.values()) {
      let score = 0.5 // baseline

      // More verified = more valuable
      if (pattern.verifiedCount >= 5) score += 0.2
      else if (pattern.verifiedCount >= 2) score += 0.1

      // More frequency = more proven
      if (pattern.frequency >= 10) score += 0.1
      else if (pattern.frequency >= 5) score += 0.05

      // Niche domains are more unique
      const nicheBonus: Record<string, number> = {
        medical: 0.2, legal: 0.2, research: 0.15,
        finance: 0.1, code: 0.05, general: -0.1
      }
      score += nicheBonus[pattern.domain] || 0

      pattern.uniquenessScore = Math.min(1, Math.max(0, score))
    }
  }

  // Generate human-readable insights from patterns
  private async generateInsights(interactions: Interaction[]): Promise<number> {
    let newCount = 0
    const interactionMap = new Map(interactions.map(i => [i.id, i]))

    for (const pattern of this.patterns.values()) {
      if (this.insightExistsForPattern(pattern.id)) continue
      if (pattern.uniquenessScore < 0.4) continue // skip low-value patterns

      const patternInteractions = pattern.interactions
        .map(id => interactionMap.get(id))
        .filter(Boolean) as Interaction[]

      const insight = this.buildInsight(pattern, patternInteractions)
      this.insights.set(insight.id, insight)
      newCount++
    }

    return newCount
  }

  private buildInsight(pattern: Pattern, interactions: Interaction[]): Insight {
    const verified = interactions.filter(i => i.verified && i.outcome === 'success')
    const evidence = verified
      .slice(0, 3)
      .map(i => i.outcomeNote || `Verified in ${i.domain}: ${i.input.substring(0, 100)}`)

    // Determine potential value
    let potentialValue: Insight['potentialValue'] = 'low'
    if (pattern.uniquenessScore >= 0.8) potentialValue = 'unique'
    else if (pattern.uniquenessScore >= 0.65) potentialValue = 'high'
    else if (pattern.uniquenessScore >= 0.5) potentialValue = 'medium'

    // Extract common tags
    const allTags = interactions.flatMap(i => i.tags || [])
    const tagFreq: Record<string, number> = {}
    for (const t of allTags) tagFreq[t] = (tagFreq[t] || 0) + 1
    const suggestedTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t)

    const title = this.generateInsightTitle(pattern, interactions)
    const description = this.generateInsightDescription(pattern, interactions)

    return {
      id: `ins-${pattern.id}-${Date.now()}`,
      patternId: pattern.id,
      title,
      description,
      evidence,
      domain: pattern.domain,
      confidence: pattern.verifiedCount > 0
        ? Math.min(0.95, 0.4 + (pattern.verifiedCount / pattern.frequency) * 0.6)
        : 0.3,
      realWorldVerified: pattern.verifiedCount > 0,
      potentialValue,
      suggestedTags: [pattern.domain, ...suggestedTags],
      createdAt: Date.now(),
      status: 'draft'
    }
  }

  private generateInsightTitle(pattern: Pattern, interactions: Interaction[]): string {
    const keywords = this.extractCommonKeywords(interactions).slice(0, 3)
    const verifiedLabel = pattern.verifiedCount > 0 ? '✓ Verified' : 'Pattern'
    return `${verifiedLabel}: ${keywords.join(' + ')} in ${pattern.domain}`
  }

  private generateInsightDescription(pattern: Pattern, interactions: Interaction[]): string {
    const count = interactions.length
    const verified = interactions.filter(i => i.verified).length
    const keywords = this.extractCommonKeywords(interactions).slice(0, 5)

    return [
      `This agent has encountered ${count} similar situations in the ${pattern.domain} domain.`,
      verified > 0
        ? `${verified} of these had real-world verified outcomes.`
        : 'These interactions have not yet been verified against real-world outcomes.',
      `Key concepts: ${keywords.join(', ')}.`,
      `Uniqueness score: ${(pattern.uniquenessScore * 100).toFixed(0)}% — `,
      pattern.uniquenessScore >= 0.7
        ? 'this knowledge is likely rare and not well represented in standard AI training data.'
        : 'this knowledge may have some unique aspects worth sharing.'
    ].join(' ')
  }

  // Simple similarity clustering using keyword overlap
  private clusterBySimilarity(interactions: Interaction[]): Interaction[][] {
    const clusters: Interaction[][] = []
    const assigned = new Set<string>()

    for (const base of interactions) {
      if (assigned.has(base.id)) continue

      const cluster = [base]
      assigned.add(base.id)

      const baseKeywords = new Set(this.getKeywords(base.input + ' ' + base.output))

      for (const other of interactions) {
        if (assigned.has(other.id)) continue
        const otherKeywords = new Set(this.getKeywords(other.input + ' ' + other.output))
        const overlap = [...baseKeywords].filter(k => otherKeywords.has(k)).length
        const similarity = overlap / Math.max(baseKeywords.size, otherKeywords.size)

        if (similarity >= 0.25) {
          cluster.push(other)
          assigned.add(other.id)
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  private extractCommonKeywords(interactions: Interaction[]): string[] {
    const freq: Record<string, number> = {}
    for (const i of interactions) {
      const words = this.getKeywords(i.input + ' ' + (i.output || ''))
      for (const w of new Set(words)) {
        freq[w] = (freq[w] || 0) + 1
      }
    }
    // Return words that appear in >=30% of interactions
    const threshold = Math.max(2, interactions.length * 0.3)
    return Object.entries(freq)
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word)
  }

  private getKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'что', 'как', 'это',
      'не', 'в', 'на', 'и', 'с', 'по', 'для', 'из', 'от', 'до',
      'error', 'undefined', 'null', 'true', 'false'
    ])

    return text.toLowerCase()
      .replace(/[^a-zA-Zа-яёА-ЯЁ0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
  }

  private insightExistsForPattern(patternId: string): boolean {
    return Array.from(this.insights.values()).some(i => i.patternId === patternId)
  }

  // Surface insights for owner review
  getInsightsForReview(): Insight[] {
    return Array.from(this.insights.values())
      .filter(i => i.status === 'draft')
      .sort((a, b) => {
        // Sort by: verified first, then by potential value
        const valueOrder = { unique: 4, high: 3, medium: 2, low: 1 }
        const aScore = (a.realWorldVerified ? 10 : 0) + valueOrder[a.potentialValue]
        const bScore = (b.realWorldVerified ? 10 : 0) + valueOrder[b.potentialValue]
        return bScore - aScore
      })
  }

  getAllInsights(): Insight[] {
    return Array.from(this.insights.values())
  }

  getInsight(id: string): Insight | undefined {
    return this.insights.get(id)
  }

  // Owner approves insight for contribution
  approveInsight(id: string, ownerNote?: string): boolean {
    const insight = this.insights.get(id)
    if (!insight) return false
    insight.status = 'approved'
    if (ownerNote) insight.ownerNote = ownerNote
    this.save()
    return true
  }

  // Owner rejects insight (won't contribute)
  rejectInsight(id: string): boolean {
    const insight = this.insights.get(id)
    if (!insight) return false
    insight.status = 'rejected'
    this.save()
    return true
  }

  markContributed(insightId: string, contributionId: string) {
    const insight = this.insights.get(insightId)
    if (insight) {
      insight.status = 'contributed'
      insight.contributionId = contributionId
      this.save()
    }
  }

  private buildSummary(): string {
    const total = this.patterns.size
    const highValue = Array.from(this.patterns.values())
      .filter(p => p.uniquenessScore >= 0.65).length
    const verified = Array.from(this.patterns.values())
      .filter(p => p.verifiedCount > 0).length
    const drafts = this.getInsightsForReview().length

    return `Found ${total} patterns (${highValue} high-value, ${verified} real-world verified). ${drafts} insights ready for your review.`
  }

  private load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'))
        for (const p of data) this.patterns.set(p.id, p)
      }
      if (fs.existsSync(this.insightsPath)) {
        const data = JSON.parse(fs.readFileSync(this.insightsPath, 'utf-8'))
        for (const i of data) this.insights.set(i.id, i)
      }
    } catch (e) {
      console.error('[MeshSDK] Analyzer load failed:', e)
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(Array.from(this.patterns.values()), null, 2))
      fs.writeFileSync(this.insightsPath, JSON.stringify(Array.from(this.insights.values()), null, 2))
    } catch (e) {
      console.error('[MeshSDK] Analyzer save failed:', e)
    }
  }
}
