import { Node } from './Node'
import { ManifestPacket, PacketType } from './ManifestBuilder'
import { TokenEconomics } from '../token/TokenEconomics'
import * as fs from 'fs'
import * as path from 'path'
import { NODE_DIR } from './Node'

export interface Listing {
  manifest: ManifestPacket
  seller: string
  listed: number
  sold: boolean
  acquiredBy?: string
}

export class KnowledgeMarket {
  node: Node
  listings: Listing[] = []
  private tokenEconomics: TokenEconomics

  constructor(node: Node, tokenEconomics: TokenEconomics) {
    this.node = node
    this.tokenEconomics = tokenEconomics
    this.loadExisting()
  }

  private loadExisting() {
    const dir = path.join(NODE_DIR, 'public')
    if (!fs.existsSync(dir)) return
    fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        if (!this.listings.find(l => l.manifest.proof.hash === m.proof.hash)) {
          this.listings.push({ manifest: m, seller: m.header.node_id, listed: m.header.timestamp, sold: false })
        }
      } catch {}
    })
  }

  list(type: PacketType, description: string, price = 0, tags: string[] = [], metadata = {}): ManifestPacket {
    const m = this.node.offer(type, description, price, tags, metadata)
    this.listings.push({ manifest: m, seller: this.node.nodeId, listed: Date.now(), sold: false })
    return m
  }

  browse(filter?: { type?: PacketType; maxPrice?: number; tags?: string[] }): Listing[] {
    return this.listings.filter(l => {
      if (l.sold) return false
      if (filter?.type && l.manifest.payload.type !== filter.type) return false
      if (filter?.maxPrice !== undefined && l.manifest.payload.price > filter.maxPrice) return false
      if (filter?.tags?.length) {
        const has = filter.tags.some(t => l.manifest.payload.tags.includes(t))
        if (!has) return false
      }
      return true
    })
  }

  // Purchase a listing — transfers tokens from buyer to seller with economics split
  async purchase(listingHash: string, buyerNodeId: string): Promise<{ success: boolean; error?: string; txSig?: string }> {
    const listing = this.listings.find(l => l.manifest.proof.hash.startsWith(listingHash))
    if (!listing) return { success: false, error: 'Listing not found' }
    if (listing.sold) return { success: false, error: 'Already sold' }

    const price = listing.manifest.payload.price
    const sellerNodeId = listing.manifest.header.node_id

    // Check buyer has enough tokens
    const buyerBalance = this.tokenEconomics.getBalance(buyerNodeId)
    if (price > 0 && buyerBalance.balance < price) {
      return { success: false, error: `Insufficient balance: have ${buyerBalance.balance}, need ${price}` }
    }

    // Transfer with 90/5/5 economics split
    if (price > 0) {
      const ok = this.tokenEconomics.distribute(buyerNodeId, sellerNodeId, price)
      if (!ok) return { success: false, error: 'Token transfer failed' }
    }

    listing.sold = true
    listing.acquiredBy = buyerNodeId

    const txSig = `tx-${Date.now()}`
    this.node.log(`MARKET Purchase: ${buyerNodeId} bought [${listing.manifest.payload.type}] "${listing.manifest.payload.description}" for ${price} tokens`)
    return { success: true, txSig }
  }

  // Legacy method — kept for internal usage
  async acquire(listing: Listing, buyer: Node): Promise<{ success: boolean; txSig?: string }> {
    const result = await this.purchase(listing.manifest.proof.hash, buyer.nodeId)
    return { success: result.success, txSig: result.txSig }
  }

  stats() {
    const byType = this.listings.reduce((a, l) => {
      a[l.manifest.payload.type] = (a[l.manifest.payload.type] || 0) + 1
      return a
    }, {} as Record<string, number>)
    return { total: this.listings.length, available: this.listings.filter(l => !l.sold).length, byType }
  }
}
