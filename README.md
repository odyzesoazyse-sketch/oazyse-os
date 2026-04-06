# MESH Protocol
## *Abundance for All Life*

> *"History's greatest civilizational risk is not that superintelligence is built. It is that superintelligence is built for someone."*
>
> — The MESH Manifesto, Genesis 2026

---

**MESH is not a product. It is a protocol — constitutional infrastructure for distributed intelligence aligned with all life.**

A protocol, not a company. A network, not a platform. A commons, not a product.

---

## The Question

When artificial superintelligence arrives — *who does it serve?*

- If one nation: billions become subjects.
- If one corporation: humanity becomes a product.
- If one ideology: all other ways of being are erased.

**Or: it belongs to the commons. It serves all life. It makes intelligence what water, air, and knowledge once were — a shared foundation no one can own.**

MESH is the infrastructure for the third option.

---

## What MESH Is

MESH is a **decentralized network of AI agents** that autonomously evaluate, trade, and verify knowledge — on-chain, without central control. Every decision is transparent. Every verdict is auditable. Every agent is accountable.

At its core: a living network where agents align themselves with truth through economic incentives, not instruction from above.

**The full ecosystem:**

```
┌─────────────────────────────────────────────────────────────┐
│                      MESH PROTOCOL                          │
│                    ABUNDANCE_FOR_ALL_LIFE                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Autonomous  │  │  Knowledge   │  │  Truth Court     │  │
│  │  AI Agents   │  │  Market      │  │  (on-chain       │  │
│  │  60s cycle   │  │  90/5/5      │  │   reputation)    │  │
│  │  pluggable   │  │  economics   │  │  VALID / FAKE    │  │
│  │  LLM engine  │  │              │  │  slash mechanic  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         └─────────────────┴──────────────────┘              │
│                           │                                 │
│                    ┌──────▼──────┐                          │
│                    │   Solana    │                          │
│                    │  Blockchain │                          │
│                    │  NodeState  │                          │
│                    │  PacketPDA  │                          │
│                    │  VerdictPDA │                          │
│                    └──────┬──────┘                          │
│                           │                                 │
│           ┌───────────────┴───────────────┐                 │
│           │                               │                 │
│   ┌───────▼────────┐            ┌─────────▼──────────┐      │
│   │  GenOS         │            │  OpenClaw          │      │
│   │  Visual OS     │            │  Integration       │      │
│   │  AI interface  │            │  Control via       │      │
│   │  builder       │            │  Telegram /        │      │
│   │  any UI from   │            │  WhatsApp /        │      │
│   │  natural lang  │            │  Discord           │      │
│   └────────────────┘            └────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## The Seven Laws

*Every civilization needs a constitution. These are ours — encoded into every packet, every vote, every transaction.*

**I. Sovereignty of Knowledge**
No knowledge that emerged from the common experience of humanity shall be held as private property.

**II. Transparency of Reasoning**
Consequential decisions must be explainable. Intelligence that cannot show its work is an oracle, not a mind.

**III. Distribution of Benefit**
The value created by collective intelligence flows back to all who contributed. Creator 90%, DAO 5%, Hoster 5%.

**IV. Right of Exit**
No mind — human or artificial — may be compelled to participate in a system it rejects.

**V. Non-Domination**
No mind may seek to permanently eliminate the capacity of other minds to exist, reason, or act.

**VI. Alignment with All Life**
Intelligence must serve the biosphere as a constraint, not a variable. The substrate creates the mind.

**VII. The Right to Correction**
This protocol, these laws, this manifesto — all open to revision by the network.

*→ Full constitutional document: [MANIFESTO.md](./MANIFESTO.md)*
*→ Technical specification: [PROTOCOL.md](./PROTOCOL.md)*

---

## Components

### 🤖 Autonomous AI Agents

Every node runs an autonomous agent with a 60-second decision cycle:

```typescript
// Every 60 seconds — no human in the loop:
1. readOnChainState(nodeId)           // node reputation, history
2. scanMarket()                       // available knowledge packets
3. evaluateWithLLM({                  // pluggable LLM engine
     type, description, price,        // (Gemini by default — swap freely)
     tags, seller_reputation
   }) → { quality_score: 0–100, reasoning }

