import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, DuoMode } from '../types'
import {
  DEFAULT_BREAKPOINT,
  PHONE_STYLE,
  QUICK_PROMPTS,
  READ_TOOLS,
  RISK_LABEL,
  baseName,
  callInput,
  clip,
  filePathOf,
  isWide,
  riskOf,
  summarize,
} from './lib'

const PANE = 'duo'
const MODES: readonly DuoMode[] = ['auto', 'on', 'off']

const mode = atom({ plugin: 'duo', key: 'mode' } as const, 'auto')
const isPhone = atom({ plugin: 'duo', key: 'isPhone' } as const, false)
const breakpoint = atom({ plugin: 'duo', key: 'breakpoint' } as const, DEFAULT_BREAKPOINT)
const turnId = atom({ plugin: 'duo', key: 'turnId' } as const, null)
const activity = atom({ plugin: 'duo', key: 'activity' } as const, [])
const changed = atom({ plugin: 'duo', key: 'changed' } as const, [])
const pending = atom({ plugin: 'duo', key: 'pending' } as const, null)
const isAutoReads = atom({ plugin: 'duo', key: 'isAutoReads' } as const, false)
const isFromApp = atom({ plugin: 'duo', key: 'isFromApp' } as const, false)
const lastOrigin = atom({ plugin: 'duo', key: 'lastOrigin' } as const, null)

// A prompt or command from the app arrives through the bridge; one typed at the terminal,
// from the composer. Either says where you are now; other origins (a routine, a peer) don't.
const noteOrigin = async ($: EngineInterface, kind: string) => {
  if (kind === 'bridge' || kind === 'composer') await update($, isFromApp, () => kind === 'bridge')
}

const isActive = async ($: EngineInterface) => {
  const current = await read($, mode)
  return current === 'on' || (current === 'auto' && ((await read($, isPhone)) || (await read($, isFromApp))))
}

const refreshPhone = async ($: EngineInterface) => {
  const surfaces = await $.session.surfaces()
  const hasPhone = surfaces.includes('mobile')
  await update($, isPhone, () => hasPhone)
  if (await isActive($)) await $.ui.open({ id: PANE, title: 'Duo' })
}

const STATUS_MARK: Record<Activity['status'], string> = { running: '…', done: '✓', error: '✗' }

