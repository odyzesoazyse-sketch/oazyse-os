import * as fs from 'fs'
import * as path from 'path'
import { NODE_DIR } from '../core/Node'

export interface Goal {
  id: string
  description: string
  category: 'NETWORK' | 'COMPUTE' | 'KNOWLEDGE' | 'SECURITY' | 'GROWTH' | 'INFRASTRUCTURE'
  targetMilestones: number
  completedMilestones: number
  milestones: Milestone[]
  createdAt: number
  completedAt?: number
  progressPercent: number
}

export interface Milestone {
  id: string
  description: string
  achievedAt: number
  step: number
  evidence: string
}

export interface TaskRecord {
  taskId: string
  goalId: string
  number: number
  date: string
  duration: number
  achievements: string[]
  blockers: string[]
  metrics: string[]
  nextSteps: string
  progressDelta: number
}

export class ProgressTracker {
  private goals = new Map<string, Goal>()
  private tasks: TaskRecord[] = []
  private dataPath = path.join(NODE_DIR, 'memory', 'progress.json')

  constructor() {
    this.load()
  }

  private load() {
    if (fs.existsSync(this.dataPath)) {
      const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'))
      data.goals?.forEach((g: Goal) => this.goals.set(g.id, g))
      this.tasks = data.tasks || []
    }
  }

  private save() {
    fs.writeFileSync(this.dataPath, JSON.stringify({
      goals: Array.from(this.goals.values()),
      tasks: this.tasks
    }, null, 2))
  }

  setGoal(description: string, category: Goal['category'], targetMilestones = 20): Goal {
    const goal: Goal = {
      id: `goal-${Date.now()}`,
      description,
      category,
      targetMilestones,
      completedMilestones: 0,
      milestones: [],
      createdAt: Date.now(),
      progressPercent: 0
    }
    this.goals.set(goal.id, goal)
    this.save()
    return goal
  }

  recordTask(record: Omit<TaskRecord, 'number'>): TaskRecord {
    const goalTasks = this.tasks.filter(t => t.goalId === record.goalId)
    const full: TaskRecord = { ...record, number: goalTasks.length + 1 }
    this.tasks.push(full)

    const goal = this.goals.get(record.goalId)
    if (goal) {
      goal.completedMilestones++
      goal.progressPercent = Math.min(
        (goal.completedMilestones / goal.targetMilestones) * 100,
        100
      )
      if (record.achievements.length > 0) {
        goal.milestones.push({
          id: `milestone-${Date.now()}`,
          description: record.achievements[0],
          achievedAt: Date.now(),
          step: full.number,
          evidence: record.metrics[0] || ''
        })
      }
    }

    this.save()
    return full
  }

  getNextTaskContext(goalId: string): {
    goal: Goal | undefined
    lastTask: TaskRecord | undefined
    pendingWork: string[]
    suggestedAction: string
    momentum: 'ACCELERATING' | 'STABLE' | 'SLOWING'
  } {
    const goal = this.goals.get(goalId)
    const goalTasks = this.tasks.filter(t => t.goalId === goalId)
    const lastTask = goalTasks[goalTasks.length - 1]

    const recentProgress = goalTasks.slice(-3).map(t => t.progressDelta)
    const avgProgress = recentProgress.reduce((a, b) => a + b, 0) / (recentProgress.length || 1)

    const pendingWork = lastTask?.blockers || []

    let suggestedAction = 'Continue from last task'
    if (lastTask?.achievements.length) {
      suggestedAction = `Build on: "${lastTask.achievements[0]}"`
    } else if (pendingWork.length) {
      suggestedAction = `Resolve blocker: "${pendingWork[0]}"`
    }

    return {
      goal,
      lastTask,
      pendingWork,
      suggestedAction,
      momentum: avgProgress > 0.05 ? 'ACCELERATING' : avgProgress < -0.02 ? 'SLOWING' : 'STABLE'
    }
  }

  getProgressMap(goalId: string): {
    initial: string[]
    current: string[]
    milestones: Milestone[]
    tasksCount: number
    daysActive: number
  } {
    const goalTasks = this.tasks.filter(t => t.goalId === goalId)
    const goal = this.goals.get(goalId)

    const firstTasks = goalTasks.slice(0, 3)
    const recentTasks = goalTasks.slice(-3)

    const initial = firstTasks.flatMap(t => t.blockers).slice(0, 5)
    const current = recentTasks.flatMap(t => t.metrics).slice(0, 5)

    const daysActive = goal
      ? Math.floor((Date.now() - goal.createdAt) / (1000 * 60 * 60 * 24))
      : 0

    return {
      initial,
      current,
      milestones: goal?.milestones || [],
      tasksCount: goalTasks.length,
      daysActive
    }
  }

  getAllGoals(): Goal[] {
    return Array.from(this.goals.values())
  }
}
