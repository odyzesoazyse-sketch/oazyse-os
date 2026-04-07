import { Node } from '../core/Node'
import { PatternAgent } from './PatternAgent'
import { KnowledgeAgent, KnownPacket } from './KnowledgeAgent'
import { AgentSignal, AgentAction } from './BaseAgent'
import { LLMEngine } from './LLMEngine'
import { SessionMemory } from '../memory/SessionMemory'
import { LongTermMemory } from '../memory/LongTermMemory'

export interface OrchestratorInsight {
  timestamp: number
  signals: AgentSignal[]
  actions: AgentAction[]
  recommendation: string
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface UIPacket {
  type: 'html' | 'text' | 'clear' | 'error'
  content: string
  action?: string
}

export class Orchestrator {
  node: Node
  patternAgent: PatternAgent
  knowledgeAgent: KnowledgeAgent
  llmEngine: LLMEngine
  sessionMemory: SessionMemory
  longTermMemory: LongTermMemory
  insights: OrchestratorInsight[] = []
  intervalMs = 30000

  constructor(node: Node) {
    this.node = node
    this.patternAgent = new PatternAgent(node)
    this.knowledgeAgent = new KnowledgeAgent(node)
    this.llmEngine = new LLMEngine()
    this.sessionMemory = new SessionMemory()
    this.longTermMemory = new LongTermMemory()
    this.sessionMemory.startSession()
    console.log('[Orchestrator] Session memory and long-term memory initialized')
  }

  // Main analysis cycle — called periodically or on demand
  async analyze(input: {
    text?: string
    query?: string
    role?: 'user' | 'ai'
  }): Promise<OrchestratorInsight> {
    const allSignals: AgentSignal[] = []
    const allActions: AgentAction[] = []

    // Run all agents in parallel
    const [patternSignals, knowledgeSignals] = await Promise.all([
      Promise.resolve(this.patternAgent.analyze({ text: input.text || '', role: input.role })),
      Promise.resolve(this.knowledgeAgent.analyze({ query: input.query }))
    ])

    allSignals.push(...patternSignals, ...knowledgeSignals)

    // Get actions from each agent based on signals
    allActions.push(
      ...this.patternAgent.decide(patternSignals),
      ...this.knowledgeAgent.decide(knowledgeSignals)
    )

    // Synthesize recommendation
    const recommendation = this.synthesize(allSignals, allActions)

    const insight: OrchestratorInsight = {
      timestamp: Date.now(),
      signals: allSignals,
      actions: allActions,
      recommendation: recommendation.text,
      urgency: recommendation.urgency
    }

    this.insights.push(insight)

    // Persist to memory
    this.sessionMemory.addEvent('insight', { urgency: recommendation.urgency, recommendation: recommendation.text })
    if (recommendation.urgency === 'HIGH' || recommendation.urgency === 'CRITICAL') {
      this.longTermMemory.store(
        `insight-${Date.now()}`,
        { recommendation: recommendation.text, urgency: recommendation.urgency, signals: allSignals.length },
        'insights',
        recommendation.urgency === 'CRITICAL' ? 0.9 : 0.7
      )
    }

    return insight
  }

  private synthesize(signals: AgentSignal[], actions: AgentAction[]): {
    text: string
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  } {
    const criticalActions = actions.filter(a => a.priority === 'CRITICAL')
    const highActions = actions.filter(a => a.priority === 'HIGH')

    const knowledgeFound = signals.find(s => s.type === 'KNOWLEDGE_FOUND')
    const recurringTopics = signals.find(s => s.type === 'RECURRING_TOPICS')

    if (criticalActions.length > 0) {
      return { text: criticalActions[0].payload.message, urgency: 'CRITICAL' }
    }
    if (knowledgeFound && knowledgeFound.confidence > 0.8) {
      return { text: `High-confidence knowledge match found — recommend acquisition`, urgency: 'HIGH' }
    }
    if (recurringTopics) {
      return { text: `Recurring data patterns detected: ${recurringTopics.value.join(', ')}`, urgency: 'MEDIUM' }
    }
    if (highActions.length > 0) {
      return { text: highActions[0].payload.message || 'Continue current direction', urgency: 'HIGH' }
    }
    return { text: 'Network stable — monitoring data streams', urgency: 'LOW' }
  }

