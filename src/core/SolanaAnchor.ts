import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  Transaction, TransactionInstruction, sendAndConfirmTransaction
} from '@solana/web3.js'
import { ManifestPacket, ManifestBuilder } from './ManifestBuilder'

const DEFAULT_RPC = process.env.SOLANA_RPC_URL || 'https://devnet-rpc.solayer.org'
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export class SolanaAnchor {
  connection: Connection

  constructor() {
    this.connection = new Connection(DEFAULT_RPC, 'confirmed')
  }

  async fund(pubkey: PublicKey): Promise<boolean> {
    try {
      const sig = await this.connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL)
      await this.connection.confirmTransaction(sig, 'confirmed')
      return true
    } catch { return false }
  }

  async balance(pubkey: PublicKey): Promise<number> {
    try { return (await this.connection.getBalance(pubkey)) / LAMPORTS_PER_SOL }
    catch { return 0 }
  }

  async anchor(keypair: Keypair, memo: string): Promise<string> {
    const balance = await this.connection.getBalance(keypair.publicKey).catch(() => 0)
    if (balance < 5_000) {
      const sig = await this.connection.requestAirdrop(keypair.publicKey, Math.floor(0.02 * LAMPORTS_PER_SOL))
      await this.connection.confirmTransaction(sig, 'confirmed')
    }
    await new Promise(r => setTimeout(r, 2000))
    const ix = new TransactionInstruction({
      keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM,
      data: Buffer.from(memo.slice(0, 200), 'utf8')
    })
    return sendAndConfirmTransaction(
      this.connection, new Transaction().add(ix), [keypair],
      { commitment: 'confirmed' }
    )
  }

  async anchorManifest(keypair: Keypair, manifest: ManifestPacket): Promise<string> {
    return this.anchor(keypair, ManifestBuilder.toMemo(manifest))
  }

  async anchorGenesis(keypair: Keypair, nodeId: string): Promise<string> {
    return this.anchor(keypair, `oazyse|genesis|ABUNDANCE_FOR_ALL_LIFE|${nodeId}|2026`)
  }

  explorerUrl(sig: string): string {
    if (DEFAULT_RPC.includes('solayer')) return `https://explorer.solayer.org/tx/${sig}?cluster=devnet`
    return `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  }

  addressUrl(pubkey: string): string {
    if (DEFAULT_RPC.includes('solayer')) return `https://explorer.solayer.org/address/${pubkey}?cluster=devnet`
    return `https://explorer.solana.com/address/${pubkey}?cluster=devnet`
  }
}
