/**
 * OazyseNetProgram — TypeScript client for the oazyse° os net Solana Program.
 *
 * When the Anchor program is deployed (program-id.txt exists), this client
 * reads/writes real on-chain PDA accounts via the oazyse° anchor program.
 * Falls back to Memo Program if PDA already exists or devnet is unavailable.
 */

import {
  Connection, Keypair, PublicKey,
  Transaction, TransactionInstruction,
  sendAndConfirmTransaction, SystemProgram
} from '@solana/web3.js'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const MEMO_PROGRAM  = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
const DEVNET        = 'https://api.devnet.solana.com'
const EXPLORER_BASE = 'https://explorer.solana.com'

// Anchor instruction discriminators = sha256("global:<name>")[0:8]
function discriminator(name: string): Buffer {
  return Buffer.from(
    crypto.createHash('sha256').update(`global:${name}`).digest()
  ).subarray(0, 8)
}

const DISC = {
  initNode:         discriminator('init_node'),
  recordPacket:     discriminator('record_packet'),
  recordVerdict:    discriminator('record_verdict'),
  updateReputation: discriminator('update_reputation'),
}

// Borsh helpers
function encodeU8(v: number): Buffer { const b = Buffer.alloc(1); b.writeUInt8(v, 0); return b }
function encodeU32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v, 0); return b }
function encodeU64(v: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(v, 0); return b }
function encodeI64(v: bigint): Buffer { const b = Buffer.alloc(8); b.writeBigInt64LE(v, 0); return b }

export type VerdictType = 'FAKE' | 'VALID' | 'DISPUTED'

export interface NodeState {
  nodeId: string
  reputation: number
  packetsSold: number
  slashedTotal: number
  lastUpdated: number
  onChain: boolean
}

export interface PacketRecord {
  hash: string
  packetType: string
  price: number
  seller: string
  qualityScore: number
  timestamp: number
  txHash?: string
}

export interface VerdictRecord {
  challengeId: string
  defendant: string
  verdict: VerdictType
  slashAmount: number
  timestamp: number
  txHash?: string
}

const CACHE_DIR = path.join(os.homedir(), '.oazyse-os', 'brain', 'blockchain')

export class OazyseNetProgram {
  private connection: Connection
  private programId: PublicKey | null = null
  private nodeCache = new Map<string, NodeState>()
  private packetCache: PacketRecord[] = []
  private verdictCache: VerdictRecord[] = []
  private cacheDir: string

  constructor(
    private wallet: Keypair,
    programIdStr?: string
  ) {
    this.connection = new Connection(DEVNET, 'confirmed')
    this.cacheDir = CACHE_DIR
    fs.mkdirSync(this.cacheDir, { recursive: true })

    if (programIdStr) {
      try { this.programId = new PublicKey(programIdStr) } catch {}
    } else {
      const idFile = path.join(process.cwd(), 'mesh-program', 'program-id.txt')
      if (fs.existsSync(idFile)) {
        try { this.programId = new PublicKey(fs.readFileSync(idFile, 'utf-8').trim()) } catch {}
      }
    }

    if (this.programId) {
      console.log(`[OazyseNetProgram] Using deployed program: ${this.programId.toBase58()}`)
    } else {
      console.log('[OazyseNetProgram] No program deployed — using Memo fallback')
    }

    this.loadCache()
  }

  get isDeployed(): boolean { return this.programId !== null }

  // ── PDA helpers ──────────────────────────────────────────────

