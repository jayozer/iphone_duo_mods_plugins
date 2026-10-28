import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { callInput, field, readTestRun } from '../hooks/lib'

// Stands in for the engine beneath the plugin: a phone that comes and goes, panes, usage.
const midQuestion: { run?: () => Promise<void> } = {}
const bash: { isDenied: boolean } = { isDenied: false }
// The checkout at /repo: HEAD, the files the last commit moved, each changed file and its mtime.
const tree: {
  head: string
  committed: string[]
  files: Record<string, number>
  onStatus?: () => Promise<void>
} = { head: 'a', committed: [], files: {} }
const midBash: { run?: () => Promise<void> } = {}

const submitted: string[] = []

const engine = (on: On, opened: string[]) => {
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  let surfaces: ('mobile' | 'terminal')[] = []
  on('session.attach', (_$, e) => {
    surfaces = ['mobile']
    return { clientId: e.clientId }
  })
  on('session.detach', (_$, e) => {
    surfaces = []
    return { clientId: e.clientId }
  })
  on('session.surfaces', () => ({ value: surfaces }))
  on('process.run', async (_$, e) => {
    const out = (stdout: string) => ({
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (e.argv[1] === 'rev-parse') return out(e.argv[2] === 'HEAD' ? `${tree.head}\n` : '/repo\n')
    if (e.argv[1] === 'status') await tree.onStatus?.()
    if (e.argv[1] === 'diff') return out(tree.committed.map(path => `${path}\0`).join(''))
    return out(
      Object.keys(tree.files)
        .map(path => ` M ${path}\0`)
        .join(''),
    )
  })
  on('fs.stat', (_$, e) => {
    const mtimeMs = tree.files[e.path.replace('/repo/', '')]
    if (mtimeMs === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file', size: 10, mtimeMs, isLink: false } } as never
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }] },
  }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }) as never)
  on('tool.call', async (_$, e) => {
    // The phone comes back while the question is still open, then the person answers it.
    if (e.tool === 'AskUserQuestion') await midQuestion.run?.()
    if (e.tool === 'Bash' && bash.isDenied) return { deny: 'Denied by a plugin' } as never
    const command = field(callInput(e), 'command') ?? ''
    if (command.startsWith('npm run gen')) tree.files['src/gen.ts'] = 1
    if (command.startsWith('npm run release')) {
      // Edits and commits: the tree ends clean on a new HEAD.
      tree.head = 'b'
      tree.committed = ['src/version.ts']
    }
    if (command.startsWith('npm run long')) await midBash.run?.()
    if (command.startsWith('npm run format')) tree.files['notes.md'] = (tree.files['notes.md'] ?? 0) + 1
    return e.tool === 'Bash'
      ? ({ result: { stdout: 'Tests: 2 failed, 9 passed', stderr: '', interrupted: false }, isError: true } as never)
      : ({ result: { filePath: '/repo/src/app.ts' } } as never)
  })
  mock.store(on)
  mock.clock(on)
}

const pane = (id: string, bodyColumns: number, surface: 'mobile' | 'terminal' = 'mobile') =>
  ({
    plugin: 'duo-glance',
    surface,
    component: 'Pane',
    requestId: id,
    viewport: { columns: bodyColumns + 2, rows: 40, isFullscreen: false },
    props: { title: id, isFocused: false, bodyColumns, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

const phone = { surface: 'mobile', clientId: 'duo-phone' } as const

test('coming back to the phone shows what happened while away', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)

  await $.turn.start({ text: 'fix the bug', turnId: 'turn-1' } as never)
  await $.tool.call({ tool: 'Edit', input: { file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' } } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'npm test' } } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 'turn-1' } as never)

  await $.session.attach(phone)
  expect(opened).toContain('duo-away')

  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: '1 turn finished' })).toBeDefined()
  expect(await ui.find({ text: '1 file changed' })).toBeDefined()
  expect(await ui.find({ text: 'Tests failing · 9 passed, 2 failed' })).toBeDefined()
  expect(await ui.find({ text: 'app.ts' })).toBeDefined()
  await ui.press({ key: 'review' })
  expect(submitted.at(-1)).toContain('- /repo/src/app.ts')
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ text: 'Nothing happened while you were away.' })).toBeDefined()
  await ui.unmount()
})

