import type { Away, TestRun, TreeSnapshot } from '../types'

// Below this many columns the phone is folded; above it, unfolded.
export const BREAKPOINT = 56

const TEST_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(pytest|jest|vitest|mocha|rspec|phpunit)\b|\b(go|cargo|swift|dotnet|mix)\s+test\b|\bplugin test\b|\bmake\s+(test|check)\b/

export const isTestCommand = (command: string) => TEST_COMMAND.test(command)

const count = (text: string, pattern: RegExp): number | null => {
  let total: number | null = null
  for (const match of text.matchAll(pattern)) total = (total ?? 0) + Number(match[1])
  return total
}

// Count from the runner's test summary line when it prints one (Jest's `Tests:`), so suite
// totals (`Test Suites: 1 passed`) are not added in; otherwise from every line but suite lines.
const countedText = (output: string) => {
  const lines = output.split('\n')
  const summary = lines.filter(line => /^\s*Tests?:/i.test(line))
  return (summary.length > 0 ? summary : lines.filter(line => !/\bsuites?\b/i.test(line))).join('\n')
}

export const readTestRun = (command: string, output: string, isError: boolean): TestRun => {
  const text = countedText(output)
  const passed = count(text, /(\d+)\s+(?:pass(?:ed|ing)?|✓)/gi)
  const failed = count(text, /(\d+)\s+(?:fail(?:ed|ing|ures?)?|✗)/gi)
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

export const emptyAway = (since: number, tree: TreeSnapshot | null = null): Away => ({
  since,
  turns: 0,
  changed: [],
  tests: [],
  errors: 0,
  tree,
})

// `git status --porcelain -z` entries as repo-relative paths; a rename or copy carries its old name next.
export const dirtyPaths = (porcelain: string): string[] => {
  const fields = porcelain.split('\0').filter(Boolean)
  const paths: string[] = []
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i] ?? ''
    paths.push(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) i++
  }
  return paths
}

export const hasNews = (away: Away) =>
  away.turns > 0 || away.changed.length > 0 || away.tests.length > 0 || away.errors > 0

// Names the files the absence recorded, so other edits in the tree are not mixed in.
export const reviewPrompt = (changed: readonly string[], awayMs: number) => {
  const head = `I was away for ${duration(awayMs)}.`
  const ask = 'then anything that needs my decision.'
  if (changed.length === 0) return `${head} Summarize what you did in that time in short bullets, ${ask}`
  const listed = changed.slice(0, 30).map(path => `- ${path}`)
  if (changed.length > 30) listed.push(`- and ${changed.length - 30} more`)
  return `${head} You changed these files in that time:\n${listed.join('\n')}\nSummarize the change to each in one short bullet, ${ask}`
}

// Paths whose mark differs between two snapshots, including ones in only one: a file that
// was changed and then committed or reverted counts as well as a newly changed one.
export const changedBetween = (before: Record<string, string>, after: Record<string, string>) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path])

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