  private nodePDA(nodeIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('node'), nodeIdBytes],
      this.programId!
    )
  }

  private packetPDA(hashBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('packet'), hashBytes],
      this.programId!
    )
  }

  private verdictPDA(challengeIdBytes: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('verdict'), challengeIdBytes],
      this.programId!
    )
  }

  private nodeIdToBytes(nodeId: string): Buffer {
    // Convert node-id string to 32-byte fixed buffer
    const b = Buffer.alloc(32)
    Buffer.from(nodeId.slice(0, 32)).copy(b)
    return b
  }

  private hashToBytes(hash: string): Buffer {
    // hex hash → 32 bytes
    try { return Buffer.from(hash.padEnd(64, '0').slice(0, 64), 'hex') } catch { return Buffer.alloc(32) }
  }

  private challengeIdToBytes(id: string): Buffer {
    const b = Buffer.alloc(16)
    Buffer.from(id.slice(0, 16)).copy(b)
    return b
  }

  // ── NODE INIT ────────────────────────────────────────────────

  async initNode(nodeId: string): Promise<string> {
    const nodeIdBytes = this.nodeIdToBytes(nodeId)
    let txHash: string

    if (this.programId) {
      try {
        const [nodePDA] = this.nodePDA(nodeIdBytes)
        // Check if already initialized
        const existing = await this.connection.getAccountInfo(nodePDA)
        if (existing) {
          // Already on-chain, just write a memo
          txHash = await this.writeMemo(`oazyse|node_online|${nodeId.slice(0, 20)}`)
        } else {
          // data = discriminator(8) + node_id(32)
          const data = Buffer.concat([DISC.initNode, nodeIdBytes])
          const ix = new TransactionInstruction({
            keys: [
              { pubkey: nodePDA, isSigner: false, isWritable: true },
              { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data,
          })
          txHash = await this.sendIx(ix)
        }
      } catch (e: any) {
        console.warn(`[OazyseNetProgram] initNode program call failed: ${e.message?.slice(0, 80)}, falling back`)
        txHash = await this.writeMemo(`oazyse|init_node|${nodeId.slice(0, 20)}|rep=100`)
      }
    } else {
      txHash = await this.writeMemo(`oazyse|init_node|${nodeId.slice(0, 20)}|rep=100`)
    }

    const state: NodeState = {
      nodeId, reputation: 100, packetsSold: 0, slashedTotal: 0,
      lastUpdated: Date.now(), onChain: true
    }
    this.nodeCache.set(nodeId, state)
    this.saveCache()
    return txHash
  }

  async readNodeState(nodeId: string): Promise<NodeState> {
    return this.nodeCache.get(nodeId) || {
      nodeId, reputation: 100, packetsSold: 0, slashedTotal: 0,
      lastUpdated: 0, onChain: false
    }
  }

  async updateReputation(nodeId: string, delta: number, reason: string): Promise<string> {
    const state = await this.readNodeState(nodeId)
    const newRep = Math.max(0, Math.min(999, state.reputation + delta))
    let txHash: string

    if (this.programId) {
      try {
        const nodeIdBytes = this.nodeIdToBytes(nodeId)
        const [nodePDA] = this.nodePDA(nodeIdBytes)
        // data = discriminator(8) + delta(i64)
        const data = Buffer.concat([DISC.updateReputation, encodeI64(BigInt(delta))])
        const ix = new TransactionInstruction({
          keys: [
            { pubkey: nodePDA, isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          ],
          programId: this.programId,
          data,
        })
        txHash = await this.sendIx(ix)
      } catch (e: any) {
        txHash = await this.writeMemo(`oazyse|rep|${nodeId.slice(0, 12)}|delta=${delta}|rep=${newRep}`)
      }
    } else {
      txHash = await this.writeMemo(`oazyse|rep|${nodeId.slice(0, 12)}|delta=${delta}|rep=${newRep}|${reason.slice(0, 20)}`)
    }

    state.reputation = newRep
    state.lastUpdated = Date.now()
    state.onChain = true
    this.nodeCache.set(nodeId, state)
    this.saveCache()
    return txHash
  }

  // ── PACKETS ──────────────────────────────────────────────────

  async recordPacket(
    hash: string, packetType: string, price: number,
    seller: string, qualityScore: number
  ): Promise<string> {
    let txHash: string

    if (this.programId) {
      try {
        const hashBytes = this.hashToBytes(hash)
        const sellerIdBytes = this.nodeIdToBytes(seller)
        const [packetPDA] = this.packetPDA(hashBytes)
        const [sellerPDA]  = this.nodePDA(sellerIdBytes)

        // Ensure seller node is initialized on-chain
        const sellerAccount = await this.connection.getAccountInfo(sellerPDA)
        if (!sellerAccount) {
          await this.initNode(seller)
        }

        const typeCode = { 'DATA': 0, 'KNOWLEDGE': 1, 'COMPUTE': 2, 'SERVICE': 3, 'VIBE': 4, 'GENESIS': 5 }[packetType] ?? 1
        // data = discriminator(8) + hash(32) + packet_type(u8) + price(u64) + quality_score(u8)
        const data = Buffer.concat([
          DISC.recordPacket,
          hashBytes,
          encodeU8(typeCode),
          encodeU64(BigInt(Math.round(price * 1_000_000))),
          encodeU8(qualityScore),
        ])
        const ix = new TransactionInstruction({
          keys: [
            { pubkey: packetPDA, isSigner: false, isWritable: true },
            { pubkey: sellerPDA,  isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: this.programId,
          data,
        })
        txHash = await this.sendIx(ix)
      } catch (e: any) {
        // PacketRecord PDA already exists (same hash bought twice) — use memo
        txHash = await this.writeMemo(`oazyse|packet|${hash.slice(0,12)}|type=${packetType}|q=${qualityScore}|seller=${seller.slice(0,12)}`)
      }
    } else {
      txHash = await this.writeMemo(`oazyse|packet|${hash.slice(0,12)}|type=${packetType}|price=${price}|quality=${qualityScore}|seller=${seller.slice(0,12)}`)
    }

    const record: PacketRecord = {
      hash, packetType, price, seller, qualityScore,
      timestamp: Date.now(), txHash
    }
    this.packetCache.push(record)

    const sellerState = await this.readNodeState(seller)
    sellerState.packetsSold++
    sellerState.lastUpdated = Date.now()
    this.nodeCache.set(seller, sellerState)

    this.saveCache()
    return txHash
  }

  // ── VERDICTS ─────────────────────────────────────────────────

  async recordVerdict(
    challengeId: string, verdict: VerdictType,
    defendant: string, slashAmount: number
  ): Promise<string> {
    let txHash: string

    if (this.programId) {
      try {
        const cidBytes = this.challengeIdToBytes(challengeId)
        const defBytes  = this.nodeIdToBytes(defendant)
        const [verdictPDA]   = this.verdictPDA(cidBytes)
        const [defendantPDA] = this.nodePDA(defBytes)

        const verdictCode = { 'FAKE': 1, 'VALID': 2, 'DISPUTED': 3 }[verdict] ?? 1
        // data = discriminator(8) + challenge_id(16) + verdict(u8) + slash_amount(u64)
        const data = Buffer.concat([
          DISC.recordVerdict,
          cidBytes,
          encodeU8(verdictCode),
          encodeU64(BigInt(Math.round(slashAmount * 1_000_000))),
        ])
        const ix = new TransactionInstruction({
          keys: [
            { pubkey: verdictPDA,    isSigner: false, isWritable: true },
            { pubkey: defendantPDA,  isSigner: false, isWritable: true },
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          programId: this.programId,
          data,
        })
        txHash = await this.sendIx(ix)
      } catch (e: any) {
        txHash = await this.writeMemo(`oazyse|verdict|${challengeId.slice(0,12)}|${verdict}|def=${defendant.slice(0,12)}`)
      }
    } else {
      txHash = await this.writeMemo(`oazyse|verdict|${challengeId.slice(0,12)}|${verdict}|defendant=${defendant.slice(0,12)}|slash=${slashAmount}`)
    }

    const record: VerdictRecord = {
      challengeId, defendant, verdict, slashAmount,
      timestamp: Date.now(), txHash
    }
    this.verdictCache.push(record)

    if (verdict === 'FAKE') {
      await this.updateReputation(defendant, -20, `FAKE:${challengeId.slice(0, 8)}`)
      const state = await this.readNodeState(defendant)
      state.slashedTotal += slashAmount
      this.nodeCache.set(defendant, state)
    }

    this.saveCache()
    return txHash
  }

  async readVerdictHistory(nodeId: string): Promise<VerdictRecord[]> {
    return this.verdictCache.filter(v => v.defendant === nodeId)
  }

  // ── CORE TX SENDER ────────────────────────────────────────────

  private async sendIx(ix: TransactionInstruction): Promise<string> {
    const tx = new Transaction().add(ix)
    const sig = await sendAndConfirmTransaction(
      this.connection, tx, [this.wallet],
      { commitment: 'confirmed' }
    )
    return sig
  }

  private async writeMemo(memo: string): Promise<string> {
    try {
      const ix = new TransactionInstruction({
        keys: [{ pubkey: this.wallet.publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(memo.slice(0, 400), 'utf8')
      })
      return await this.sendIx(ix)
    } catch (e: any) {
      const mockSig = `local-${crypto.randomBytes(32).toString('hex')}`
      console.warn(`[OazyseNetProgram] Devnet unavailable: ${e.message?.slice(0, 60)}`)
      return mockSig
    }
  }

  // ── HELPERS ──────────────────────────────────────────────────

  explorerUrl(txHash: string): string {
    if (txHash.startsWith('local-')) return ''
    return `${EXPLORER_BASE}/tx/${txHash}?cluster=devnet`
  }

  programUrl(): string {
    if (!this.programId) return ''
    return `${EXPLORER_BASE}/address/${this.programId.toBase58()}?cluster=devnet`
  }

  isRealTx(txHash: string): boolean {
    return !txHash.startsWith('local-')
  }

  getPacketHistory(): PacketRecord[]  { return [...this.packetCache].reverse() }
  getAllNodeStates(): NodeState[]      { return Array.from(this.nodeCache.values()) }

  private saveCache() {
    try {
      fs.writeFileSync(
        path.join(this.cacheDir, 'state.json'),
        JSON.stringify({
          nodes: Array.from(this.nodeCache.values()),
          packets: this.packetCache.slice(-200),
          verdicts: this.verdictCache.slice(-200)
        }, null, 2)
      )
    } catch {}
  }

  private loadCache() {
    try {
      const p = path.join(this.cacheDir, 'state.json')
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'))
        for (const n of (d.nodes || [])) this.nodeCache.set(n.nodeId, n)
        this.packetCache = d.packets || []
        this.verdictCache = d.verdicts || []
      }
    } catch {}
  }
}
