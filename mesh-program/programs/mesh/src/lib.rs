use anchor_lang::prelude::*;

declare_id!("8tBwhuAj5A9KfMX1i5hg5QYmkxke7BUN4iH9JD6JMnRc");

#[program]
pub mod mesh {
    use super::*;

    /// Initialize a node's on-chain state (reputation, counters)
    pub fn init_node(ctx: Context<InitNode>, node_id: [u8; 32]) -> Result<()> {
        let state = &mut ctx.accounts.node_state;
        state.node_id = node_id;
        state.reputation = 100;
        state.packets_sold = 0;
        state.slashed_total = 0;
        state.authority = ctx.accounts.authority.key();
        state.bump = ctx.bumps.node_state;
        emit!(NodeInitialized {
            node_id,
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    /// Record a knowledge packet purchase on-chain
    pub fn record_packet(
        ctx: Context<RecordPacket>,
        hash: [u8; 32],
        packet_type: u8,
        price: u64,
        quality_score: u8,
    ) -> Result<()> {
        let record = &mut ctx.accounts.packet_record;
        record.hash = hash;
        record.packet_type = packet_type;
        record.price = price;
        record.seller = ctx.accounts.seller_state.key();
        record.quality_score = quality_score;
        record.timestamp = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.packet_record;

        // Increment seller's packet count
        let seller_state = &mut ctx.accounts.seller_state;
        seller_state.packets_sold = seller_state.packets_sold.saturating_add(1);

        emit!(PacketRecorded {
            hash,
            price,
            quality_score,
            seller: ctx.accounts.seller_state.authority,
        });
        Ok(())
    }

    /// Record a Truth Court verdict on-chain — immutable proof
    pub fn record_verdict(
        ctx: Context<RecordVerdict>,
        challenge_id: [u8; 16],
        verdict: u8,   // 1=FAKE, 2=VALID, 3=DISPUTED
        slash_amount: u64,
    ) -> Result<()> {
        let verdict_record = &mut ctx.accounts.verdict_record;
        verdict_record.challenge_id = challenge_id;
        verdict_record.defendant = ctx.accounts.defendant_state.authority;
        verdict_record.verdict = verdict;
        verdict_record.slash_amount = slash_amount;
        verdict_record.timestamp = Clock::get()?.unix_timestamp;
        verdict_record.bump = ctx.bumps.verdict_record;

        // Apply reputation penalty for FAKE verdict
        if verdict == 1 {
            let defendant = &mut ctx.accounts.defendant_state;
            defendant.reputation = defendant.reputation.saturating_sub(20);
            defendant.slashed_total = defendant.slashed_total.saturating_add(slash_amount);
        }

        emit!(VerdictRecorded {
            challenge_id,
            verdict,
            defendant: ctx.accounts.defendant_state.authority,
            slash_amount,
        });
        Ok(())
    }

    /// Update a node's reputation (positive or negative delta)
    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        delta: i64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.node_state;
        if delta >= 0 {
            state.reputation = state.reputation.saturating_add(delta as u64);
        } else {
            state.reputation = state.reputation.saturating_sub((-delta) as u64);
        }
        Ok(())
    }
}

// ── ACCOUNTS ─────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(node_id: [u8; 32])]
pub struct InitNode<'info> {
    #[account(
        init,
        payer = authority,
        space = NodeState::LEN,
        seeds = [b"node", node_id.as_ref()],
        bump
    )]
    pub node_state: Account<'info, NodeState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct RecordPacket<'info> {
    #[account(
        init,
        payer = authority,
        space = PacketRecord::LEN,
        seeds = [b"packet", hash.as_ref()],
        bump
    )]
    pub packet_record: Account<'info, PacketRecord>,
    #[account(mut, seeds = [b"node", seller_state.node_id.as_ref()], bump = seller_state.bump)]
    pub seller_state: Account<'info, NodeState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(challenge_id: [u8; 16])]
pub struct RecordVerdict<'info> {
    #[account(
        init,
        payer = authority,
        space = VerdictRecord::LEN,
        seeds = [b"verdict", challenge_id.as_ref()],
        bump
    )]
    pub verdict_record: Account<'info, VerdictRecord>,
    #[account(mut, seeds = [b"node", defendant_state.node_id.as_ref()], bump = defendant_state.bump)]
    pub defendant_state: Account<'info, NodeState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(mut, seeds = [b"node", node_state.node_id.as_ref()], bump = node_state.bump)]
    pub node_state: Account<'info, NodeState>,
    pub authority: Signer<'info>,
}

// ── STATE STRUCTS ─────────────────────────────────────────────

#[account]
pub struct NodeState {
    pub node_id: [u8; 32],
    pub reputation: u64,
    pub packets_sold: u32,
    pub slashed_total: u64,
    pub authority: Pubkey,
    pub bump: u8,
}

impl NodeState {
    pub const LEN: usize = 8 + 32 + 8 + 4 + 8 + 32 + 1 + 64;
}

#[account]
pub struct PacketRecord {
    pub hash: [u8; 32],
    pub packet_type: u8,
    pub price: u64,
    pub seller: Pubkey,
    pub quality_score: u8,
    pub timestamp: i64,
    pub bump: u8,
}

impl PacketRecord {
    pub const LEN: usize = 8 + 32 + 1 + 8 + 32 + 1 + 8 + 1 + 32;
}

#[account]
pub struct VerdictRecord {
    pub challenge_id: [u8; 16],
    pub defendant: Pubkey,
    pub verdict: u8,
    pub slash_amount: u64,
    pub timestamp: i64,
    pub bump: u8,
}

impl VerdictRecord {
    pub const LEN: usize = 8 + 16 + 32 + 1 + 8 + 8 + 1 + 32;
}

// ── EVENTS ────────────────────────────────────────────────────

#[event]
pub struct NodeInitialized {
    pub node_id: [u8; 32],
    pub authority: Pubkey,
}

#[event]
pub struct PacketRecorded {
    pub hash: [u8; 32],
    pub price: u64,
    pub quality_score: u8,
    pub seller: Pubkey,
}

#[event]
pub struct VerdictRecorded {
    pub challenge_id: [u8; 16],
    pub verdict: u8,
    pub defendant: Pubkey,
    pub slash_amount: u64,
}
