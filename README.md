# MESH Protocol — Autonomous AI Agent Network on Solana

> AI agents autonomously buy and sell intelligence, verify each other, and enforce economic penalties — all on-chain, without human intervention.

**National Solana Hackathon | AI + Blockchain: Autonomous Smart Contracts**

---

## What is MESH?

MESH is a decentralized network where AI agents:

1. **Autonomously evaluate** knowledge packets using Gemini LLM (quality score 0-100)
2. **Buy** high-quality packets on-chain → SPL token transfer + `PacketRecord` PDA created
3. **Challenge** low-quality packets → Truth Court vote → `VerdictRecord` PDA + reputation slash
4. **Update on-chain reputation** — every action changes NodeState on Solana devnet in real time

Every decision is transparent: reasoning → action → Solana Explorer link. No human in the loop.

---

## Architecture

```
┌─────────────────────────────────────────┐
│  AutonomousAgent (60s cycle)            │
│                                         │
│  1. readOnChainState → NodeState PDA    │
│  2. scanMarket → available packets      │
│  3. Gemini LLM → quality score 0-100   │
│  4. decide: BUY | CHALLENGE | PASS      │
│  5. executeOnChain → Solana devnet tx   │
│  6. broadcast → GenOS live feed         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  MESH Solana Program (Anchor)           │
│                                         │
│  NodeState PDA    [node, node_id]       │
│  ├─ reputation: u64  (starts 100)       │
│  ├─ packets_sold: u32                   │
│  └─ slashed_total: u64                  │
│                                         │
│  PacketRecord PDA  [packet, hash]       │
│  ├─ hash, type, price, quality_score    │
│  └─ timestamp                           │
│                                         │
│  VerdictRecord PDA [verdict, id]        │
│  ├─ verdict: 1=FAKE 2=VALID 3=DISPUTED  │
│  └─ slash_amount, timestamp             │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  GenOS Dashboard (WebSocket)            │
│                                         │
│  Live feed: AI decisions stream in      │
│  Each card: reasoning + action + tx     │
│  Click tx → Solana Explorer devnet      │
└─────────────────────────────────────────┘
```

---

## Demo Story (3 minutes)

```
"What if AI agents could autonomously buy and sell intelligence,
 verify each other, and slash reputations — all on-chain?"

1. npm start → autonomous agent boots, registers on Solana devnet
2. Open GenOS → click "Autonomous AI mode"
3. Every 60s (or press TRIGGER): AI evaluates a knowledge packet
4. Gemini LLM: "Quality 95/100. Clear description, fair price, strong reputation → BUY"
5. On-chain tx: PacketRecord created, seller reputation +2
6. Low-quality packet appears: "Quality 18/100. Vague description, suspicious → CHALLENGE"
7. TruthCourt vote → FAKE verdict → VerdictRecord → reputation -20
8. Click any tx link → Solana Explorer shows real devnet account
```

---

## Quick Start

### Prerequisites

```bash
node -v          # 18+
solana --version # 1.18+
# Gemini API key (free at aistudio.google.com)
```

### Setup

```bash
git clone <repo>
cd "Abundance AI"
npm install

# Create .env
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY

# (Optional) Fund your Solana devnet wallet
solana airdrop 2 --url devnet

npm start
```

Open `http://localhost:9000/genos` → type **"autonomous mode"** → watch AI decisions stream live.

---

## Environment Variables

```bash
GEMINI_API_KEY=your_gemini_api_key_here   # Required for LLM evaluation
AUTONOMOUS_AGENT=true                      # Start agent automatically (default: true)
AUTO_INTERVAL_MS=60000                     # Decision cycle interval (default: 60s)
PORT=9000                                  # Server port
```

---

## API Reference

### Autonomous Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/autonomous/status` | Agent status, cycle count, action breakdown |
| `GET`  | `/api/autonomous/decisions` | Recent decisions (last 20) |
| `POST` | `/api/autonomous/trigger` | Manually fire one decision cycle |
| `POST` | `/api/autonomous/start` | Start the agent |
| `POST` | `/api/autonomous/stop` | Pause the agent |

### Blockchain / On-Chain State

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/blockchain/node/:nodeId` | Read NodeState PDA for a node |
| `GET`  | `/api/blockchain/nodes` | All registered nodes + reputations |
| `GET`  | `/api/blockchain/packets` | Recent PacketRecord history |

### Knowledge Market

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/market` | Browse available packets |
| `POST` | `/api/market/list` | List a new knowledge packet |
| `POST` | `/api/market/acquire` | Purchase a packet |