test('a question answered while away is no longer listed as waiting', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
  await $.turn.start({ text: 'plan it', turnId: 'turn-1' } as never)
  await $.tool.call({ tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?' }] } } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 'turn-1' } as never)
  await $.session.attach(phone)

  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: '1 turn finished' })).toBeDefined()
  expect(await ui.find({ text: 'Waiting on you' })).toBeUndefined()
  await ui.unmount()
})

test('a question asked before you left is waiting when you come back, and leaves once answered', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  let isShownWhileOpen = false
  midQuestion.run = async () => {
    await $.session.detach({ ...phone, reason: 'detached' } as never)
    await $.session.attach(phone)
    const open = await $.ui.mount(pane('duo-away', 40))
    isShownWhileOpen = (await open.find({ text: 'Which database?' })) !== undefined
    await open.unmount()
  }
  await $.session.attach(phone)
  await $.tool.call({ tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?' }] } } as never)
  midQuestion.run = undefined
  expect(isShownWhileOpen).toBe(true)

  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: 'Which database?' })).toBeUndefined()
  await ui.unmount()
})

test('a quiet absence opens no summary', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
  await $.session.attach(phone)
  expect(opened).not.toContain('duo-away')
})

test('the desk monitor shows status and gauges, as SVG on the phone and text on the terminal', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  const result = await $.command.run({
    command: 'glance',
    args: 'monitor',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(result.text).toContain('Desk monitor opened')
  expect(opened).toContain('duo-monitor')

  for (const columns of [40, 64]) {
    const ui = await $.ui.mount(pane('duo-monitor', columns))
    expect(await ui.find({ text: 'Idle' })).toBeDefined()
    expect(await ui.find({ text: 'No test run yet' })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }

  const terminal = await $.ui.mount(pane('duo-monitor', 80, 'terminal'))
  expect(await terminal.find({ text: 'Context 42%' })).toBeDefined()
  expect(await terminal.find({ text: 'Rate limit 30%' })).toBeDefined()
  await terminal.unmount()
})

test('test output is read for pass and fail counts', () => {
  expect(readTestRun('npm test', 'Tests: 2 failed, 9 passed', true)).toEqual({
    command: 'npm test',
    isPassing: false,
    passed: 9,
    failed: 2,
  })
  expect(readTestRun('pytest', '12 passed in 0.4s', false).isPassing).toBe(true)
  const jest = 'Test Suites: 1 failed, 2 passed, 3 total\nTests:       1 failed, 9 passed, 10 total'
  expect(readTestRun('npx jest', jest, true)).toMatchObject({ passed: 9, failed: 1 })
})

test('a denied test command is not reported as a failing run', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  bash.isDenied = true
  await $.tool.call({ tool: 'Bash', input: { command: 'npm test' } } as never)
  bash.isDenied = false
  await $.command.run({
    command: 'glance',
    args: 'monitor',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  const ui = await $.ui.mount(pane('duo-monitor', 40))
  expect(await ui.find({ text: 'No test run yet' })).toBeDefined()
  await ui.unmount()
})

test('the monitor drops a step once its tool finishes', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  await $.turn.start({ text: 'fix the bug', turnId: 'turn-1' } as never)
  await $.tool.call({ tool: 'Edit', input: { file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' } } as never)
  await $.command.run({
    command: 'glance',
    args: 'monitor',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  const ui = await $.ui.mount(pane('duo-monitor', 40))
  expect(await ui.find({ text: 'Thinking' })).toBeDefined()
  expect(await ui.find({ text: 'Edit · app.ts' })).toBeUndefined()
  await ui.unmount()
})

test('files a shell command changed while away are listed, already-changed ones only if touched', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  tree.files = { 'notes.md': 1, 'old.md': 1 }
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run gen' } } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run format' } } as never)
  await $.session.attach(phone)
  tree.files = {}

  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: 'gen.ts' })).toBeDefined()
  expect(await ui.find({ text: 'notes.md' })).toBeDefined()
  expect(await ui.find({ text: 'old.md' })).toBeUndefined()
  await ui.unmount()
})

