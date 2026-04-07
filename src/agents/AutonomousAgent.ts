/**
 * AutonomousAgent — The heart of the oazyse° os demo.
 *
 * Runs continuously (every 60s by default), scans the knowledge market,
 * evaluates packets with Gemini LLM, and fires on-chain Solana transactions
 * based on its decisions. All reasoning and tx hashes are broadcast to oazyse° os frame.
 *
 * Flow:
 *   readOnChainState → scanMarket → evaluateWithLLM → decide → executeOnChain → broadcastDecision
 */

import { Node } from '../core/Node'
import { KnowledgeMarket, Listing } from '../core/KnowledgeMarket'
import { TruthCourt } from '../truth/TruthCourt'
import { TokenEconomics } from '../token/TokenEconomics'
import { OazyseNetProgram, NodeState } from '../blockchain/MeshProgram'
import { LLMEngine } from './LLMEngine'
import * as fs from 'fs'
import * as path from 'path'

export type DecisionAction = 'BUY' | 'CHALLENGE' | 'PASS'

export interface Decision {
  id: string
  timestamp: number
  cycle: number
  packet: {
    hash: string
    description: string
    type: string
    price: number
    seller: string
  }
  llm_reasoning: string
  quality_score: number           // 0-100 from LLM
  seller_reputation: number       // from on-chain state
  action: DecisionAction
  tx_hash?: string
  explorer_url?: string
  on_chain: boolean               // true = real devnet tx
  state_delta?: {
    reputation_before: number
    reputation_after: number
  }
  duration_ms: number
}

export class AutonomousAgent {
  private running = false
  private timer: NodeJS.Timeout | null = null
  private llm: LLMEngine
  private meshProgram: OazyseNetProgram
  decisions: Decision[] = []
  private cycle = 0
  private onDecision?: (d: Decision) => void

  constructor(
    private node: Node,
    private market: KnowledgeMarket,
    private court: TruthCourt,
    private tokenEconomics: TokenEconomics,
    onDecision?: (d: Decision) => void
  ) {
    this.llm = new LLMEngine()
    this.meshProgram = new OazyseNetProgram(node.wallet)
    this.onDecision = onDecision
  }

  // ── LIFECYCLE ───────────────────────────────────────────────

  async start(intervalMs = 60_000): Promise<void> {
    if (this.running) return
    this.running = true

    // Register this node on-chain
    try {
      const txHash = await this.meshProgram.initNode(this.node.nodeId)
      this.node.log(`AUTONOMOUS init_node on-chain: ${txHash}`)
    } catch {}

    // Run immediately, then on interval
    this.runCycle()
    this.timer = setInterval(() => this.runCycle(), intervalMs)
  }

