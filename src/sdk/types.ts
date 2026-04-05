// ═══════════════════════════════════════════════════
// MESH Agent SDK — Types
// ═══════════════════════════════════════════════════

export interface Interaction {
  id: string
  agentId: string
  timestamp: number
  domain: string           // what field: 'medical', 'legal', 'code', 'finance', etc.
  input: string            // what was asked / what the context was
  output: string           // what the agent produced
  outcome?: 'success' | 'failure' | 'unknown'
  outcomeNote?: string     // "user confirmed it worked", "deployment succeeded", etc.
  verified: boolean        // did something in the real world confirm it?
  verificationSource?: string  // 'user_feedback' | 'metric_change' | 'deployment' | 'test_pass'
  metadata?: Record<string, any>
  tags?: string[]
}

export interface Pattern {
  id: string
  interactions: string[]   // interaction IDs that form this pattern
  frequency: number        // how many times this pattern appeared
  domain: string
  description: string      // LLM-generated description of the pattern
  uniquenessScore: number  // 0-1, how likely this is NOT in standard training data
  verifiedCount: number    // how many of these were real-world verified
  firstSeen: number
  lastSeen: number
}

export interface Insight {
  id: string
  patternId: string
  title: string
  description: string      // what this knowledge is
  evidence: string[]       // concrete examples
  domain: string
  confidence: number       // 0-1
  realWorldVerified: boolean
  potentialValue: 'low' | 'medium' | 'high' | 'unique'
  suggestedTags: string[]
  createdAt: number
  // contribution state
  status: 'draft' | 'reviewed' | 'approved' | 'contributed' | 'rejected'
  ownerNote?: string       // owner's annotation
  contributionId?: string  // MESH network contribution ID if contributed
}

export interface SDKConfig {
  agentId: string
  meshUrl?: string          // MESH node URL, default localhost:9000
  autoAnalyze?: boolean     // auto-run pattern analysis, default true
  analyzeInterval?: number  // ms, default 10 min
  minInteractionsForPattern?: number  // default 3
  storageDir?: string       // where to store local data
  llmApiKey?: string        // for insight extraction (uses MESH node LLM by default)
  privacyMode?: 'strict' | 'normal'   // strict = never send raw text, only patterns
}

export interface SDKStats {
  totalInteractions: number
  verifiedInteractions: number
  patternsFound: number
  insightsGenerated: number
  insightsContributed: number
  tokensEarned: number
  topDomains: { domain: string; count: number }[]
}
