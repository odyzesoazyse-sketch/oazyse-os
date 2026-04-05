import * as fs from 'fs'
import * as path from 'path'
import { NODE_DIR } from '../core/Node'

export interface SessionData {
  id: string
  startTime: number
  endTime?: number
  events: { type: string; data: any; timestamp: number }[]
  summary?: string
}

export class SessionMemory {
  private sessions: SessionData[] = []
  private currentSession: SessionData | null = null
  private dataPath = path.join(NODE_DIR, 'memory', 'sessions.json')

  constructor() {
    this.load()
  }

  private load() {
    if (fs.existsSync(this.dataPath)) {
      this.sessions = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'))
    }
  }

  private save() {
    fs.writeFileSync(this.dataPath, JSON.stringify(this.sessions, null, 2))
  }

  startSession(): SessionData {
    this.currentSession = {
      id: `session-${Date.now()}`,
      startTime: Date.now(),
      events: []
    }
    return this.currentSession
  }

  addEvent(type: string, data: any) {
    if (this.currentSession) {
      this.currentSession.events.push({ type, data, timestamp: Date.now() })
    }
  }

  endSession(summary?: string): SessionData | null {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now()
      this.currentSession.summary = summary
      this.sessions.push(this.currentSession)
      this.save()
      const ended = this.currentSession
      this.currentSession = null
      return ended
    }
    return null
  }

  getRecentSessions(count = 5): SessionData[] {
    return this.sessions.slice(-count)
  }

  getCurrentSession(): SessionData | null {
    return this.currentSession
  }
}