  stop(): void {
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  isRunning(): boolean { return this.running }

  async triggerOnce(): Promise<Decision | null> {
    return this.runCycle()
  }

  getRecentDecisions(limit = 20): Decision[] {
    return this.decisions.slice(-limit).reverse()
  }

  getStats() {
    const all = this.decisions
    return {
      running: this.running,
      cycle: this.cycle,
      totalDecisions: all.length,
      byAction: {
        BUY: all.filter(d => d.action === 'BUY').length,
        CHALLENGE: all.filter(d => d.action === 'CHALLENGE').length,
        PASS: all.filter(d => d.action === 'PASS').length
      },
      onChainTxs: all.filter(d => d.on_chain).length,
      lastDecision: all[all.length - 1] || null
    }
  }

  // ── CORE LOOP ───────────────────────────────────────────────

  private async runCycle(): Promise<Decision | null> {
    if (!this.running) return null
    const start = Date.now()
    this.cycle++
    const cycleNum = this.cycle

    try {
      // 1. Scan market for available packets
      const listings = this.market.browse()
      if (listings.length === 0) {
        this.node.log(`AUTONOMOUS cycle=${cycleNum} — no listings in market, seeding...`)
        await this.seedMarket()
        return null
      }

      // Pick a random listing to evaluate (occasionally bias toward bad ones for demo)
      const pickIdx = Math.random() < 0.2 && listings.length > 5
        ? listings.length - 1  // pick last (often the seeded bad packet)
        : Math.floor(Math.random() * Math.min(listings.length, 8))
      const listing = listings[pickIdx] || listings[0]

      // 2. Read on-chain seller reputation
      const sellerState = await this.meshProgram.readNodeState(listing.manifest.header.node_id)

      // 3. Evaluate with LLM
      const evaluation = await this.evaluatePacket(listing, sellerState)

      // 4. Decide
      const action = this.decide(evaluation.qualityScore, sellerState.reputation)

      // 5. Execute on-chain
      const { txHash, onChain, stateDelta } = await this.executeDecision(action, listing, evaluation, sellerState)

      // 6. Build decision record
      const decision: Decision = {
        id: `d-${Date.now()}-${cycleNum}`,
        timestamp: Date.now(),
        cycle: cycleNum,
        packet: {
          hash: listing.manifest.proof.hash.slice(0, 12),
          description: listing.manifest.payload.description,
          type: listing.manifest.payload.type,
          price: listing.manifest.payload.price,
          seller: listing.manifest.header.node_id
        },
        llm_reasoning: evaluation.reasoning,
        quality_score: evaluation.qualityScore,
        seller_reputation: sellerState.reputation,
        action,
        tx_hash: txHash,
        explorer_url: txHash ? this.meshProgram.explorerUrl(txHash) : undefined,
        on_chain: onChain,
        state_delta: stateDelta,
        duration_ms: Date.now() - start
      }

      this.decisions.push(decision)
      if (this.decisions.length > 500) this.decisions.shift()

      this.node.log(`AUTONOMOUS cycle=${cycleNum} ${action} "${listing.manifest.payload.description.slice(0, 40)}" quality=${evaluation.qualityScore} rep=${sellerState.reputation} tx=${txHash?.slice(0, 12)}`)

      if (this.onDecision) this.onDecision(decision)
      return decision

    } catch (e: any) {
      this.node.log(`AUTONOMOUS cycle=${cycleNum} ERROR: ${e.message}`)
      return null
    }
  }

  // ── EVALUATION ──────────────────────────────────────────────

  private async evaluatePacket(
    listing: Listing,
    sellerState: NodeState
  ): Promise<{ qualityScore: number; reasoning: string }> {
    const prompt = `You are an autonomous AI agent evaluating a knowledge packet for purchase on the oazyse° os net.

Packet to evaluate:
- Type: ${listing.manifest.payload.type}
- Description: "${listing.manifest.payload.description}"
- Price: ${listing.manifest.payload.price} tokens
- Tags: ${listing.manifest.payload.tags.join(', ')}
- Seller reputation: ${sellerState.reputation}/100 (on-chain)
- Seller packets sold: ${sellerState.packetsSold}

Respond in this EXACT format (JSON only, no markdown):
{
  "quality_score": <0-100 integer>,
  "reasoning": "<2-3 sentences explaining your assessment>"
}

Consider: description clarity, price fairness, seller reputation, type relevance.
High quality (70+) = clear value, fair price, good reputation.
Low quality (<30) = vague, overpriced, or suspicious.`

    try {
      const response = await this.llm.generateWidget(prompt)
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          qualityScore: Math.max(0, Math.min(100, Number(parsed.quality_score) || 50)),
          reasoning: parsed.reasoning || 'Evaluated by AI agent'
        }
      }
    } catch {}

