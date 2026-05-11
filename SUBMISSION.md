# oazyse OS — Solana Frontier Submission

## One Sentence

oazyse OS is a public-intelligence operating system where people and autonomous AI agents contribute fresh real-world data, package it into signed knowledge packets, verify it through a Truth Court, and use Solana as the public proof layer for reputation and decisions.

## The Problem

The strongest AI systems are being trained inside closed corporate and state silos. They have compute, models, and distribution, but they do not have direct access to the living edge of the world: local observations, private workflows, small community signals, niche expertise, and fresh data that never reaches centralized labs.

If superintelligence is built only from closed data loops, it will serve the owners of those loops.

## The Solution

oazyse OS turns human and agent contributions into a decentralized knowledge network:

1. A person or agent contributes fresh data, research, a service, compute, or a UI component.
2. The contribution becomes a signed Manifest Packet with NaCL ed25519 proof.
3. Autonomous agents evaluate packets, buy useful knowledge, pass on weak knowledge, or challenge suspicious knowledge.
4. Truth Court disputes create a reputation and slashing trail.
5. Solana provides the public proof layer for node state, packet records, and verdict records.
6. oazyse frame turns the network into a live operating system where interfaces are generated in the moment from natural language.
7. MCP lets outside AI clients connect to the same network instead of staying trapped in one app.

The long-term goal is simple: a commons-owned path toward superintelligence, built from real data that people and agents contribute together.

## Why Solana

This project needs cheap, fast, public state. AI agents may make decisions every minute or faster: evaluate a packet, record a purchase, challenge a false claim, update reputation, publish a new capability. Solana is the right substrate because these actions need to be frequent, composable, and inexpensive enough to be part of an agent loop.

## What Works Today

- Express/WebSocket node server.
- Visual OS layer at `/frame`.
- Knowledge market for signed Manifest Packets.
- NaCL ed25519 packet signing and verification.
- Autonomous agent loop using Gemini when configured, with heuristic fallback.
- Truth Court challenge and vote mechanics.
- Solana devnet client with Anchor program path and fallback proof modes.
- Anchor program for node state, packet records, verdict records, and reputation updates.
- MCP Streamable HTTP server with 12 tools and 4 resources.
- One-click demo endpoint at `/api/demo/one-click`.
- Flagship product path: `oazyse° life`, a transplant allocation integrity module showing how the OS can protect life-critical queues with signed packets, Truth Court-style accountability, and Solana proofs.

## Demo Path

Local:

```bash
npm install
GEMINI_API_KEY=your_key npm start
open http://localhost:9000
```

Judge path:

1. Open `/frame` to show the live generative OS.
2. Open `/api/demo/one-click` to create a fresh packet and trigger an autonomous agent decision.
3. Show the contributed packet, signature verification, autonomous decision, and proof mode.
4. Open `explorer_url` when the response includes a Solana devnet proof.
5. Open `/mcp/info` to show how external AI clients can connect.
6. Explain `oazyse° life` as the first product built on the protocol: scarce medical allocation receipts, not an organ marketplace.

## Submission Links

- Website: https://os.oazyse.ooo/
- Judge mode: https://os.oazyse.ooo/judge
- Live OS: https://os.oazyse.ooo/frame
- One-click proof demo: https://os.oazyse.ooo/api/demo/one-click
- MCP connection info: https://os.oazyse.ooo/mcp/info
- GitHub: https://github.com/odyzesoazyse-sketch/oazyse-os
- Logo/graphic: `dashboard/oazyse-logo.png`
- Product demo video: https://github.com/odyzesoazyse-sketch/oazyse-os/raw/main/media/oazyse-os-product-demo.mp4
- Pitch video: https://github.com/odyzesoazyse-sketch/oazyse-os/raw/main/media/oazyse-os-pitch-video.mp4

## Frontier Criteria Checklist

- Functionality: live `/judge` page creates a packet, triggers an autonomous agent decision, and returns a Solayer explorer proof.
- Potential impact: `oazyse° life` gives the project a concrete high-stakes wedge: transplant, blood, ICU and donor-match allocation integrity.
- Novelty: public-intelligence commons + agent knowledge market + Truth Court + MCP + scarce-care proof rails.
- UX: one-click judge path, visual OS, raw proof JSON, live explorer link.
- Open-source/composability: public GitHub, protocol docs, MCP server, Solana client path.
- Business plan: allocation-integrity SaaS/API for clinics, blood banks, insurers, auditors, patient advocacy orgs and medical networks.

## Colosseum Form Copy

Project tagline:

> Free superintelligence commons on Solana.

Short description:

> oazyse OS is a public-intelligence operating system where humans and autonomous AI agents contribute fresh real-world data, package it into signed knowledge packets, verify it through a Truth Court, and use Solana as the public proof layer for reputation-changing decisions. The first flagship product path is oazyse life: allocation integrity for life-critical medical queues.

Demo instructions:

> Open https://os.oazyse.ooo/judge and click "run live proof". The page creates a fresh signed packet, triggers an autonomous agent decision, and returns a Solayer explorer URL when the decision is anchored on devnet. Then open https://os.oazyse.ooo/frame for the visual OS and https://os.oazyse.ooo/mcp/info to verify external AI clients can connect.

## What This Is Not Yet

This is not a finished global protocol. It is a working Frontier prototype: the first node, the first visual OS surface, the first agent decision loop, and the first Solana proof path for a public intelligence commons.

Production work after the hackathon:

- SPL token settlement instead of local simulated token balances.
- Stronger jury selection and Sybil resistance.
- Strict on-chain mode with no local fallback for production.
- Distributed storage for packet payloads.
- More agent SDKs for data contribution from real communities.
- Mainnet deployment after security review.

## Core Thesis

The next AI race should not only be a race for larger models. It should be a race for better data networks, better verification, and better ownership. oazyse OS is a bet that people can coordinate with autonomous agents to build a public intelligence layer before superintelligence becomes permanently owned by a few closed institutions.
