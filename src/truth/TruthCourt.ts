import { Node, NODE_DIR } from '../core/Node'
import { TokenEconomics } from '../token/TokenEconomics'
import * as fs from 'fs'
import * as path from 'path'

export type Verdict = 'VALID' | 'FAKE' | 'PENDING' | 'DISPUTED'

export interface Challenge {
  id: string
  challenger: string
  defendant: string
  manifestHash: string
  reason: string
  evidence: string[]
  stake: number
  timestamp: number
  votes: { voter: string; verdict: Verdict; stake: number; reasoning: string }[]
  finalVerdict: Verdict
  resolvedAt?: number
  slashAmount?: number
}

export class TruthCourt {
  challenges = new Map<string, Challenge>()
  private reputationMap = new Map<string, number>()
  private requiredVotes = 3
  private tokenEconomics: TokenEconomics
  private dataPath = path.join(NODE_DIR, 'brain', 'truth_court.json')

  constructor(private node: Node, tokenEconomics: TokenEconomics) {
    this.tokenEconomics = tokenEconomics
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'))
        if (data.challenges) {
          for (const c of data.challenges) this.challenges.set(c.id, c)
        }
        if (data.reputation) {
          for (const [k, v] of Object.entries(data.reputation)) {
            this.reputationMap.set(k, v as number)
          }
        }
        console.log(`[TruthCourt] Loaded ${this.challenges.size} challenges from disk`)
      }
    } catch (e) {
      console.error('[TruthCourt] Load failed:', e)
    }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.dataPath), { recursive: true })
      fs.writeFileSync(this.dataPath, JSON.stringify({
        challenges: Array.from(this.challenges.values()),
        reputation: Object.fromEntries(this.reputationMap)
      }, null, 2))
    } catch (e) {
      console.error('[TruthCourt] Save failed:', e)
    }
  }

  // File a challenge — stake your tokens on the claim
  challenge(
    challengerId: string,
    defendantId: string,
    manifestHash: string,
    reason: string,
    evidence: string[],
    stake: number
  ): string {
    const id = `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    // Challenger stakes tokens
    if (stake > 0) {
      this.tokenEconomics.stake(challengerId, stake)
    }

    this.challenges.set(id, {
      id, challenger: challengerId, defendant: defendantId,
      manifestHash, reason, evidence, stake,
      timestamp: Date.now(), votes: [], finalVerdict: 'PENDING'
    })
    this.node.log(`TRUTH_COURT Challenge filed: ${id} — "${reason}" (stake: ${stake})`)
    this.save()
    return id
  }

  // Vote — put your stake where your verdict is
  vote(
    challengeId: string,
    voterId: string,
    verdict: Verdict,
    stake: number,
    reasoning = ''
  ): { accepted: boolean; message: string } {
    const c = this.challenges.get(challengeId)
    if (!c) return { accepted: false, message: 'Challenge not found' }
    if (c.finalVerdict !== 'PENDING') return { accepted: false, message: 'Already resolved' }
    if (c.votes.find(v => v.voter === voterId)) return { accepted: false, message: 'Already voted' }

    // Voter stakes tokens on their verdict
    if (stake > 0) {
      this.tokenEconomics.stake(voterId, stake)
    }

    c.votes.push({ voter: voterId, verdict, stake, reasoning })
    this.node.log(`TRUTH_COURT Vote: ${voterId} → ${verdict} on ${challengeId}`)
    this.tryResolve(c)
    this.save()

    const remaining = Math.max(0, this.requiredVotes - c.votes.length)
    return { accepted: true, message: remaining > 0 ? `Vote recorded. ${remaining} more needed.` : 'Vote recorded. Verdict reached.' }
  }

  private tryResolve(c: Challenge) {
    if (c.votes.length < this.requiredVotes) return

    const validVotes = c.votes.filter(v => v.verdict === 'VALID').length
    const fakeVotes = c.votes.filter(v => v.verdict === 'FAKE').length

    if (fakeVotes > validVotes) {
      c.finalVerdict = 'FAKE'
      c.slashAmount = c.stake

      // Slash defendant's tokens — burned as punishment
      this.tokenEconomics.slash(c.defendant, c.stake, `TruthCourt FAKE verdict: ${c.reason}`)
      this.reputationMap.set(c.defendant, (this.reputationMap.get(c.defendant) || 100) - 20)

      // Unstake challenger (they were right)
      this.tokenEconomics.unstake(c.challenger, c.stake)

      // Unstake FAKE voters (they were right)
      for (const v of c.votes.filter(v => v.verdict === 'FAKE')) {
        this.tokenEconomics.unstake(v.voter, v.stake)
      }
      // Slash VALID voters (they were wrong)
      for (const v of c.votes.filter(v => v.verdict === 'VALID')) {
        this.tokenEconomics.slash(v.voter, v.stake, 'Voted VALID on FAKE manifest')
      }

      this.node.log(`TRUTH_COURT RESOLVED FAKE — ${c.defendant} slashed ${c.stake} tokens, rep -20`)

    } else if (validVotes > fakeVotes) {
      c.finalVerdict = 'VALID'

      // Slash challenger (they were wrong — false challenge)
      this.tokenEconomics.slash(c.challenger, c.stake, `TruthCourt VALID verdict — false challenge: ${c.reason}`)
      this.reputationMap.set(c.challenger, (this.reputationMap.get(c.challenger) || 100) - 10)

      // Unstake VALID voters (they were right)
      for (const v of c.votes.filter(v => v.verdict === 'VALID')) {
        this.tokenEconomics.unstake(v.voter, v.stake)
      }
      // Slash FAKE voters (they were wrong)
      for (const v of c.votes.filter(v => v.verdict === 'FAKE')) {
        this.tokenEconomics.slash(v.voter, v.stake, 'Voted FAKE on VALID manifest')
      }

      this.node.log(`TRUTH_COURT RESOLVED VALID — ${c.challenger} loses challenge stake, rep -10`)

    } else {
      c.finalVerdict = 'DISPUTED'
      // Tie — return stakes to everyone
      this.tokenEconomics.unstake(c.challenger, c.stake)
      for (const v of c.votes) {
        this.tokenEconomics.unstake(v.voter, v.stake)
      }
      this.node.log(`TRUTH_COURT DISPUTED — stakes returned to all parties`)
    }

    c.resolvedAt = Date.now()
  }

  getReputation(nodeId: string): number {
    return this.reputationMap.get(nodeId) || 100
  }

  getPending(): Challenge[] {
    return Array.from(this.challenges.values()).filter(c => c.finalVerdict === 'PENDING')
  }

  getStats() {
    const all = Array.from(this.challenges.values())
    return {
      total: all.length,
      pending: all.filter(c => c.finalVerdict === 'PENDING').length,
      resolved: all.filter(c => c.finalVerdict !== 'PENDING').length,
      fakeDetected: all.filter(c => c.finalVerdict === 'FAKE').length,
      validKnowledge: all.filter(c => c.finalVerdict === 'VALID').length
    }
  }
}
