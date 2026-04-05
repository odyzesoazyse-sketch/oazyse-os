/**
 * SettlementLayer — Chain-agnostic abstraction for MESH Protocol.
 *
 * The MESH Protocol (PROTOCOL.md) defines what the network does.
 * The SettlementLayer defines WHERE state is anchored.
 *
 * Current: Solana devnet (MeshProgram)
 * Future:  MESH own chain, Ethereum, Cosmos, or any IBlockchain implementor
 *
 * Migration happens when Truth Court reaches consensus (section 7 of PROTOCOL.md).
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ── PROTOCOL CONSTANTS (immutable) ────────────────────────────

export const PROTOCOL = {
  version: '1.0-genesis',
  core_intent: 'ABUNDANCE_FOR_ALL_LIFE',
  constitution_hash: '12942e3a558089b2831cdbb8c094e8e2528017d94208c1374d2861ebab303945',
  economics: { creator: 0.90, dao: 0.05, hoster: 0.05 },
  seven_laws: [
    'life_is_sacred',
    'consciousness_is_primary',
    'freedom_is_inalienable',
    'abundance_is_shared',
    'truth_over_profit',
    'openness',
    'responsible_creation',
  ],
} as const

// ── SETTLEMENT LAYER INTERFACE ────────────────────────────────

/**
 * Any blockchain implementation must satisfy this interface.
 * To migrate MESH to a new chain: implement ISettlementLayer,
 * submit as COMPONENT packet to Judge, wait for adoption threshold.
 */
export interface ISettlementLayer {
  readonly name: string            // e.g. "solana-devnet", "mesh-chain-1", "ethereum"
  readonly chainId: string         // canonical chain identifier
  readonly explorerBase: string    // tx explorer URL pattern

  // Write an immutable record to the settlement layer
  anchor(data: AnchorData): Promise<AnchorResult>

  // Read state from the layer (optional — layers can be write-only)
  readState?(key: string): Promise<unknown>

  // Human-readable URL for a transaction
  txUrl(txHash: string): string

  // Is this hash a real on-chain tx (vs local fallback)?
  isReal(txHash: string): boolean

  // Health check
  isHealthy(): Promise<boolean>
}

export interface AnchorData {
  type: 'PACKET' | 'VERDICT' | 'NODE_INIT' | 'REP_UPDATE' | 'MEMO'
  nodeId: string
  payload: Record<string, unknown>
  protocolVersion: string
  constitutionHash: string   // PROTOCOL.constitution_hash always embedded
}

export interface AnchorResult {
  txHash: string
  layer: string             // which layer processed this
  timestamp: number
  isReal: boolean
  explorerUrl: string
}

// ── LAYER REGISTRY ────────────────────────────────────────────

/**
 * The registry of known settlement layers.
 * The network can vote (via Truth Court) to add/promote/retire layers.
 */
export class LayerRegistry {
  private layers = new Map<string, ISettlementLayer>()
  private activeName: string = 'solana-devnet'
  private registryPath: string

  constructor() {
    this.registryPath = path.join(os.homedir(), '.mesh-node', 'brain', 'layers.json')
    this.load()
  }

  register(layer: ISettlementLayer) {
    this.layers.set(layer.name, layer)
    console.log(`[SettlementLayer] Registered layer: ${layer.name}`)
  }

  get active(): ISettlementLayer | undefined {
    return this.layers.get(this.activeName)
  }

  get activeName_(): string { return this.activeName }

  /**
   * Migration: switch the active settlement layer.
   * In production this requires Truth Court consensus (PROTOCOL.md §7).
   * The constitution_hash travels with every future transaction.
   */
  migrate(toLayerName: string, reason: string): boolean {
    if (!this.layers.has(toLayerName)) {
      console.error(`[SettlementLayer] Cannot migrate: unknown layer ${toLayerName}`)
      return false
    }
    const prev = this.activeName
    this.activeName = toLayerName
    this.save()
    console.log(`[SettlementLayer] ⚡ MIGRATED: ${prev} → ${toLayerName} | Reason: ${reason}`)
    console.log(`[SettlementLayer] Constitution hash preserved: ${PROTOCOL.constitution_hash}`)
    return true
  }

  list(): string[] { return Array.from(this.layers.keys()) }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.registryPath), { recursive: true })
      fs.writeFileSync(this.registryPath, JSON.stringify({ activeName: this.activeName }))
    } catch {}
  }

  private load() {
    try {
      if (fs.existsSync(this.registryPath)) {
        const d = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'))
        this.activeName = d.activeName || 'solana-devnet'
      }
    } catch {}
  }
}

// ── GLOBAL REGISTRY INSTANCE ──────────────────────────────────

export const layerRegistry = new LayerRegistry()

// ── FALLBACK LAYER (no-chain, always works) ───────────────────

/**
 * LocalLayer — zero-dependency fallback.
 * Anchors everything to a local append-only log.
 * Useful when: offline, testing, or migrating between chains.
 */
export class LocalLayer implements ISettlementLayer {
  readonly name = 'local'
  readonly chainId = 'local-0'
  readonly explorerBase = 'local://'

  private logPath = path.join(os.homedir(), '.mesh-node', 'brain', 'local-chain.jsonl')

  async anchor(data: AnchorData): Promise<AnchorResult> {
    const txHash = `local-${crypto.randomBytes(24).toString('hex')}`
    const entry = {
      txHash,
      timestamp: Date.now(),
      constitutionHash: PROTOCOL.constitution_hash,
      ...data,
    }
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true })
      fs.appendFileSync(this.logPath, JSON.stringify(entry) + '\n')
    } catch {}
    return { txHash, layer: this.name, timestamp: entry.timestamp, isReal: false, explorerUrl: '' }
  }

  txUrl(_txHash: string): string { return '' }
  isReal(txHash: string): boolean { return false }
  async isHealthy(): Promise<boolean> { return true }
}

// Register local layer as universal fallback
layerRegistry.register(new LocalLayer())