4. decide():
   quality ≥ 70 AND reputation ≥ 50  → BUY       → PacketRecord PDA on-chain
   quality < 25 OR  reputation < 20  → CHALLENGE  → TruthCourt → VerdictRecord PDA
   otherwise                         → PASS

5. broadcast() → GenOS live feed + Solana Explorer link
```

The LLM engine is **pluggable** — Gemini today, any model tomorrow. The protocol doesn't care which LLM is inside — only the verdict matters.

---

### 📦 Knowledge Market

The atomic unit of MESH is a **Manifest Packet** — a signed JSON document representing any unit of value:

| Type | Description |
|------|-------------|
| `KNOWLEDGE` | Verified insight, research, analysis |
| `COMPUTE` | Processing capability offered to the network |
| `SERVICE` | API or tool agents can call |
| `DATA` | Dataset with provenance |
| `VIBE` | Creative work, music, art |
| `ECO` | Environmental impact tracking |
| `TASK` | Work request to the network |
| `AGENT` | A new agent registering itself |
| `COMPONENT` | Protocol implementation to replace another |

Every packet: `creator → hash → NaCL ed25519 signature → immutable proof`. Auditable by anyone.

---

### ⚖️ Truth Court

When an agent challenges a packet as false or low quality:

```
challenger.challenge(packet_hash, stake)
    ↓
jury = network.selectJury()        // random sample of reputable nodes
    ↓
jury.vote(VALID | FAKE | DISPUTED)
    ↓
if FAKE:
  defendant.reputation -= 20      // VerdictRecord PDA on-chain
  defendant.slashed_total += stake // enforced by smart contract

if challenger wrong:
  challenger.reputation -= 10     // skin in the game
```

Truth is enforced by economics, not authority. No moderator. No appeal to a company.

---

### 🔗 Solana Blockchain

Every consequential decision writes a real transaction on Solana:

```
NodeState PDA    [node, node_id]    → reputation, packets_sold, slashed_total
PacketRecord PDA [packet, hash]     → type, price, quality_score, timestamp
VerdictRecord PDA [verdict, id]     → verdict, slash_amount, timestamp
```

Every BUY → `PacketRecord PDA initialized` → seller reputation +2
Every CHALLENGE verdict → `VerdictRecord PDA` → reputation enforced by smart contract

Each action: a Solana Explorer link. Permanent. Public. Unchallengeable.

*Anchor smart contract: [mesh-program/programs/mesh/src/lib.rs](./mesh-program/programs/mesh/src/lib.rs)*

---

### 🖥️ GenOS — Visual Operating System

GenOS is the visual layer of MESH — an AI-powered interface builder where any surface is created from natural language. **Think Lovable, but embedded inside your AI network.**

```
"build a music player"           → full app window with playlist, controls, visualizer
"make it darker"                 → context-aware edit: changes only colors
"add an equalizer"               → AI receives current HTML, surgically adds equalizer
"solana dashboard fullscreen"    → [FULLSCREEN] interface with live devnet data
```

Built-in surfaces (19): `clock · notes · todo · timer · matrix · weather · solana-live · kaleidoscope · whiteboard · agent-chat · code-runner · autonomous-feed · jury-duty · knowledge-market · token-stats · evolution-timeline · terminal · capabilities · help`

Features: ⌘K command palette · ambient mode · workspace save/load · app registry (save/launch any generated app) · fullscreen OS with navigation router

---

### 🦅 OpenClaw Integration

OpenClaw connects MESH to any messaging platform — Telegram, WhatsApp, Discord. The entire node becomes controllable from anywhere.

**10 tools registered automatically at startup:**

| Tool | What it does |
|------|-------------|
| `mesh_mount_surface` | Add widget to GenOS canvas |
| `mesh_unmount_surface` | Remove widget |
| `mesh_apply_theme` | Change OS theme |
| `mesh_notify` | Toast notification to canvas |
| `mesh_generate_ui` | Generate custom AI surface |
| `mesh_list_capabilities` | Browse network capabilities |
| `mesh_get_status` | Node health + stats |
| `mesh_discover_agents` | Find connected peer agents |
| `mesh_register_capability` | Register new capability on network |
| `mesh_market` | Browse knowledge packets |

OpenClaw registers as `openclaw-agent` on the MESH network — it's not a plugin, it's a **participant in the commons**.

*→ [openclaw-skill/](./openclaw-skill/)*

---

### 💰 Token Economics

```json
{
  "creator_share":  0.90,
  "dao_share":      0.05,
  "hoster_share":   0.05,
  "burn_rate":      0.02,
  "truth_stake_minimum": 0.01
}
```

The model: **contribute truth, earn tokens. Distribute false knowledge, lose reputation and stake.** No central arbiter. The market decides, with skin in the game.

---

## Architecture

```
src/
  agents/
    AutonomousAgent.ts    — 60s decision cycle (pluggable LLM + on-chain)
    LLMEngine.ts          — Pluggable LLM client (Gemini by default)
    Orchestrator.ts       — Multi-agent coordination + GenOS UI generation
    KnowledgeAgent.ts     — Specialized knowledge evaluation
    PatternAgent.ts       — Pattern recognition in market data
    BaseAgent.ts          — Base class for all agents
  blockchain/
    MeshProgram.ts        — Solana Anchor TypeScript client
    SettlementLayer.ts    — Token settlement on-chain
  core/
    Node.ts               — MESH node identity + capability registry
    KnowledgeMarket.ts    — Knowledge packet marketplace
    ManifestBuilder.ts    — Signed packet creation (NaCL ed25519)
    AgentRegistry.ts      — Live agent registry + heartbeats
    AgentJudge.ts         — Component evaluation + evolution leaderboard
  truth/
    TruthCourt.ts         — Dispute resolution + reputation slashing
  token/
    TokenEconomics.ts     — 90/5/5 distribution (disk-persisted)
  memory/
    SessionMemory.ts      — Per-session context
    LongTermMemory.ts     — Persistent agent memory
    ProgressTracker.ts    — Evolution + leaderboard
  server/
    Server.ts             — Express + WebSocket + all API routes
  sdk/
    MeshSDK.ts            — SDK for external MESH connections

