import { Keypair } from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ManifestBuilder, ManifestPacket, PacketType } from './ManifestBuilder'
import { SolanaAnchor } from './SolanaAnchor'

export const NODE_DIR = path.join(os.homedir(), '.oazyse-os')

export class Node {
  wallet: Keypair
  nodeId: string
  solana: SolanaAnchor
  startTime = Date.now()
  offered: ManifestPacket[] = []
  received: ManifestPacket[] = []
  peers = new Map<string, { connectedAt: number; exchangeCount: number }>()
  reputation = 100
  genesisRecord: any = null

  constructor() {
    this.solana = new SolanaAnchor()
    this.ensureDirs()
    this.wallet = this.loadOrCreateWallet()
    this.nodeId = `node-${this.wallet.publicKey.toBase58().slice(0, 8).toLowerCase()}`
    this.loadGenesis()
  }

  private ensureDirs() {
    ['', 'vault', 'inbox', 'public', 'brain', 'logs', 'memory']
      .forEach(sub => {
        const d = path.join(NODE_DIR, sub)
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
      })
  }

  private loadOrCreateWallet(): Keypair {
    // Cloud Run / Docker: load from env var (Secret Manager)
    if (process.env.SOLANA_WALLET_JSON) {
      try {
        const d = JSON.parse(process.env.SOLANA_WALLET_JSON)
        console.log('[Node] Wallet loaded from SOLANA_WALLET_JSON env var')
        return Keypair.fromSecretKey(new Uint8Array(d.secretKey))
      } catch (e) {
        console.error('[Node] Failed to parse SOLANA_WALLET_JSON, falling back to file')
      }
    }
    // Local: load or create from ~/.oazyse-os/wallet.json
    const p = path.join(NODE_DIR, 'wallet.json')
    if (fs.existsSync(p)) {
      const d = JSON.parse(fs.readFileSync(p, 'utf8'))
      return Keypair.fromSecretKey(new Uint8Array(d.secretKey))
    }
    const kp = Keypair.generate()
    fs.writeFileSync(p, JSON.stringify({
      publicKey: kp.publicKey.toBase58(),
      secretKey: Array.from(kp.secretKey),
      created: new Date().toISOString()
    }, null, 2))
    console.log(`[Node] New wallet created: ${kp.publicKey.toBase58()}`)
    return kp
  }

  private loadGenesis() {
    const p = path.join(process.cwd(), '.genesis-record.json')
    if (fs.existsSync(p)) this.genesisRecord = JSON.parse(fs.readFileSync(p, 'utf8'))
  }

  offer(type: PacketType, description: string, price = 0, tags: string[] = [], metadata = {}): ManifestPacket {
    const m = ManifestBuilder.create(this.nodeId, this.wallet, type, description, price, tags, metadata)
    this.offered.push(m)
    fs.writeFileSync(
      path.join(NODE_DIR, 'public', `${m.proof.hash.slice(0, 12)}.json`),
      JSON.stringify(m, null, 2)
    )
    this.log(`OFFER ${ManifestBuilder.summarize(m)}`)
    return m
  }

  receive(manifest: ManifestPacket): boolean {
    this.received.push(manifest)
    fs.writeFileSync(
      path.join(NODE_DIR, 'inbox', `${manifest.proof.hash.slice(0, 12)}.json`),
      JSON.stringify(manifest, null, 2)
    )
    this.log(`RECEIVED ${ManifestBuilder.summarize(manifest)} from ${manifest.header.node_id}`)
    return true
  }

  async exchangeWith(other: Node, manifest: ManifestPacket) {
    const transferred = JSON.parse(JSON.stringify(manifest))
    other.receive(transferred)
    this.peers.set(other.nodeId, {
      connectedAt: Date.now(),
      exchangeCount: (this.peers.get(other.nodeId)?.exchangeCount || 0) + 1
    })
    const memo = `oazyse|exchange|oazyse|exchange|${this.nodeId.slice(5, 13)}→${other.nodeId.slice(5, 13)}|${manifest.proof.hash.slice(0, 8)}`
    try {
      const sig = await this.solana.anchor(this.wallet, memo)
      return { success: true, sig, url: this.solana.explorerUrl(sig) }
    } catch {
      return { success: true, sig: `local-${Date.now()}`, url: '' }
    }
  }

  log(message: string) {
    const entry = `[${new Date().toISOString()}] [${this.nodeId}] ${message}\n`
    fs.appendFileSync(path.join(NODE_DIR, 'logs', 'activity.log'), entry)
  }

  async status() {
    const balance = await this.solana.balance(this.wallet.publicKey)
    return {
      nodeId: this.nodeId,
      pubkey: this.wallet.publicKey.toBase58(),
      balance,
      peers: this.peers.size,
      offered: this.offered.length,
      received: this.received.length,
      reputation: this.reputation,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      isGenesis: !!this.genesisRecord
    }
  }

  // Alias for backwards compat
  async getStatus() {
    return this.status()
  }

  saveGenesis(data: any) {
    this.genesisRecord = data
    fs.writeFileSync(path.join(process.cwd(), '.genesis-record.json'), JSON.stringify(data, null, 2))
  }
}
