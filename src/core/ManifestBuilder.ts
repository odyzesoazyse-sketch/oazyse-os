import * as nacl from 'tweetnacl'
import { Keypair, PublicKey } from '@solana/web3.js'
import * as crypto from 'crypto'

// ── PROTOCOL IDENTITY (immutable) ─────────────────────────────
// Every ManifestPacket carries the constitution hash.
// This makes every packet a proof that it belongs to the MESH network
// regardless of which blockchain or settlement layer is currently active.
export const PROTOCOL_CONSTITUTION_HASH = '12942e3a558089b2831cdbb8c094e8e2528017d94208c1374d2861ebab303945'
export const PROTOCOL_VERSION = '1.0-genesis'
export const CORE_INTENT = 'ABUNDANCE_FOR_ALL_LIFE'

export type PacketType =
  | 'GENESIS' | 'KNOWLEDGE' | 'COMPUTE' | 'SERVICE'
  | 'DATA' | 'VIBE' | 'ECO' | 'TASK' | 'RESULT'
  | 'AGENT' | 'COMPONENT' | 'JUDGE_RESULT' | 'CAPABILITY'

export interface ManifestPacket {
  header: {
    protocol: string
    version: string
    constitution_hash: string   // ← always PROTOCOL_CONSTITUTION_HASH
    creator_pubkey: string
    timestamp: number
    node_id: string
    settlement_layer?: string   // current layer name (optional, for migration tracking)
  }
  core_intent: string
  payload: {
    type: PacketType
    cid: string
    description: string
    price: number
    tags: string[]
    metadata: Record<string, any>
  }
  economics: {
    creator_share: number
    dao_share: number
    hoster_share: number
  }
  proof: {
    hash: string
    signature: string
    verified: boolean
  }
}

export class ManifestBuilder {
  static create(
    nodeId: string,
    keypair: Keypair,
    type: PacketType,
    description: string,
    price = 0,
    tags: string[] = [],
    metadata: Record<string, any> = {},
    cid = ''
  ): ManifestPacket {
    const base = {
      header: {
        protocol: 'mesh',
        version: PROTOCOL_VERSION,
        constitution_hash: PROTOCOL_CONSTITUTION_HASH,
        creator_pubkey: keypair.publicKey.toBase58(),
        timestamp: Date.now(),
        node_id: nodeId,
        settlement_layer: 'solana-devnet',
      },
      core_intent: CORE_INTENT,
      payload: {
        type,
        cid: cid || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description,
        price,
        tags,
        metadata
      },
      economics: { creator_share: 0.90, dao_share: 0.05, hoster_share: 0.05 }
    }

    const hash = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex')
    const message = Buffer.from(hash, 'hex')
    const sig = nacl.sign.detached(message, keypair.secretKey)
    const signature = Buffer.from(sig).toString('base64')

    return { ...base, proof: { hash, signature, verified: true } }
  }

  static verify(manifest: ManifestPacket): boolean {
    try {
      const { hash, signature } = manifest.proof

      // Step 1: Recalculate hash from the same base fields used in create()
      const base = {
        header: manifest.header,
        core_intent: manifest.core_intent,
        payload: manifest.payload,
        economics: manifest.economics
      }
      const recalcHash = crypto.createHash('sha256')
        .update(JSON.stringify(base))
        .digest('hex')

      if (recalcHash !== hash) return false

      // Step 2: Verify real NaCL ed25519 signature
      const message = Buffer.from(hash, 'hex')
      const sigBytes = Buffer.from(signature, 'base64')
      const pubKeyBytes = new PublicKey(manifest.header.creator_pubkey).toBytes()

      return nacl.sign.detached.verify(message, sigBytes, pubKeyBytes)
    } catch {
      return false
    }
  }

  /**
   * Verify a manifest belongs to the MESH protocol.
   * Works regardless of which settlement layer the packet was created on.
   */
  static isFromMeshProtocol(manifest: ManifestPacket): boolean {
    return manifest.header.protocol === 'mesh'
      && manifest.core_intent === CORE_INTENT
      && manifest.header.constitution_hash === PROTOCOL_CONSTITUTION_HASH
  }

  static toMemo(manifest: ManifestPacket): string {
    const cHash = manifest.header.constitution_hash?.slice(0, 8) || 'unknown'
    return `MESH/${manifest.header.version}|c=${cHash}|${manifest.payload.cid.slice(0, 12)}|${manifest.payload.type}|${manifest.payload.price}`
  }

  static summarize(manifest: ManifestPacket): string {
    return `[${manifest.payload.type}] "${manifest.payload.description}" @ ${manifest.payload.price} tokens`
  }
}
