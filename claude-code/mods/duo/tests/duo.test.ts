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