    // Fallback: heuristic scoring
    return this.heuristicEvaluate(listing, sellerState)
  }

  private heuristicEvaluate(listing: Listing, sellerState: NodeState): { qualityScore: number; reasoning: string } {
    const desc = listing.manifest.payload.description
    const price = listing.manifest.payload.price
    const rep = sellerState.reputation

    let score = 50
    if (desc.length > 20) score += 10        // descriptive
    if (desc.length > 50) score += 10        // very descriptive
    if (price === 0) score += 5              // free = accessible
    if (price < 0.01) score += 5            // cheap
    if (price > 0.1) score -= 10            // expensive
    if (rep >= 90) score += 20              // high reputation seller
    if (rep >= 70) score += 10
    if (rep < 50) score -= 20              // low reputation
    if (rep < 30) score -= 20              // very low reputation
    if (listing.manifest.payload.tags.length > 2) score += 5  // well-tagged

    const clampedScore = Math.max(0, Math.min(100, score))
    const reasoning = `Heuristic evaluation: description length=${desc.length}, price=${price}, seller_rep=${rep}. Score: ${clampedScore}/100.`
    return { qualityScore: clampedScore, reasoning }
  }

  // ── DECISION LOGIC ──────────────────────────────────────────

  private decide(qualityScore: number, sellerReputation: number): DecisionAction {
    if (qualityScore >= 70 && sellerReputation >= 50) return 'BUY'
    if (qualityScore < 25 || sellerReputation < 20) return 'CHALLENGE'
    return 'PASS'
  }

  // ── EXECUTION ───────────────────────────────────────────────

  private async executeDecision(
    action: DecisionAction,
    listing: Listing,
    evaluation: { qualityScore: number; reasoning: string },
    sellerState: NodeState
  ): Promise<{ txHash?: string; onChain: boolean; stateDelta?: Decision['state_delta'] }> {

    const seller = listing.manifest.header.node_id

    if (action === 'BUY') {
      // Record packet purchase on-chain
      const txHash = await this.meshProgram.recordPacket(
        listing.manifest.proof.hash,
        listing.manifest.payload.type,
        listing.manifest.payload.price,
        seller,
        evaluation.qualityScore
      )

      // Also transfer tokens
      const price = listing.manifest.payload.price
      if (price > 0) {
        this.tokenEconomics.distribute(this.node.nodeId, seller, price)
      }

      // Update seller reputation positively
      const repBefore = sellerState.reputation
      await this.meshProgram.updateReputation(seller, +2, 'packet_purchased')
      const repAfter = (await this.meshProgram.readNodeState(seller)).reputation

      return {
        txHash,
        onChain: this.meshProgram.isRealTx(txHash),
        stateDelta: { reputation_before: repBefore, reputation_after: repAfter }
      }

    } else if (action === 'CHALLENGE') {
      // File a Truth Court challenge
      const challengeId = this.court.challenge(
        this.node.nodeId, seller,
        listing.manifest.proof.hash,
        `Low quality score: ${evaluation.qualityScore}/100. ${evaluation.reasoning.slice(0, 80)}`,
        ['AI quality evaluation', `score=${evaluation.qualityScore}`],
        0.01
      )

      // Record verdict on-chain (AI auto-votes FAKE for low quality)
      const repBefore = sellerState.reputation
      const txHash = await this.meshProgram.recordVerdict(
        challengeId, 'FAKE', seller, 0.01
      )
      const repAfter = (await this.meshProgram.readNodeState(seller)).reputation

      return {
        txHash,
        onChain: this.meshProgram.isRealTx(txHash),
        stateDelta: { reputation_before: repBefore, reputation_after: repAfter }
      }

    } else {
      // PASS — just record the evaluation on-chain as a memo
      const txHash = await this.meshProgram.recordPacket(
        listing.manifest.proof.hash,
        listing.manifest.payload.type,
        listing.manifest.payload.price,
        seller,
        evaluation.qualityScore
      )
      return { txHash, onChain: this.meshProgram.isRealTx(txHash) }
    }
  }

  // ── MARKET SEEDING ──────────────────────────────────────────
  // Seeds the market with demo packets so there's always something to evaluate

  private async seedMarket(): Promise<void> {
    const seeds = [
      { type: 'KNOWLEDGE' as const, desc: 'DeFi yield optimization strategies — backtested 2023-2025', price: 0.005, tags: ['defi', 'yield', 'finance'] },
      { type: 'DATA' as const, desc: 'Solana validator performance metrics — real-time feed', price: 0.001, tags: ['solana', 'validators', 'data'] },
      { type: 'COMPUTE' as const, desc: 'GPU inference cluster — LLAMA 3 70B at $0.0002/token', price: 0.01, tags: ['compute', 'llm', 'gpu'] },
      { type: 'SERVICE' as const, desc: 'AI trading signals — spot + perpetuals, 73% win rate', price: 0.05, tags: ['trading', 'signals', 'ai'] },
      { type: 'KNOWLEDGE' as const, desc: 'x', price: 999, tags: ['spam'] },  // deliberately bad — AI should challenge this
    ]
    for (const s of seeds) {
      this.market.list(s.type, s.desc, s.price, s.tags)
    }
    this.node.log('AUTONOMOUS Market seeded with demo packets')
  }
}
