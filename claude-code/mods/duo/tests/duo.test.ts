import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// Stands in for the engine beneath the plugin: a phone that attaches and a pane that opens.
const phone = (on: On) => {
  on('session.attach', (_$, e) => ({ clientId: e.clientId }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  mock.store(on)
}

const pane = (bodyColumns: number) =>
  ({
    plugin: 'duo',
    surface: 'mobile',
    component: 'Pane',
    requestId: 'duo',
    viewport: { columns: bodyColumns + 2, rows: 40, isFullscreen: false },
    props: {
      title: 'Duo',
      isFocused: false,
      bodyColumns,
      placement: 'inline',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }) as const

test('folded shows the quick-prompt deck; unfolded adds the two columns', async ($, on) => {
  phone(on)
  await $.session.attach({ surface: 'mobile', clientId: 'duo-phone' })

  const folded = await $.ui.mount(pane(40))
  expect(await folded.find({ type: 'Button', key: 'continue' })).toBeDefined()
  expect(await folded.find({ text: 'Recent' })).toBeUndefined()
  await folded.unmount()

  const open = await $.ui.mount(pane(80))
  expect(await open.find({ text: 'Recent' })).toBeDefined()
  expect(await open.find({ text: 'Changed this turn' })).toBeDefined()
  await open.unmount()
})

test('the reads button lets reads through while on the phone', async ($, on) => {
  phone(on)
  on('tool.check', () => ({ decision: 'ask' }))
  await $.session.attach({ surface: 'mobile', clientId: 'duo-phone' })

  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/a.ts' } })).decision).toBe('ask')

  const ui = await $.ui.mount(pane(40))
  await ui.press({ key: 'reads' })
  expect((await ui.find({ key: 'reads' }))?.text).toContain('auto')

  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/a.ts' } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf x' } })).decision).toBe('ask')
  await ui.unmount()
})

test('/duo off stops reads being allowed', async ($, on) => {
  phone(on)
  on('tool.check', () => ({ decision: 'ask' }))
  await $.session.attach({ surface: 'mobile', clientId: 'duo-phone' })
  const ui = await $.ui.mount(pane(40))
  await ui.press({ key: 'reads' })
  await ui.unmount()

  const result = await $.command.run({
    command: 'duo',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 40 },
  })
  expect(result.text).toContain('off')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/a.ts' } })).decision).toBe('ask')
})

test('folded on the phone, a tool row is one line', async ($, on) => {
  phone(on)
  await $.session.attach({ surface: 'mobile', clientId: 'duo-phone' })
  const row = await $.ui.mount({
    plugin: 'duo',
    surface: 'mobile',
    component: 'ToolUse',
    viewport: { columns: 40, rows: 40, isFullscreen: false },
    props: {
      tool_use_id: 't1',
      tool: 'Bash',
      input: { command: 'npm test -- --watch=false' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  })
  expect(await row.find({ type: 'Text', text: '✓ Bash · npm test' })).toBeDefined()
  await row.unmount()
})

test('/duo status names the clients the session sees and where the command came from', async ($, on) => {
  phone(on)
  on('session.surfaces', () => ({ value: ['terminal', 'desktop'] }))
  const result = await $.command.run({
    command: 'duo',
    args: 'status',
    origin: { kind: 'bridge' },
    presentation: { isFullscreen: false, columns: 40 },
  })
  expect(result.text).toContain('Clients: terminal, desktop.')
  expect(result.text).toContain('Sent from: bridge.')
})

test('a prompt from the app turns duo on and asks for phone-sized replies', async ($, on) => {
  phone(on)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('prompt.compose', () => ({ sections: [] }) as never)
  const status = (kind: 'bridge' | 'sdk') =>
    $.command.run({
      command: 'duo',
      args: 'status',
      origin: { kind },
      presentation: { isFullscreen: false, columns: 40 },
    })
  const sections = async () => {
    const input = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const
    return (await $.prompt.compose(input)).sections.map(s => s.id)
  }

  expect((await status('sdk')).text).toContain('inactive')
  expect((await status('sdk')).text).toContain('Last prompt from: none yet.')
  expect(await sections()).not.toContain('duo:phone-style')

  await $.prompt.submit({ text: 'fix the build', origin: { kind: 'bridge' }, wait: false })
  expect((await status('sdk')).text).toContain('auto, active')
  expect((await status('sdk')).text).toContain('On the app: yes. Last prompt from: bridge.')
  expect(await sections()).toContain('duo:phone-style')

  // Back at the desk: a prompt typed at the terminal turns it off again.
  await $.prompt.submit({ text: 'and the tests', origin: { kind: 'composer' }, wait: false })
  expect((await status('sdk')).text).toContain('inactive')
  expect(await sections()).not.toContain('duo:phone-style')

  // A /duo command typed in the app counts as being on the app too.
  expect((await status('bridge')).text).toContain('auto, active')
})

test('/duo reads on lets reads through for the app, which has no pane', async ($, on) => {
  phone(on)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('tool.check', () => ({ decision: 'ask' }))
  await $.prompt.submit({ text: 'look around', origin: { kind: 'bridge' }, wait: false })
  const reads = (arg: string) =>
    $.command.run({
      command: 'duo',
      args: `reads ${arg}`,
      origin: { kind: 'bridge' },
      presentation: { isFullscreen: false, columns: 40 },
    })

  expect((await reads('on')).text).toBe('Auto-allow reads is on.')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/a.ts' } })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })).decision).toBe('ask')
  await reads('off')
  expect((await $.tool.check({ tool: 'Read', input: { file_path: '/a.ts' } })).decision).toBe('ask')
})

test('a message delivered from the app turns duo on even without a prompt.submit', async ($, on) => {
  phone(on)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.receive', (_$, e) => ({ text: e.text }) as never)
  await $.session.receive({ origin: { kind: 'bridge' }, text: 'fix the build' })
  const result = await $.command.run({
    command: 'duo',
    args: 'status',
    origin: { kind: 'sdk' },
    presentation: { isFullscreen: false, columns: 40 },
  })
  expect(result.text).toContain('auto, active')
  expect(result.text).toContain('Last prompt from: bridge delivery.')
})