test('a shell command that commits, or started before the phone left, still counts', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  tree.files = {}
  tree.head = 'a'
  tree.committed = []
  await $.session.attach(phone)
  midBash.run = async () => {
    await $.session.detach({ ...phone, reason: 'detached' } as never)
    tree.files['src/late.ts'] = 1
  }
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run long' } } as never)
  midBash.run = undefined
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run release' } } as never)
  await $.session.attach(phone)
  tree.files = {}
  tree.head = 'a'
  tree.committed = []

  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: 'late.ts' })).toBeDefined()
  expect(await ui.find({ text: 'version.ts' })).toBeDefined()
  await ui.unmount()
})

test('files a running shell command wrote before the phone came back are counted', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  tree.files = {}
  tree.head = 'a'
  tree.committed = []
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
  midBash.run = async () => {
    tree.files['src/early.ts'] = 1
    await $.session.attach(phone)
  }
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run long' } } as never)
  midBash.run = undefined
  tree.files = {}

  expect(opened).toContain('duo-away')
  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: 'early.ts' })).toBeDefined()
  await ui.unmount()
})

test('leaving again while a reconnect is still checking the checkout keeps the absence going', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  tree.files = {}
  tree.head = 'a'
  tree.committed = []
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
  midBash.run = async () => {
    tree.files['src/a.ts'] = 1
    tree.onStatus = async () => {
      tree.onStatus = undefined
      await $.session.detach({ ...phone, reason: 'detached' } as never)
    }
    await $.session.attach(phone)
  }
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run long' } } as never)
  midBash.run = undefined
  expect(opened).not.toContain('duo-away')

  await $.session.attach(phone)
  tree.files = {}
  expect(opened).toContain('duo-away')
  const ui = await $.ui.mount(pane('duo-away', 40))
  expect(await ui.find({ text: 'a.ts' })).toBeDefined()
  await ui.unmount()
})

const fromApp = (args: string) =>
  ({ command: 'glance', args, origin: { kind: 'bridge' }, presentation: { isFullscreen: false, columns: 40 } }) as const

test('/glance in the app reports, as text, what happened since your last message', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  tree.files = {}
  tree.head = 'a'
  tree.committed = []
  await $.prompt.submit({ text: 'fix the bug', origin: { kind: 'bridge' }, wait: false })
  await $.turn.start({ text: 'fix the bug', turnId: 'turn-1' } as never)
  await $.tool.call({ tool: 'Edit', input: { file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' } } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'npm run gen' } } as never)
  await $.tool.call({ tool: 'Bash', input: { command: 'npm test' } } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 'turn-1' } as never)
  tree.files = {}

  const text = (await $.command.run(fromApp(''))).text ?? ''
  expect(text).toContain('Idle.')
  expect(text).toContain('Since your last message (under a minute): 1 turn finished · 2 files changed · 1 error')
  expect(text).toContain('Tests failing · 9 passed, 2 failed')
  expect(text).toContain('Context 42% · Rate limit 30%')
  expect(text).toContain('Changed: app.ts, gen.ts')

  // The monitor can't open in the app, so it answers with the same text.
  expect((await $.command.run(fromApp('monitor'))).text).toContain('Since your last message')
  expect(opened).not.toContain('duo-monitor')

  // A new message starts the count again; a slash command does not.
  await $.prompt.submit({ text: 'now the docs', origin: { kind: 'bridge' }, wait: false })
  expect((await $.command.run(fromApp('status'))).text).toContain('0 turns finished · 0 files changed')
})

test('/glance shows the running step and what is waiting on you', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  let text = ''
  midQuestion.run = async () => {
    text = (await $.command.run(fromApp(''))).text ?? ''
  }
  await $.prompt.submit({ text: 'plan it', origin: { kind: 'bridge' }, wait: false })
  await $.turn.start({ text: 'plan it', turnId: 'turn-1' } as never)
  await $.tool.call({ tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?' }] } } as never)
  midQuestion.run = undefined

  expect(text).toContain('Working 00:00 · AskUserQuestion')
  expect(text).toContain('Waiting on you: Which database?')
})