  getSessionSummary() {
    return {
      patterns: this.patternAgent.getSessionReport(),
      knowledge: this.knowledgeAgent.getStats(),
      totalInsights: this.insights.length,
      criticalMoments: this.insights.filter(i => i.urgency === 'CRITICAL').length,
      timeline: this.insights.map(i => ({
        time: new Date(i.timestamp).toISOString().slice(11, 19),
        urgency: i.urgency,
        recommendation: i.recommendation.slice(0, 60)
      }))
    }
  }

  async generateUI(command: string, currentHtml = ''): Promise<UIPacket> {
    const text = command.toLowerCase()

    if (text === 'clear') {
      return { type: 'clear', content: 'Cleared canvas', action: 'Cleared UI' }
    }

    if (text.includes('stats') || text.includes('status') || text.includes('node')) {
      const status = await this.node.getStatus()
      const html = `<div style="background:rgba(232,255,0,0.06);border:1px solid rgba(232,255,0,0.2);padding:20px;font-family:monospace;width:300px;border-radius:4px;backdrop-filter:blur(4px);box-shadow:0 0 20px rgba(0,0,0,0.5)">
        <div style="font-size:10px;letter-spacing:2px;color:rgba(232,255,0,0.5);margin-bottom:12px;display:flex;justify-content:space-between"><span>NODE STATUS</span><span style="color:#00FF88">● LIVE</span></div>
        <div style="font-size:14px;font-weight:bold;margin-bottom:12px;color:#00FF88">${this.node.nodeId}</div>
        <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(232,255,0,0.1);padding:4px 0;font-size:12px"><span>Peers</span><span>${status.peers}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>Offered</span><span>${status.offered}</span></div>
      </div>`
      return { type: 'html', content: html, action: 'Rendered Node Status' }
    }

    if (text.includes('market') || text.includes('store') || text.includes('network')) {
      const stats = this.knowledgeAgent.getStats()
      const packets = this.knowledgeAgent.getMarketPackets()
      
      const packetCards = packets.map(p => {
        const typeClass = p.type === 'VIBE' ? 't-vibe' : p.type === 'DATA' ? 't-data' : p.type === 'COMPUTE' ? 't-comp' : 't-ui';
        // For VIBE packets, we inject CSS. For UI/APP packets, we might want to just render them inline or handle differently later.
        // For now, if it's VIBE, we keep the hack. If UI, we might just display a mock install.
        const installAction = p.type === 'VIBE' ? p.content + ` this.querySelector('.btn-buy').innerText='INSTALLED';` : `this.querySelector('.btn-buy').innerText='OBTAINED';`;
        
        return `<div class="m-card" onclick="${installAction}">
            <span class="m-tag ${typeClass}">[${p.type}]</span>
            <div class="m-title">${p.title}</div>
            <div class="m-desc">${p.description}</div>
            <div class="m-price"><span>${p.price}</span> <button class="btn-buy">INSTALL</button></div>
          </div>`;
      }).join('');

      const html = `<div style="width:700px;background:rgba(10,10,10,0.8);border:1px solid rgba(170,136,255,0.3);padding:30px;font-family:monospace;border-radius:12px;backdrop-filter:blur(10px);box-shadow:0 0 40px rgba(170,136,255,0.15);animation:fadeIn 0.5s">
        <style>
          .m-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:20px; }
          .m-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:16px; border-radius:8px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden; }
          .m-card:hover { transform:translateY(-2px); border-color:#AA88FF; box-shadow:0 5px 15px rgba(170,136,255,0.1); }
          .m-tag { font-size:9px; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:8px; letter-spacing:1px; }
          .t-vibe { background:rgba(170,136,255,0.2); color:#AA88FF; }
          .t-data { background:rgba(0,255,136,0.2); color:#00FF88; }
          .t-comp { background:rgba(255,153,68,0.2); color:#FF9944; }
          .t-ui { background:rgba(255,0,136,0.2); color:#FF0088; }
          .m-title { font-size:14px; font-weight:bold; margin-bottom:6px; color:#fff; }
          .m-desc { font-size:11px; color:rgba(255,255,255,0.5); line-height:1.4; margin-bottom:12px; }
          .m-price { font-size:12px; font-weight:bold; color:#00FF88; display:flex; justify-content:space-between; align-items:center; }
          .btn-buy { background:transparent; border:1px solid #AA88FF; color:#AA88FF; padding:4px 12px; font-size:10px; border-radius:12px; transition:0.2s; }
          .m-card:hover .btn-buy { background:#AA88FF; color:#000; }
        </style>
        
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:16px">
          <div>
            <div style="font-size:10px;letter-spacing:4px;color:#AA88FF;margin-bottom:8px">ABUNDANCE NETWORK</div>
            <div style="font-size:28px;font-weight:300;letter-spacing:1px">Knowledge Market</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:bold;color:#00FF88">${packets.length}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.5)">PACKETS INDEXED</div>
          </div>
        </div>
        
        <div class="m-grid">
          ${packetCards}
        </div>
      </div>`
      return { type: 'html', content: html, action: 'Initialized Visual Network Marketplace' }
    }

    // GENERATIVE AI PATH
    // Build conversation context from session memory
    const recentEvents = this.sessionMemory.getCurrentSession()?.events.slice(-8) || []
    const prefs = this.longTermMemory.searchByCategory('preferences').slice(0, 3)
    const contextLines: string[] = []
    for (const ev of recentEvents) {
      if (ev.type === 'user_cmd') contextLines.push(`User: ${ev.data}`)
      else if (ev.type === 'ui_generated') contextLines.push(`OS rendered: ${ev.data.command}`)
    }
    if (prefs.length > 0) {
      contextLines.push(`User preferences: ${prefs.map(p => `${p.key}=${p.value}`).join(', ')}`)
    }
    // Build available capabilities context for the LLM
    let capsContext = ''
    try {
      const nodeStatus = await this.node.getStatus().catch(() => null)
      const peers = nodeStatus?.peers || 0
      const capsList = Object.values((this.node as any).capabilities?.getAll?.() || {})
        .map((c: any) => `${c.id}: ${c.description}`)
        .slice(0, 12)
      if(capsList.length) capsContext = `\n\nAvailable data sources: ${capsList.join(' | ')}`
      if(peers > 0) capsContext += `\nConnected peers: ${peers}`
    } catch {}

    const conversationContext = [
      contextLines.length > 0 ? `\nConversation history:\n${contextLines.join('\n')}` : '',
      capsContext
    ].filter(Boolean).join('\n')

    // Track this command in session
    this.sessionMemory.addEvent('user_cmd', command)

    // Persist theme/style preferences
    if (/dark|тёмн|black|noir/i.test(command)) this.longTermMemory.store('theme', 'dark', 'preferences', 0.8)
    else if (/light|светл|white/i.test(command)) this.longTermMemory.store('theme', 'light', 'preferences', 0.8)

    console.log(`[oazyse° os frame] Requesting generative UI for: "${command}"`);
    const generatedHtml = await this.llmEngine.generateWidget(command, conversationContext, currentHtml);

    // Save this newly generated interface to the local market so it can be shared!
    const packetId = 'ui-' + Math.random().toString(36).substr(2, 9);
    const newPacket: KnownPacket = {
      id: packetId,
      type: 'UI',
      title: command.substring(0, 20),
      description: 'Generative UI built on demand by AI Agent.',
      price: 'Free',
      author: this.node.nodeId,
      content: generatedHtml
    };
    this.knowledgeAgent.addMarketPacket(newPacket);

    // Track result in session
    const trimmed = generatedHtml.trimStart()
    const isHtml = trimmed.startsWith('<') || trimmed.startsWith('[FULLSCREEN]')
    this.sessionMemory.addEvent('ui_generated', { command, type: isHtml ? 'html' : 'text' })

    if (!isHtml) {
      return { type: 'text', content: generatedHtml, action: 'Agent dialogue' }
    }

    return {
      type: 'html',
      content: generatedHtml,
      action: `Generated: ${command}`
    }
  }
}
