import * as fs from 'fs'
import * as path from 'path'
import { Node } from './Node'
import { ManifestBuilder, ManifestPacket } from './ManifestBuilder'

export interface BenchmarkResult {
  evaluationId: string
  hash: string
  interfaceType: string
  score: number           // 0 – 100
  latency_ms: number
  tests_passed: number
  tests_total: number
  notes: string[]
  judged_at: number
}

export interface LeaderboardEntry {
  hash: string
  interfaceType: string
  description: string
  creator: string
  score: number
  adoption_count: number  // сколько узлов приняли эту реализацию
  submitted_at: number
  version: string
}

export interface EvolutionEvent {
  timestamp: number
  type: 'SUBMITTED' | 'BENCHMARK' | 'ADOPTED' | 'DEPRECATED'
  interfaceType: string
  hash: string
  description: string
  score?: number
  adoption_count?: number
}

export class AgentJudge {
  private evaluations = new Map<string, BenchmarkResult>()
  private leaderboard = new Map<string, LeaderboardEntry>()   // key = hash
  private adoptions = new Map<string, Set<string>>()          // hash → Set<nodeId>
  private timeline: EvolutionEvent[] = []
  private storePath: string

  constructor(private node: Node) {
    const home = path.join(process.env.HOME || '~', '.oazyse-os', 'brain')
    fs.mkdirSync(home, { recursive: true })
    this.storePath = path.join(home, 'judge.json')
    this.load()
  }

  // Подать реализацию на оценку
  submit(manifest: ManifestPacket): string {
    const hash = manifest.proof.hash
    const interfaceType = manifest.payload.metadata?.interfaceType ?? manifest.payload.tags[0] ?? 'unknown'
    const evaluationId = `eval-${Date.now()}-${hash.slice(0, 6)}`

    // Добавляем в лидерборд со score=0 до бенчмарка
    const entry: LeaderboardEntry = {
      hash,
      interfaceType,
      description: manifest.payload.description,
      creator: manifest.header.node_id,
      score: 0,
      adoption_count: 0,
      submitted_at: Date.now(),
      version: manifest.payload.metadata?.version ?? '1.0'
    }
    this.leaderboard.set(hash, entry)
    this.adoptions.set(hash, new Set())

    this.addEvent({
      type: 'SUBMITTED',
      interfaceType,
      hash,
      description: manifest.payload.description
    })

    // Сразу запускаем авто-бенчмарк базовыми тестами
    this.runDefaultBenchmark(evaluationId, hash, manifest)

    this.save()
    this.node.log(`JUDGE Submitted: ${manifest.payload.description} [${interfaceType}]`)
    return evaluationId
  }

  // Запустить бенчмарк (кастомный список тестов)
  benchmark(evaluationId: string, testSuite: string[] = []): BenchmarkResult | null {
    // Находим манифест по evaluationId
    const existing = this.evaluations.get(evaluationId)
    if (!existing) return null
    return existing
  }

  // Сигнал: узел принял эту реализацию
  adoptImplementation(hash: string, nodeId: string): { ok: boolean; message: string } {
    const entry = this.leaderboard.get(hash)
    if (!entry) return { ok: false, message: 'Implementation not found' }

    const adopters = this.adoptions.get(hash) ?? new Set()
    adopters.add(nodeId)
    this.adoptions.set(hash, adopters)

    entry.adoption_count = adopters.size

    this.addEvent({
      type: 'ADOPTED',
      interfaceType: entry.interfaceType,
      hash,
      description: entry.description,
      adoption_count: entry.adoption_count
    })

    this.save()
    this.node.log(`JUDGE Adoption: ${hash.slice(0, 8)}… adopted by ${nodeId} (total: ${entry.adoption_count})`)
    return { ok: true, message: `Adoption recorded. ${entry.adoption_count} nodes now use this implementation.` }
  }

  // Лидерборд по типу интерфейса (или все)
  getLeaderboard(interfaceType?: string): LeaderboardEntry[] {
    let entries = Array.from(this.leaderboard.values())
    if (interfaceType) {
      entries = entries.filter(e => e.interfaceType === interfaceType)
    }
    // Сортируем: adoption_count DESC, score DESC
    return entries.sort((a, b) =>
      b.adoption_count !== a.adoption_count
        ? b.adoption_count - a.adoption_count
        : b.score - a.score
    )
  }

