import type { Risk } from '../types'

// Below this many columns the phone is folded (the 5.4" outer screen) or
// held narrow; above it, unfolded on the 7.6" inner screen.
export const DEFAULT_BREAKPOINT = 56

export const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']

export const QUICK_PROMPTS = [
  { key: 'continue', label: 'Continue', text: 'Continue.' },
  { key: 'tests', label: 'Run tests', text: 'Run the test suite and fix anything that fails.' },
  { key: 'fix', label: 'Fix error', text: 'Fix the last error you hit.' },
  { key: 'explain', label: 'Explain', text: 'Explain what you just did in three short bullet points.' },
  { key: 'commit', label: 'Commit', text: 'Commit the current changes with a clear message.' },
] as const

export const PHONE_STYLE =
  'The person is reading this session on a phone. Keep replies short and lead with the answer. ' +
  'Avoid wide tables and long lines; keep code blocks narrow and only include the lines that matter.'

export const isWide = (columns: number | undefined, breakpoint: number) =>
  columns !== undefined && columns >= breakpoint

const field = (input: unknown, name: string): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : undefined
}

export const baseName = (path: string) => path.split('/').filter(Boolean).pop() ?? path

export const filePathOf = (input: unknown) => field(input, 'file_path') ?? field(input, 'notebook_path')

export const summarize = (tool: string, input: unknown): string => {
  const command = field(input, 'command')
  if (command !== undefined) return command.split('\n')[0] ?? ''
  const path = filePathOf(input)
  if (path !== undefined) return baseName(path)
  return field(input, 'pattern') ?? field(input, 'url') ?? field(input, 'description') ?? ''
}

const DANGER = /\b(rm|sudo|chmod|chown|dd|mkfs|curl|wget|ssh|scp)\b|git\s+(push|reset|clean|rebase)|--force|>\s*\//

export const riskOf = (tool: string, input: unknown): Risk => {
  if (READ_TOOLS.includes(tool)) return 'read'
  if (tool === 'Bash') return DANGER.test(field(input, 'command') ?? '') ? 'danger' : 'other'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'write'
  if (tool === 'WebFetch') return 'danger'
  return 'other'
}

export const RISK_LABEL: Record<Risk, string> = {
  read: 'reads only',
  write: 'writes files',
  danger: 'destructive or network',
  other: 'runs a command',
}

export const clip = (text: string, columns: number) =>
  text.length <= columns ? text : `${text.slice(0, Math.max(1, columns - 1))}…`

// A tool.call's arguments arrive under `input`; fall back to the event itself.
export const callInput = (e: unknown): unknown => {
  const input = typeof e === 'object' && e !== null ? (e as { input?: unknown }).input : undefined
  return typeof input === 'object' && input !== null ? input : e
}
