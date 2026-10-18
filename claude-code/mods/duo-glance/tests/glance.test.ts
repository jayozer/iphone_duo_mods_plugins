import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { readTestRun } from '../hooks/lib'

// Stands in for the engine beneath the plugin: a phone that comes and goes, panes, usage.
const midQuestion: { run?: () => Promise<void> } = {}

const engine = (on: On, opened: string[]) => {
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

test('a question answered after the phone came back leaves the summary', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  let isShownWhileOpen = false
  midQuestion.run = async () => {
    await $.session.attach(phone)
    const open = await $.ui.mount(pane('duo-away', 40))
    isShownWhileOpen = (await open.find({ text: 'Which database?' })) !== undefined
    await open.unmount()
  }
  await $.session.attach(phone)
  await $.session.detach({ ...phone, reason: 'detached' } as never)
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