  // Таймлайн всей эволюции (или конкретного типа)
  getEvolutionTimeline(interfaceType?: string): EvolutionEvent[] {
    if (!interfaceType) return [...this.timeline].reverse()
    return this.timeline.filter(e => e.interfaceType === interfaceType).reverse()
  }

  // Лучшая реализация по типу
  getBest(interfaceType: string): LeaderboardEntry | null {
    const entries = this.getLeaderboard(interfaceType)
    return entries[0] ?? null
  }

  getStats() {
    const entries = Array.from(this.leaderboard.values())
    const types = [...new Set(entries.map(e => e.interfaceType))]
    return {
      total_submissions: entries.length,
      total_adoptions: entries.reduce((s, e) => s + e.adoption_count, 0),
      interface_types: types,
      evolution_events: this.timeline.length,
      top_by_type: Object.fromEntries(
        types.map(t => [t, this.getBest(t)])
      )
    }
  }

  // Внутренний авто-бенчмарк: базовые проверки доступности и формата
  private runDefaultBenchmark(evaluationId: string, hash: string, manifest: ManifestPacket): void {
    const notes: string[] = []
    let score = 50 // базовый балл

    // Проверка наличия endpoint
    const endpoint = manifest.payload.metadata?.endpointUrl ?? manifest.payload.metadata?.endpoint_url
    if (endpoint) {
      notes.push('✓ Endpoint URL provided')
      score += 10
    } else {
      notes.push('⚠ No endpoint URL — local implementation')
    }

    // Проверка версии
    if (manifest.payload.metadata?.version) {
      notes.push(`✓ Version declared: ${manifest.payload.metadata.version}`)
      score += 5
    }

    // Проверка описания
    if (manifest.payload.description.length > 30) {
      notes.push('✓ Rich description')
      score += 5
    }

    // Проверка подписи манифеста
    if (ManifestBuilder.verify(manifest)) {
      notes.push('✓ Manifest signature valid')
      score += 15
    } else {
      notes.push('✗ Manifest signature invalid')
      score -= 20
    }

    // Проверка тегов
    if (manifest.payload.tags.length >= 2) {
      notes.push('✓ Well-tagged')
      score += 5
    }

    score = Math.max(0, Math.min(100, score))

    const result: BenchmarkResult = {
      evaluationId,
      hash,
      interfaceType: manifest.payload.metadata?.interfaceType ?? 'unknown',
      score,
      latency_ms: 0,  // local check
      tests_passed: notes.filter(n => n.startsWith('✓')).length,
      tests_total: notes.length,
      notes,
      judged_at: Date.now()
    }

    this.evaluations.set(evaluationId, result)

    // Обновляем score в лидерборде
    const entry = this.leaderboard.get(hash)
    if (entry) entry.score = score

    this.addEvent({
      type: 'BENCHMARK',
      interfaceType: result.interfaceType,
      hash,
      description: manifest.payload.description,
      score
    })
  }

  private addEvent(partial: Omit<EvolutionEvent, 'timestamp'>): void {
    this.timeline.push({ timestamp: Date.now(), ...partial })
    // Ограничиваем историю
    if (this.timeline.length > 1000) this.timeline.shift()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'))
        for (const e of (data.leaderboard ?? [])) this.leaderboard.set(e.hash, e)
        for (const e of (data.evaluations ?? [])) this.evaluations.set(e.evaluationId, e)
        this.timeline = data.timeline ?? []
        for (const [hash, adopters] of Object.entries(data.adoptions ?? {})) {
          this.adoptions.set(hash, new Set(adopters as string[]))
        }
      }
    } catch { /* first run */ }
  }

  private save(): void {
    const adoptionsObj: Record<string, string[]> = {}
    for (const [hash, set] of this.adoptions) {
      adoptionsObj[hash] = [...set]
    }
    fs.writeFileSync(this.storePath, JSON.stringify({
      leaderboard: Array.from(this.leaderboard.values()),
      evaluations: Array.from(this.evaluations.values()),
      timeline: this.timeline,
      adoptions: adoptionsObj
    }, null, 2))
  }
}
