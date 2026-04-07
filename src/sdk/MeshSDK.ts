// ═══════════════════════════════════════════════════
// oazyse° os agent sdk — Main Entry Point
//
// Embed in ANY AI agent with 3 lines:
//
//   import { OazyseSDK } from '@oazyse/sdk'
//   const sdk = new OazyseSDK({ agentId: 'my-agent' })
//   const { result } = await sdk.track(() => myAgent(input), { input })
//
// The SDK silently observes, finds patterns, and asks
// you: "you have unique knowledge — want to share it?"
// ═══════════════════════════════════════════════════

import { Recorder } from './Recorder'
import { Analyzer } from './Analyzer'
import { SDKConfig, Insight, SDKStats } from './types'
import * as https from 'https'
import * as http from 'http'

export class OazyseSDK {
  private recorder: Recorder
  private analyzer: Analyzer
  private analyzeTimer?: NodeJS.Timeout
  readonly agentId: string

  constructor(private config: SDKConfig) {
    this.agentId = config.agentId
    this.recorder = new Recorder(config)
    this.analyzer = new Analyzer(config)

    console.log(`[OazyseSDK] Initialized for agent: ${config.agentId}`)

    // Auto-analyze on interval
    if (config.autoAnalyze !== false) {
      const interval = config.analyzeInterval || 10 * 60 * 1000 // 10 min default
      this.analyzeTimer = setInterval(() => this.runAnalysis(), interval)
      // Also run once after 30s to give agent time to accumulate interactions
      setTimeout(() => this.runAnalysis(), 30_000)
    }
  }

  // ─── Core: Track any agent interaction ───────────────────

  async track<T>(
    fn: () => Promise<T>,
    context: {
      input: string
      domain?: string
      tags?: string[]
      metadata?: Record<string, any>
    }
  ): Promise<{ result: T; interactionId: string }> {
    return this.recorder.track(fn, context)
  }

  // ─── Verification: Tell the SDK what worked ──────────────

  verify(
    interactionId: string,
    outcome: 'success' | 'failure',
    note: string,
    source?: string
  ) {
    return this.recorder.verify(interactionId, outcome, note, source)
  }

  tag(interactionId: string, tags: string[]) {
    return this.recorder.tag(interactionId, tags)
  }

  // ─── Insights: What unique knowledge do you have? ────────

  async getInsightsForReview(): Promise<Insight[]> {
    await this.runAnalysis()
    return this.analyzer.getInsightsForReview()
  }

  printInsightsReport() {
    const insights = this.analyzer.getInsightsForReview()
    if (insights.length === 0) {
      console.log('\n[OazyseSDK] No insights ready for review yet. Keep using your agent.')
      return
    }

    console.log('\n' + '═'.repeat(60))
    console.log('  oazyse° os sdk — YOUR UNIQUE KNOWLEDGE REPORT')
    console.log('═'.repeat(60))
    console.log(`  Agent: ${this.agentId}`)
    console.log(`  ${insights.length} insights found, ready for your review`)
    console.log('─'.repeat(60))

    for (const insight of insights) {
      const valueEmoji = {
        unique: '🌟', high: '⭐', medium: '💡', low: '📝'
      }[insight.potentialValue]
      const verifiedBadge = insight.realWorldVerified ? '✓ VERIFIED' : '○ unverified'

      console.log(`\n${valueEmoji} ${insight.title}`)
      console.log(`   ${verifiedBadge}  |  confidence: ${(insight.confidence * 100).toFixed(0)}%  |  ${insight.domain}`)
      console.log(`   ${insight.description}`)
      if (insight.evidence.length > 0) {
        console.log(`   Evidence: "${insight.evidence[0]}"`)
      }
      console.log(`   ID: ${insight.id}`)
    }

    console.log('\n' + '─'.repeat(60))
    console.log('  To contribute an insight to the oazyse° os net:')
    console.log('  sdk.approveAndContribute("insight-id")')
    console.log('═'.repeat(60) + '\n')
  }

  // ─── Contribution: Send approved insights to oazyse° os net ────────

  async approveAndContribute(insightId: string, ownerNote?: string): Promise<{
    success: boolean
    contributionId?: string
    tokensEstimate?: number
    message: string
  }> {
    const insight = this.analyzer.getInsight(insightId)
    if (!insight) return { success: false, message: 'Insight not found' }

    // Approve locally first
    this.analyzer.approveInsight(insightId, ownerNote)

    // Submit to oazyse° os net
    try {
      const oazyseUrl = this.config.oazyseUrl || 'http://localhost:9000'
      const payload = {
        agentId: this.agentId,
        insight: {
          id: insight.id,
          title: insight.title,
          description: insight.description,
          domain: insight.domain,
          confidence: insight.confidence,
          realWorldVerified: insight.realWorldVerified,
          potentialValue: insight.potentialValue,
          evidence: insight.evidence,
          suggestedTags: insight.suggestedTags,
          ownerNote: ownerNote || insight.ownerNote
        }
      }

      const response = await this.post(`${oazyseUrl}/api/sdk/contribute`, payload)

      if (response.success) {
        this.analyzer.markContributed(insightId, response.contributionId)
        console.log(`[OazyseSDK] ✓ Insight contributed: ${response.contributionId}`)
        return {
          success: true,
          contributionId: response.contributionId,
          tokensEstimate: response.tokensEstimate,
          message: `Contributed to oazyse° os net. You will earn tokens each time other agents use this insight.`
        }
      }

      return { success: false, message: response.error || 'Contribution failed' }
    } catch (e) {
      console.error('[OazyseSDK] Contribution failed:', e)
      return { success: false, message: `Network error: ${(e as Error).message}` }
    }
  }

  // ─── Stats ───────────────────────────────────────────────

  async getStats(): Promise<SDKStats> {
    const recorderStats = this.recorder.getStats()
    const insights = this.analyzer.getAllInsights()

    return {
      totalInteractions: recorderStats.total,
      verifiedInteractions: recorderStats.verified,
      patternsFound: insights.length,
      insightsGenerated: insights.length,
      insightsContributed: insights.filter(i => i.status === 'contributed').length,
      tokensEarned: 0, // TODO: fetch from oazyse° os net
      topDomains: recorderStats.domains
    }
  }

  // ─── Internal ────────────────────────────────────────────

  private async runAnalysis() {
    try {
      const interactions = this.recorder.getAll()
      if (interactions.length < (this.config.minInteractionsForPattern || 3)) return

      const result = await this.analyzer.analyze(interactions)
      if (result.newInsights > 0) {
        console.log(`[OazyseSDK] 💡 ${result.newInsights} new insights found! Call sdk.printInsightsReport() to review.`)
      }
    } catch (e) {
      console.error('[OazyseSDK] Analysis failed:', e)
    }
  }

  private post(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(data)
      const parsed = new URL(url)
      const lib = parsed.protocol === 'https:' ? https : http

      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let raw = ''
        res.on('data', d => raw += d)
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) }
          catch { resolve({ success: false, error: 'Invalid response' }) }
        })
      })

      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  destroy() {
    if (this.analyzeTimer) clearInterval(this.analyzeTimer)
  }
}

// Re-export types for consumers
export type { SDKConfig, Insight, SDKStats } from './types'
