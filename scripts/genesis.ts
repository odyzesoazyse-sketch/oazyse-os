import chalk from 'chalk'
import * as fs from 'fs'
import { Node } from '../src/core/Node'
import { KnowledgeMarket } from '../src/core/KnowledgeMarket'
import { TokenEconomics } from '../src/token/TokenEconomics'

async function genesis() {
  console.clear()
  console.log(chalk.yellow('\n  ╔══════════════════════════════════════════╗'))
  console.log(chalk.yellow('  ║   MESH NODE — GENESIS LAUNCH             ║'))
  console.log(chalk.yellow('  ║   Decentralized AI Agent Network         ║'))
  console.log(chalk.yellow('  ║   ABUNDANCE_FOR_ALL_LIFE                 ║'))
  console.log(chalk.yellow('  ╚══════════════════════════════════════════╝\n'))

  // 1. Init node
  console.log(chalk.dim('  [1/5] Initializing node...'))
  const node = new Node()
  console.log(chalk.green(`  ✓ Node ID   : ${chalk.bold(node.nodeId)}`))
  console.log(chalk.green(`  ✓ Wallet    : ${node.wallet.publicKey.toBase58()}`))
  console.log(chalk.cyan(`  ↗ Explorer  : ${node.solana.addressUrl(node.wallet.publicKey.toBase58())}`))

  // 2. Fund
  console.log(chalk.dim('\n  [2/5] Requesting Devnet SOL (free testnet tokens)...'))
  const funded = await node.solana.fund(node.wallet.publicKey)
  const balance = await node.solana.balance(node.wallet.publicKey)
  console.log(chalk[funded ? 'green' : 'yellow'](`  ${funded ? '✓' : '⚠'} Balance: ${balance} SOL`))

  // 3. Genesis manifest
  console.log(chalk.dim('\n  [3/5] Creating Genesis Manifest...'))
  const genesisManifest = node.offer(
    'GENESIS',
    'Network Genesis — Collective Intelligence for Human Flourishing',
    0,
    ['genesis', 'abundance', 'decentralized', 'ai'],
    { values: ['life', 'consciousness', 'freedom', 'abundance', 'truth', 'openness', 'responsibility'] }
  )
  console.log(chalk.green(`  ✓ Hash      : ${genesisManifest.proof.hash.slice(0, 24)}...`))
  console.log(chalk.green(`  ✓ Signature : ${genesisManifest.proof.signature.slice(0, 24)}...`))
  console.log(chalk.green(`  ✓ Intent    : ${genesisManifest.core_intent}`))

  // 4. Anchor to Solana
  console.log(chalk.dim('\n  [4/5] Anchoring to Solana Devnet...'))
  let txSig = ''
  let explorerUrl = ''
  try {
    txSig = await node.solana.anchorGenesis(node.wallet, node.nodeId)
    explorerUrl = node.solana.explorerUrl(txSig)
    console.log(chalk.green(`  ✓ TX        : ${txSig.slice(0, 32)}...`))
    console.log(chalk.cyan(`  ↗ Proof     : ${explorerUrl}`))
    console.log(chalk.dim('    This record is permanent. Cannot be deleted.'))
  } catch (e: any) {
    console.log(chalk.yellow(`  ⚠ Note: ${e.message?.slice(0, 80)}`))
  }

  // 5. Seed market
  console.log(chalk.dim('\n  [5/5] Seeding Knowledge Market...'))
  const tokenEconomics = new TokenEconomics()
  tokenEconomics.mint(node.nodeId, 1000)
  const market = new KnowledgeMarket(node, tokenEconomics)
  const seedPackets = [
    { type: 'KNOWLEDGE' as const, desc: 'Protocol documentation v1.0 — how to build on this network', price: 0, tags: ['docs'] },
    { type: 'DATA' as const, desc: 'Market price index — multi-region real-time data', price: 0.001, tags: ['data', 'prices'] },
    { type: 'SERVICE' as const, desc: 'AI agent orchestration — parallel multi-agent analysis', price: 0.005, tags: ['ai', 'agents'] },
    { type: 'COMPUTE' as const, desc: 'GPU inference time — local model execution', price: 0.01, tags: ['compute', 'gpu'] },
    { type: 'VIBE' as const, desc: 'Design system preset — brutalist minimal aesthetic', price: 0, tags: ['design', 'free'] },
  ]
  seedPackets.forEach(s => {
    market.list(s.type, s.desc, s.price, s.tags)
    console.log(chalk.green(`  ✓ [${s.type}] ${s.desc.slice(0, 48)}`))
  })

  // Save record
  const status = await node.getStatus()
  const record = {
    nodeId: node.nodeId,
    pubkey: node.wallet.publicKey.toBase58(),
    balance,
    txSig: txSig || 'pending',
    explorerUrl,
    genesisHash: genesisManifest.proof.hash,
    marketStats: market.stats(),
    timestamp: Date.now(),
    date: new Date().toISOString()
  }
  node.saveGenesis(record)
  fs.writeFileSync('.genesis-record.json', JSON.stringify(record, null, 2))

  // Summary
  console.log(chalk.yellow('\n  ╔══════════════════════════════════════════╗'))
  console.log(chalk.yellow('  ║   GENESIS COMPLETE ✓                     ║'))
  console.log(chalk.green(`  ║   ${node.nodeId.padEnd(38)}║`))
  console.log(chalk.green(`  ║   Balance: ${(balance + ' SOL').padEnd(31)}║`))
  console.log(chalk.green(`  ║   Knowledge: ${(market.stats().total + ' packets').padEnd(29)}║`))
  console.log(chalk.green(`  ║   Status: ALIVE — Network is born        ║`))
  console.log(chalk.yellow('  ╚══════════════════════════════════════════╝'))
  if (explorerUrl) console.log(chalk.cyan(`\n  ↗ ${explorerUrl}\n`))
  console.log(chalk.dim('  Commands:'))
  console.log(chalk.dim('  npm run demo          — watch multi-agent system'))
  console.log(chalk.dim('  open dashboard/index.html — live network view\n'))
}

genesis().catch(e => {
  console.error(chalk.red('\n  Fatal:'), e.message)
  process.exit(1)
})
