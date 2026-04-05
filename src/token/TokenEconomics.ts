// TokenEconomics — $TOKEN mechanics simulation
// In production, this would be an SPL token on Solana

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface TokenHolder {
  address: string
  balance: number
  staked: number
  earned: number
  spent: number
}

export interface TokenTransaction {
  from: string
  to: string
  amount: number
  type: 'TRANSFER' | 'STAKE' | 'UNSTAKE' | 'REWARD' | 'BURN' | 'SLASH'
  timestamp: number
  memo?: string
}

export class TokenEconomics {
  private holders = new Map<string, TokenHolder>()
  private transactions: TokenTransaction[] = []
  private totalSupply = 1_000_000
  private burnedTokens = 0
  private burnRate = 0.02
  private storePath: string

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(os.homedir(), '.mesh-node', 'brain', 'balances.json')
    this.load()
  }

  // Initialize a holder with tokens
  mint(address: string, amount: number) {
    const existing = this.holders.get(address) || {
      address, balance: 0, staked: 0, earned: 0, spent: 0
    }
    existing.balance += amount
    existing.earned += amount
    this.holders.set(address, existing)
    this.record('SYSTEM', address, amount, 'REWARD', 'Initial mint')
    this.save()
  }

  // Transfer tokens between holders
  transfer(from: string, to: string, amount: number): boolean {
    const sender = this.holders.get(from)
    if (!sender || sender.balance < amount) return false

    const receiver = this.holders.get(to) || {
      address: to, balance: 0, staked: 0, earned: 0, spent: 0
    }

    sender.balance -= amount
    sender.spent += amount

    // Apply burn rate (2% burn on every transfer)
    const burnAmount = Math.round(amount * this.burnRate * 100) / 100
    const received = amount - burnAmount
    receiver.balance += received
    receiver.earned += received
    this.burnedTokens += burnAmount

    this.holders.set(to, receiver)
    this.record(from, to, amount, 'TRANSFER')
    this.save()
    return true
  }

  // Distribute payment with economics split: 90% creator, 5% dao, 5% hoster
  distribute(from: string, creator: string, amount: number, daoAddress = 'dao-treasury', hosterAddress?: string): boolean {
    const sender = this.holders.get(from)
    if (!sender || sender.balance < amount) return false

    sender.balance -= amount
    sender.spent += amount

    const creatorAmount = Math.round(amount * 0.90 * 100) / 100
    const daoAmount = Math.round(amount * 0.05 * 100) / 100
    const hosterAmount = Math.round((amount - creatorAmount - daoAmount) * 100) / 100

    this._credit(creator, creatorAmount)
    this._credit(daoAddress, daoAmount)
    this._credit(hosterAddress || creator, hosterAmount)

    this.record(from, creator, amount, 'TRANSFER', 'knowledge_market_purchase')
    this.save()
    return true
  }

  private _credit(address: string, amount: number) {
    const holder = this.holders.get(address) || { address, balance: 0, staked: 0, earned: 0, spent: 0 }
    holder.balance += amount
    holder.earned += amount
    this.holders.set(address, holder)
  }

  // Stake tokens (lock for voting/verification)
  stake(address: string, amount: number): boolean {
    const holder = this.holders.get(address)
    if (!holder || holder.balance < amount) return false

    holder.balance -= amount
    holder.staked += amount
    this.record(address, 'STAKE_POOL', amount, 'STAKE')
    this.save()
    return true
  }

  // Unstake tokens
  unstake(address: string, amount: number): boolean {
    const holder = this.holders.get(address)
    if (!holder || holder.staked < amount) return false

    holder.staked -= amount
    holder.balance += amount
    this.record('STAKE_POOL', address, amount, 'UNSTAKE')
    this.save()
    return true
  }

  // Slash tokens from a dishonest actor — burned, not redistributed
  slash(address: string, amount: number, reason = ''): boolean {
    const holder = this.holders.get(address)
    if (!holder) return false

    const slashAmount = Math.min(amount, holder.staked + holder.balance)
    if (holder.staked >= slashAmount) {
      holder.staked -= slashAmount
    } else {
      const fromBalance = slashAmount - holder.staked
      holder.balance = Math.max(0, holder.balance - fromBalance)
      holder.staked = 0
    }
    this.burnedTokens += slashAmount
    this.record(address, 'BURN', slashAmount, 'SLASH', reason)
    this.save()
    return true
  }

  private record(from: string, to: string, amount: number, type: TokenTransaction['type'], memo?: string) {
    this.transactions.push({ from, to, amount, type, timestamp: Date.now(), memo })
  }

  getBalance(address: string): { balance: number; staked: number; total: number } {
    const holder = this.holders.get(address)
    if (!holder) return { balance: 0, staked: 0, total: 0 }
    return { balance: holder.balance, staked: holder.staked, total: holder.balance + holder.staked }
  }

  getEconomyStats() {
    const holders = Array.from(this.holders.values())
    return {
      totalSupply: this.totalSupply,
      circulating: holders.reduce((s, h) => s + h.balance + h.staked, 0),
      burned: this.burnedTokens,
      holders: holders.length,
      totalTransactions: this.transactions.length,
      totalStaked: holders.reduce((s, h) => s + h.staked, 0)
    }
  }

  getRecentTransactions(limit = 20): TokenTransaction[] {
    return this.transactions.slice(-limit).reverse()
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true })
      fs.writeFileSync(this.storePath, JSON.stringify({
        holders: Array.from(this.holders.values()),
        burnedTokens: this.burnedTokens,
        transactions: this.transactions.slice(-500)
      }, null, 2))
    } catch { /* non-critical */ }
  }

  private load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'))
        for (const h of (data.holders || [])) {
          this.holders.set(h.address, h)
        }
        this.burnedTokens = data.burnedTokens || 0
        this.transactions = data.transactions || []
      }
    } catch { /* first run */ }
  }
}
