import chalk from 'chalk'
import { Node } from '../src/core/Node'
import { KnowledgeMarket } from '../src/core/KnowledgeMarket'
import { Orchestrator } from '../src/agents/Orchestrator'
import { TruthCourt } from '../src/truth/TruthCourt'
import { ProgressTracker } from '../src/memory/ProgressTracker'
import { TokenEconomics } from '../src/token/TokenEconomics'

async function demo() {
  console.clear()
  console.log(chalk.yellow('\n  MESH NODE — FULL SYSTEM DEMO\n'))
  console.log(chalk.dim('  Demonstrating: P2P exchange · Multi-agent analysis'))
  console.log(chalk.dim('  Truth court · Progress tracking · Solana anchor\n'))
  console.log(chalk.dim('  ──────────────────────────────────────────────\n'))

  // ── TWO NODES ────────────────────────────────────────────
  const alpha = new Node()
  const beta  = new Node()
  alpha.peers.set(beta.nodeId, { connectedAt: Date.now(), exchangeCount: 0 })
  beta.peers.set(alpha.nodeId, { connectedAt: Date.now(), exchangeCount: 0 })

  console.log(chalk.cyan(`  Node Alpha : ${alpha.nodeId}`))
  console.log(chalk.cyan(`  Node Beta  : ${beta.nodeId}\n`))

  // ── KNOWLEDGE EXCHANGE ───────────────────────────────────
  console.log(chalk.dim('  [1] Knowledge Market Exchange'))
  const tokenEconomics = new TokenEconomics()
  tokenEconomics.mint(alpha.nodeId, 1000)
  tokenEconomics.mint(beta.nodeId, 1000)
  const alphaMarket = new KnowledgeMarket(alpha, tokenEconomics)
  const packet = alphaMarket.list(
    'DATA',
    'Real-time AI model pricing comparison — 15 providers, updated hourly',
    0.001,
    ['ai', 'pricing', 'data']
  )
  console.log(chalk.green(`  ✓ Alpha listed: "${packet.payload.description.slice(0, 50)}"`))

  const betaMarket = new KnowledgeMarket(beta, tokenEconomics)
  const found = alphaMarket.browse({ tags: ['ai'] })
  console.log(chalk.green(`  ✓ Beta found: ${found.length} matching packets`))

  await node_fund(alpha)
  const exchange = await alpha.exchangeWith(beta, found[0].manifest)
  console.log(chalk.green(`  ✓ Transfer: ${exchange.success ? 'SUCCESS' : 'FAILED'}`))
  if (exchange.url) console.log(chalk.cyan(`  ↗ ${exchange.url}`))

  // ── MULTI-AGENT ANALYSIS ─────────────────────────────────
  console.log(chalk.dim('\n  [2] Multi-Agent Orchestrator'))
  const orchestrator = new Orchestrator(alpha)

  const insight1 = await orchestrator.analyze({
    text: 'Solana devnet latency increasing across multiple regions, transaction throughput declining',
    role: 'user'
  })
  console.log(chalk.green(`  ✓ Analysis 1: urgency=${insight1.urgency}`))
  console.log(chalk.yellow(`    → ${insight1.recommendation.slice(0, 80)}`))

  const insight2 = await orchestrator.analyze({
    text: 'Network compute nodes scaling capacity, distributed storage replication active across regions',
    query: 'compute scaling',
    role: 'user'
  })
  console.log(chalk.green(`  ✓ Analysis 2: urgency=${insight2.urgency}`))
  console.log(chalk.yellow(`    → ${insight2.recommendation.slice(0, 80)}`))

  // ── TRUTH COURT ──────────────────────────────────────────
  console.log(chalk.dim('\n  [3] Truth Court — Economic Enforcement'))
  const court = new TruthCourt(alpha, tokenEconomics)
  const cId = court.challenge(
    beta.nodeId, 'malicious-node-xyz',
    'fake-hash-000', 'AI hallucination passed as real data',
    ['No sources', 'Impossible claims'], 0.01
  )
  court.vote(cId, 'validator-1', 'FAKE', 0.01, 'Verified: data doesnt exist')
  court.vote(cId, 'validator-2', 'FAKE', 0.01, 'Cross-checked: false')
  court.vote(cId, 'validator-3', 'FAKE', 0.01, 'Pattern matches known spam')

  const c = court.challenges.get(cId)!
  console.log(chalk.green(`  ✓ Challenge: ${c.finalVerdict}`))
  console.log(chalk.red(`  ✓ Malicious node reputation: ${court.getReputation('malicious-node-xyz')}/100`))
  console.log(chalk.dim('    Economics enforce truth. Fraud costs money.'))

  // ── PROGRESS TRACKING ────────────────────────────────────
  console.log(chalk.dim('\n  [4] Progress Tracker — Network Goals'))
  const tracker = new ProgressTracker()
  const goal = tracker.setGoal('Scale network to 100 active nodes with 99.9% uptime', 'NETWORK', 15)
  console.log(chalk.green(`  ✓ Goal set: "${goal.description.slice(0, 50)}"`))

  // Simulate 3 tasks
  for (let i = 1; i <= 3; i++) {
    const task = tracker.recordTask({
      taskId: `task-${i}`,
      goalId: goal.id,
      date: new Date().toISOString(),
      duration: 45 + i * 5,
      achievements: i === 3 ? ['Distributed hash table fully operational across 10 nodes'] : [],
      blockers: i < 3 ? ['NAT traversal issues on some peers', 'Airdrop rate limiting'] : [],
      metrics: [`Task ${i}: ${i * 3 + 1} nodes online, ${99 + i * 0.3}% uptime`],
      nextSteps: i === 3 ? 'Deploy WebRTC signaling server for NAT traversal' : 'Continue node onboarding',
      progressDelta: i === 3 ? 0.15 : 0.05
    })
    console.log(chalk.green(`  ✓ Task ${i} recorded: ${task.achievements.length > 0 ? 'MILESTONE' : 'progress'}`))
  }

  const context = tracker.getNextTaskContext(goal.id)
  console.log(chalk.cyan(`\n  Next action: "${context.suggestedAction}"`))
  console.log(chalk.cyan(`  Momentum: ${context.momentum}`))

  const progress = tracker.getProgressMap(goal.id)
  console.log(chalk.dim(`\n  Initial blockers: ${progress.initial[0] || 'none'}`))
  console.log(chalk.green(`  Current metrics:  ${progress.current[0] || 'collecting data'}`))

  // ── FINAL STATUS ─────────────────────────────────────────
  const alphaStatus = await alpha.getStatus()
  const betaStatus = await beta.getStatus()
  const summaryO = orchestrator.getSessionSummary()

  console.log(chalk.yellow('\n  ══════════════════════════════════════════════'))
  console.log(chalk.yellow('  FULL SYSTEM DEMO COMPLETE'))
  console.log(chalk.green(`  Alpha: offered=${alphaStatus.offered} received=${alphaStatus.received} peers=${alphaStatus.peers}`))
  console.log(chalk.green(`  Beta:  offered=${betaStatus.offered}  received=${betaStatus.received}  peers=${betaStatus.peers}`))
  console.log(chalk.green(`  Agents: ${summaryO.totalInsights} insights, ${summaryO.criticalMoments} critical moments`))
  console.log(chalk.green(`  Court:  ${court.getStats().fakeDetected} fake packets detected`))
  console.log(chalk.green(`  Progress: goal at ${tracker.getAllGoals()[0]?.progressPercent.toFixed(0)}%`))
  console.log(chalk.yellow('  ══════════════════════════════════════════════\n'))
}

async function node_fund(node: Node) {
  await node.solana.fund(node.wallet.publicKey)
}

demo().catch(e => {
  console.error(chalk.red('\n  Error:'), e.message)
  process.exit(1)
})