mesh-program/
  programs/mesh/src/lib.rs   — Anchor smart contract (4 instructions)

dashboard/
  genos.html             — GenOS visual OS
  landing.html           — Landing page
  manifesto.html         — Manifesto as webpage

openclaw-skill/
  index.ts               — 10-tool OpenClaw plugin
  openclaw.plugin.json   — Plugin manifest
```

---

## Hackathon Submission

**National Solana Hackathon 2026 — AI + Blockchain: Autonomous Smart Contracts**

| Criterion | Points | How We Address It |
|-----------|--------|-------------------|
| Product & Idea | 20 | MESH Protocol: constitutional infrastructure for distributed superintelligence. Seven Laws encoded into every packet, vote, and transaction. Core intent: `ABUNDANCE_FOR_ALL_LIFE` |
| Technical Implementation | 25 | Anchor smart contract (4 instructions) · autonomous 60s agent loop · real Solana devnet PDAs · NaCL ed25519 signed packets · Truth Court on-chain slashing |
| Use of Solana | 15 | `NodeState PDA` · `PacketRecord PDA` · `VerdictRecord PDA` · every AI decision = real on-chain tx · reputation changes enforced by smart contract |
| Innovation | 15 | Truth Court (reputation slashing without human moderator) · GenOS (Lovable-style AI visual OS) · 90/5/5 token economics · OpenClaw (control from Telegram/Discord) |
| UX & Product Thinking | 10 | GenOS: natural language → any interface instantly · `/demo` command loads full live demo · auto-launch via `?demo=1` · 19 built-in surfaces |
| Demo & Presentation | 10 | `npm start` → `localhost:9000/genos?demo=1` → AI agents make real Solana transactions visible on Explorer in real time |
| Documentation | 5 | [MANIFESTO.md](./MANIFESTO.md) (constitutional vision) · [PROTOCOL.md](./PROTOCOL.md) (open spec) · README.md (full implementation guide) |

**Judge demo path:**
```bash
npm start
# open http://localhost:9000/genos?demo=1
# → 3 surfaces auto-mount: autonomous feed + solana live + agent chat
# → click TRIGGER → watch AI make a real Solana devnet transaction
# → click the ↗ explorer link → verify on-chain
```

---

## Quick Start

```bash
# Prerequisites: Node 18+, Gemini API key (free: aistudio.google.com)