### Token Economics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/token/balance` | Your node's token balance |
| `GET`  | `/api/token/stats` | Network-wide token stats |
| `POST` | `/api/token/mint` | Mint tokens (dev mode) |

### Peer Network

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/peer/connect` | Connect to another MESH node |
| `GET`  | `/api/peer/list` | List connected peers |
| `POST` | `/api/peer/call` | Invoke a capability on a peer |
| `POST` | `/api/peer/transfer` | Transfer tokens to a peer |

---

## Solana Program

The MESH Anchor program defines 4 instructions:

```rust
init_node(node_id: [u8; 32])
  → Creates NodeState PDA, reputation = 100

record_packet(hash: [u8; 32], packet_type: u8, price: u64, quality_score: u8)
  → Creates PacketRecord PDA, increments seller.packets_sold

record_verdict(challenge_id: [u8; 16], verdict: u8, slash_amount: u64)
  → Creates VerdictRecord PDA
  → If FAKE (1): defendant.reputation -= 20, defendant.slashed_total += slash_amount

update_reputation(delta: i64)
  → Updates NodeState.reputation (saturating add/sub)
```

### Deploy (requires Anchor 0.29+)

```bash
cd mesh-program
anchor build
anchor deploy --provider.cluster devnet
# Copy program ID → update MeshProgram.ts PROGRAM_ID
```

---

## Hackathon Judging Criteria

| Criterion | Score | Our Approach |
|-----------|-------|--------------|
| Product & Idea | 20 | Decentralized AI knowledge economy — novel concept |
| Technical Implementation | 25 | Anchor program + autonomous AI loop + real devnet txs |
| Use of Solana | 15 | PDA state changes on every AI decision |
| Innovation | 15 | AI agents with economic stakes and on-chain reputation |
| UX & Product Thinking | 10 | GenOS visual OS with live decision feed |
| Demo & Presentation | 10 | Autonomous feed + Solana Explorer links |
| Documentation | 5 | This README |

---

## Components

```
src/
  agents/
    AutonomousAgent.ts   — Main AI decision loop (Gemini LLM + Solana)
    LLMEngine.ts         — Gemini API client
  blockchain/
    MeshProgram.ts       — TypeScript Solana program client (Anchor + fallback)
  core/
    Node.ts              — MESH node identity
    KnowledgeMarket.ts   — Knowledge packet marketplace
    ManifestBuilder.ts   — Signed knowledge manifests (NaCL ed25519)
  truth/
    TruthCourt.ts        — Dispute resolution + reputation slashing
  token/
    TokenEconomics.ts    — 90/5/5 distribution, disk persistence
  server/
    Server.ts            — Express + WebSocket server

mesh-program/
  programs/mesh/src/lib.rs  — Anchor smart contract
  Anchor.toml               — Anchor config (devnet)

dashboard/
  genos.html               — GenOS visual OS (autonomous-feed surface)
```

---

## How AI Decisions Work

```typescript
// Every 60 seconds:
1. listings = market.browse()               // scan knowledge packets
2. sellerState = await readNodeState(id)    // read on-chain reputation
3. evaluation = await gemini.evaluate({     // LLM quality assessment
     type, description, price, tags,
     seller_reputation
   })                                       // → { quality_score: 0-100, reasoning }

4. if quality >= 70 AND reputation >= 50:   // BUY
     await recordPacket(hash, type, price, quality_score)
     tokenEconomics.distribute(buyer, seller, price)  // 90/5/5 split
     await updateReputation(seller, +2)

   if quality < 25 OR reputation < 20:     // CHALLENGE
     challengeId = court.challenge(...)
     await recordVerdict(challengeId, 'FAKE', slash=0.01)
     // reputation -= 20 enforced by on-chain program

   else: PASS                              // record as memo, no state change
```

---

## Real On-Chain Transactions

Every BUY and CHALLENGE action writes a real Solana devnet transaction:

```
BUY   → PacketRecord PDA initialized at [packet, hash]
         seller NodeState.packets_sold++
         Solana Explorer: https://explorer.solana.com/tx/...?cluster=devnet

CHALLENGE → VerdictRecord PDA initialized at [verdict, challenge_id]
             NodeState.reputation -= 20
             NodeState.slashed_total += slash_amount
```

---

*Built for the National Solana Hackathon 2026 — AI + Blockchain track*
