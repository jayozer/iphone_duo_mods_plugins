import type { Away, TestRun } from '../types'

// Below this many columns the phone is folded; above it, unfolded.
export const BREAKPOINT = 56

const TEST_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(pytest|jest|vitest|mocha|rspec|phpunit)\b|\b(go|cargo|swift|dotnet|mix)\s+test\b|\bplugin test\b|\bmake\s+(test|check)\b/

export const isTestCommand = (command: string) => TEST_COMMAND.test(command)

const count = (text: string, pattern: RegExp): number | null => {
  let total: number | null = null
  for (const match of text.matchAll(pattern)) total = (total ?? 0) + Number(match[1])
  return total
}

export const readTestRun = (command: string, output: string, isError: boolean): TestRun => {
  const passed = count(output, /(\d+)\s+(?:pass(?:ed|ing)?|✓)/gi)
  const failed = count(output, /(\d+)\s+(?:fail(?:ed|ing|ures?)?|✗)/gi)
  return { command, isPassing: !isError && (failed ?? 0) === 0, passed, failed }
}

export const field = (input: unknown, name: string): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : undefined
}

// A tool.call's arguments arrive under `input`; fall back to the event itself.
export const callInput = (e: unknown): unknown => {
  const input = typeof e === 'object' && e !== null ? (e as { input?: unknown }).input : undefined
  return typeof input === 'object' && input !== null ? input : e
}

export const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path

export const describeCall = (tool: string, input: unknown): string => {
  const command = field(input, 'command')
  if (command !== undefined) return `${tool} · ${command.split('\n')[0] ?? ''}`
  const path = field(input, 'file_path') ?? field(input, 'notebook_path')
  if (path !== undefined) return `${tool} · ${baseName(path)}`
  const pattern = field(input, 'pattern') ?? field(input, 'description')
  return pattern === undefined ? tool : `${tool} · ${pattern}`
}

export const firstQuestion = (input: unknown): string => {
  const questions = (input as { questions?: unknown })?.questions
  if (Array.isArray(questions)) {
    const text = field(questions[0], 'question')
    if (text !== undefined) return text
  }
  return 'Claude has a question for you'
}

export const outputText = (result: unknown): string => {
  if (typeof result === 'string') return result
  return [field(result, 'stdout'), field(result, 'stderr')].filter(Boolean).join('\n')
}

export const emptyAway = (since: number): Away => ({ since, turns: 0, changed: [], tests: [], errors: 0, waiting: [] })

export const hasNews = (away: Away) =>
  away.turns > 0 || away.changed.length > 0 || away.tests.length > 0 || away.errors > 0 || away.waiting.length > 0

export const duration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

export const clock = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export const testLine = (run: TestRun) => {
  const counts = [
    run.passed === null ? null : `${run.passed} passed`,
    run.failed === null ? null : `${run.failed} failed`,
  ].filter(Boolean)
  const verdict = run.isPassing ? 'Tests green' : 'Tests failing'
  return counts.length === 0 ? verdict : `${verdict} · ${counts.join(', ')}`
}

const gaugeColor = (percent: number) => (percent < 60 ? '#2e9e5b' : percent < 85 ? '#d18b00' : '#d23f31')

// A labelled bar: the track is a neutral grey that reads in light and dark.
export const gaugeSvg = (label: string, percent: number, width: number) => {
  const clamped = Math.max(0, Math.min(100, percent))
  const fill = Math.round((clamped / 100) * width)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="34" viewBox="0 0 ${width} 34">` +
    `<text x="0" y="12" font-family="-apple-system, system-ui, sans-serif" font-size="12" fill="#8a8a8e">${label}</text>` +
    `<text x="${width}" y="12" text-anchor="end" font-family="-apple-system, system-ui, sans-serif" font-size="12" fill="#8a8a8e">${Math.round(clamped)}%</text>` +
    `<rect x="0" y="18" width="${width}" height="12" rx="6" fill="#8a8a8e" fill-opacity="0.25"/>` +
    `<rect x="0" y="18" width="${fill}" height="12" rx="6" fill="${gaugeColor(clamped)}"/>` +
    `</svg>`
  )
}