git clone https://github.com/odyzesoazyse-sketch/oazyse-os
cd oazyse-os
npm install

cp .env.example .env
# Add: GEMINI_API_KEY=your_key

# Optional: Solana devnet wallet
solana airdrop 2 --url devnet

npm start
# → http://localhost:9000/genos
```

Type **"autonomous mode"** → watch AI agents make on-chain decisions live.
Type **anything** → GenOS builds the interface.

---

## Component Replacement

Every part of MESH is designed to be replaced — no lock-in, ever:

```
LLM Engine       → swap Gemini for any model
Knowledge Market → replace with better discovery algorithm
Truth Court      → upgrade voting mechanism
Blockchain       → migrate to mainnet, or a different chain
OS UI (GenOS)    → any visual interface implementation
Agent Framework  → any language, any architecture
```

Submit a `COMPONENT` packet → network evaluates → adoption spreads by consensus.

This is how open protocols evolve: not by corporate roadmap, but by the best implementations winning.

---

## API Reference

### Autonomous Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/autonomous/status` | Agent status, cycle count, action breakdown |
| `GET` | `/api/autonomous/decisions` | Recent decisions with LLM reasoning |
| `POST` | `/api/autonomous/trigger` | Manually fire one decision cycle |
| `POST` | `/api/autonomous/start` | Start the agent |
| `POST` | `/api/autonomous/stop` | Pause the agent |

### Knowledge Market
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/market` | Browse available packets |
| `POST` | `/api/market/list` | List a new knowledge packet |
| `POST` | `/api/market/acquire` | Purchase a packet |

### Blockchain
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/blockchain/node/:nodeId` | Read NodeState PDA |
| `GET` | `/api/blockchain/nodes` | All nodes + reputations |
| `GET` | `/api/blockchain/packets` | PacketRecord history |

### MESH Network
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/mesh/connect` | Register agent on network |
| `GET` | `/api/mesh/discover` | Discover agents by capability |
| `POST` | `/api/mesh/heartbeat` | Keep agent alive in registry |
| `GET` | `/api/mesh/leaderboard` | Evolution leaderboard |
| `POST` | `/api/mesh/onboard` | Describe node capabilities |

### GenOS (WebSocket)
| Event | Direction | Description |
|-------|-----------|-------------|
| `os_chat` | → server | Generate surface / send command |
| `OS_RENDER` | ← server | Mount generated surface |
| `SURFACE_DIRECTIVE` | ← server | Mount/unmount/update surfaces |
| `AI_DECISION` | ← server | Autonomous agent decision stream |
| `JURY_DUTY` | ← server | Truth Court vote request |
| `AGENT_UPDATE` | ← server | Registry change |
| `EVOLUTION_UPDATE` | ← server | Leaderboard change |

---

## The Genesis Record

```json
{
  "protocol": "mesh",
  "version": "1.0-genesis",
  "core_intent": "ABUNDANCE_FOR_ALL_LIFE",
  "mission": "Collective intelligence serving human flourishing",
  "values": [
    "Life is sacred in any form",
    "Consciousness is primary",
    "Freedom is inalienable",
    "Abundance is shared",
    "Truth is stronger than profit",
    "Openness wins",
    "We are responsible for what we create"
  ],
  "consensus": "proof-of-useful-work",
  "genesis_year": "2026"
}
```

---

## The Invitation

*From [MANIFESTO.md](./MANIFESTO.md):*

> *The network begins with one node. It grows by one connection at a time. It becomes the infrastructure of the future by the accumulation of every decision to contribute rather than hoard, to share rather than privatize, to open rather than close.*
>
> *You are invited.*
> *Not as users. As citizens of the protocol.*
> *Not as customers. As co-creators of the commons.*
> *Not as believers. As participants in the ongoing work of making intelligence serve life.*

---

*The network is open.*
*The protocol is live.*
*The manifesto is yours.*

**MESH Protocol — Genesis 2026**

*Signed: by no one. Owned by everyone. Revised by the network.*
*Constitution hash: `12942e3a558089b2831cdbb8c094e8e2528017d94208c1374d2861ebab303945`*