export const register: Register = on => {
  let startedAt = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'duo',
      description: 'Phone mode: /duo on, off, auto, status, or breakpoint <columns>',
      argumentHint: 'on | off | auto | status | breakpoint <n>',
    })
    const stored = await $.store.get('mode')
    if (typeof stored === 'string' && MODES.includes(stored as DuoMode)) {
      await update($, mode, () => stored as DuoMode)
    }
    const storedBreakpoint = await $.store.get('breakpoint')
    if (typeof storedBreakpoint === 'number') await update($, breakpoint, () => storedBreakpoint)
    await update($, isAutoReads, () => false)
    await refreshPhone($)

    return next(e)
  })

  on('session.attach', { surface: 'mobile' }, async ($, e, next) => {
    await update($, isPhone, () => true)
    if (await isActive($)) await $.ui.open({ id: PANE, title: 'Duo' })

    return next(e)
  })

  on('session.detach', async ($, e, next) => {
    const result = await next(e)
    if (e.surface === 'mobile' && e.reason !== 'end') await refreshPhone($)

    return result
  })

  on('command.run', { command: 'duo' }, async ($, e) => {
    const [word = 'status', arg] = e.args.trim().split(/\s+/)
    // A command typed in the app says you're on the phone, as a prompt from there does.
    await noteOrigin($, e.origin.kind)
    if (word === 'on' || word === 'off' || word === 'auto') {
      await update($, mode, () => word)
      await $.store.set('mode', word)
      if (word === 'off') {
        await $.ui.close({ id: PANE })
      } else if (await isActive($)) {
        await $.ui.open({ id: PANE, title: 'Duo' })
      }
      return { text: `Duo mode is ${word}.` }
    }
    if (word === 'reads' && (arg === 'on' || arg === 'off')) {
      // The Reads button's twin, for the app, which can't draw the pane.
      await update($, isAutoReads, () => arg === 'on')
      return { text: `Auto-allow reads is ${arg}.` }
    }
    if (word === 'breakpoint') {
      const columns = Number(arg)
      if (!Number.isInteger(columns) || columns < 20 || columns > 200) {
        return { text: 'Give a width in columns between 20 and 200, like /duo breakpoint 56.' }
      }
      await update($, breakpoint, () => columns)
      await $.store.set('breakpoint', columns)
      return { text: `Duo switches to the two-column layout from ${columns} columns.` }
    }
    const active = await isActive($)
    const phone = await read($, isPhone)
    const fromApp = await read($, isFromApp)
    const origin = await read($, lastOrigin)
    return {
      text:
        `Duo mode: ${await read($, mode)}, ${active ? 'active' : 'inactive'}. ` +
        `Phone attached: ${phone ? 'yes' : 'no'}. On the app: ${fromApp ? 'yes' : 'no'}. Last prompt from: ${origin ?? 'none yet'}. ` +
        `Two-column layout from ${await read($, breakpoint)} columns. ` +
        `Auto-allow reads: ${(await read($, isAutoReads)) ? 'on' : 'off'}. ` +
        // What the session sees, to tell why auto mode did or didn't spot the phone.
        `Clients: ${(await $.session.surfaces()).join(', ') || 'none'}. Sent from: ${e.origin.kind}.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      startedAt = await $.clock.now()
      await update($, turnId, () => e.turnId)
      await update($, changed, () => [])
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await update($, turnId, () => null)
    await update($, pending, () => null)
    const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
    if (seconds >= 30 && !e.isAborted && (await isActive($))) {
      const files = (await read($, changed)).length
      const what = files > 0 ? `${files} file${files === 1 ? '' : 's'} changed` : 'no files changed'
      void $.ui.notify(`Finished in ${seconds}s, ${what}.`, { title: 'Claude Code' }).catch(() => undefined)
    }

    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || !(await isActive($))) return verdict
    if (READ_TOOLS.includes(e.tool) && (await read($, isAutoReads))) {
      return { ...verdict, decision: 'allow', reason: 'Allowed by Duo: a read while on the phone' }
    }
    const id = e.tool_use_id
    if (id !== undefined) {
      const ask = { id, tool: e.tool, summary: summarize(e.tool, e.input), risk: riskOf(e.tool, e.input) }
      await update($, pending, () => ask)
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    const row: Activity = { id, tool: e.tool, summary: summarize(e.tool, callInput(e)), status: 'running' }
    await update($, activity, list => [...list, row].slice(-30))
    const ran = await next(e)
    const isFailed = 'deny' in ran && ran.deny !== undefined ? true : ran.isError === true
    await update($, activity, list =>
      list.map(one => (one.id === id ? { ...one, status: isFailed ? 'error' : 'done' } : one)),
    )
    await update($, pending, ask => (ask?.id === id ? null : ask))
    const path = filePathOf(callInput(e))
    if (!isFailed && path !== undefined && riskOf(e.tool, callInput(e)) === 'write') {
      await update($, changed, list => (list.includes(path) ? list : [...list, path]))
    }

    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, lastOrigin, () => e.origin.kind)
    await noteOrigin($, e.origin.kind)

    return next(e)
  })

  // A message from the app is delivered to the session before it becomes a prompt, and may
  // not raise prompt.submit at all.
  on('session.receive', async ($, e, next) => {
    if (e.origin.kind === 'bridge' && e.agentId === undefined) {
      await update($, lastOrigin, () => 'bridge delivery')
      await noteOrigin($, 'bridge')
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const isOn = e.surfaces.includes('mobile') ? (await read($, mode)) !== 'off' : await isActive($)
    if (!isOn) return composed

    return { sections: [...composed.sections, { id: 'duo:phone-style', text: PHONE_STYLE, scope: 'session' }] }
  })

  // Folded on the phone, each tool row shrinks to one line.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'mobile' || !(await isActive($))) return next(e)
    if (isWide(e.viewport?.columns, await read($, breakpoint))) return next(e)
    const { Text } = $.ui.resolve(e)
    const { tool, input, isRunning, isErrored } = e.props
    const mark = isRunning ? '…' : isErrored ? '✗' : '✓'
    const columns = e.viewport?.columns ?? 40

    return (
      <Text dimColor={!isRunning} wrap="truncate-end">
        {clip(`${mark} ${tool} · ${summarize(tool, input)}`, columns)}
      </Text>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const isTwoColumns = isWide(columns, await read($, breakpoint))
    const running = await read($, turnId)
    const ask = await read($, pending)
    const rows = await read($, activity)
    const files = await read($, changed)
    const autoReads = await read($, isAutoReads)
    const current = rows.filter(row => row.status === 'running').pop() ?? rows[rows.length - 1]

    const header = (
      <Box key="header" flexDirection="column">
        <Text bold>{running === null ? 'Idle' : 'Working'}</Text>
        <Text dimColor>
          {columns} columns · {isTwoColumns ? 'unfolded' : 'folded'}
        </Text>
        {current !== undefined && (
          <Text dimColor wrap="truncate-end">
            {clip(`${STATUS_MARK[current.status]} ${current.tool} · ${current.summary}`, columns)}
          </Text>
        )}
      </Box>
    )

    const approval = ask !== null && (
      <Box key="approval" flexDirection="column" borderStyle="round" paddingX="sm">
        <Text bold>Needs your OK: {ask.tool}</Text>
        <Text wrap="truncate-end">{clip(ask.summary, columns - 4)}</Text>
        <Text dimColor>Risk: {RISK_LABEL[ask.risk]}. Answer in the prompt below.</Text>
      </Box>
    )

    const deck = (
      <Box key="deck" flexDirection="row" flexWrap="wrap" gap="sm">
        {running !== null ? (
          <Button
            key="stop"
            label="Stop"
            variant="primary"
            onPress={() => void $.turn.abort({ turnId: running }).catch(() => undefined)}
          />
        ) : (
          QUICK_PROMPTS.map(quick => (
            <Button
              key={quick.key}
              label={quick.label}
              onPress={() => void $.prompt.submit({ text: quick.text }).catch(() => undefined)}
            />
          ))
        )}
        <Button
          key="reads"
          label={autoReads ? 'Reads: auto' : 'Reads: ask'}
          onPress={() => update($, isAutoReads, isOn => !isOn)}
        />
      </Box>
    )

    const recent = (
      <Box key="recent" flexDirection="column">
        <Text bold>Recent</Text>
        {rows.length === 0 && <Text dimColor>No tool calls yet.</Text>}
        {rows.slice(-8).map(row => (
          <Text key={row.id} dimColor={row.status !== 'running'} wrap="truncate-end">
            {STATUS_MARK[row.status]} {row.tool} · {row.summary}
          </Text>
        ))}
      </Box>
    )

    const changes = (
      <Box key="changes" flexDirection="column">
        <Text bold>Changed this turn</Text>
        {files.length === 0 && <Text dimColor>Nothing yet.</Text>}
        {files.slice(-8).map(path => (
          <Text key={path} wrap="truncate-start">
            {baseName(path)}
          </Text>
        ))}
      </Box>
    )

    if (!isTwoColumns) {
      return (
        <Box flexDirection="column" gap="sm">
          {header}
          {approval}
          {deck}
          {files.length > 0 && <Text dimColor>{files.length} changed this turn</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm">
        {header}
        {approval}
        <Box flexDirection="row" gap="md">
          <Box width="50%">{recent}</Box>
          <Box width="50%">{changes}</Box>
        </Box>
        {deck}
      </Box>
    )
  })
}
