import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Away, Gauges, TreeSnapshot } from '../types'
import {
  BREAKPOINT,
  baseName,
  callInput,
  changedBetween,
  clock,
  describeCall,
  duration,
  emptyAway,
  field,
  firstQuestion,
  gaugeSvg,
  dirtyPaths,
  glanceText,
  hasNews,
  isTestCommand,
  outputText,
  readTestRun,
  reviewPrompt,
  testLine,
} from './lib'

const AWAY_PANE = 'duo-away'
const MONITOR_PANE = 'duo-monitor'
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']
const NO_GAUGES: Gauges = { contextPercent: null, ratePercent: null, costUsd: null }

const isPhone = atom({ plugin: 'duo-glance', key: 'isPhone' } as const, false)
const away = atom({ plugin: 'duo-glance', key: 'away' } as const, null)
const summary = atom({ plugin: 'duo-glance', key: 'summary' } as const, null)
const recap = atom({ plugin: 'duo-glance', key: 'recap' } as const, null)
const pending = atom({ plugin: 'duo-glance', key: 'pending' } as const, [])
const steps = atom({ plugin: 'duo-glance', key: 'steps' } as const, [])
const turnStartedAt = atom({ plugin: 'duo-glance', key: 'turnStartedAt' } as const, null)
const lastTest = atom({ plugin: 'duo-glance', key: 'lastTest' } as const, null)
const gauges = atom({ plugin: 'duo-glance', key: 'gauges' } as const, NO_GAUGES)
const isMonitorOpen = atom({ plugin: 'duo-glance', key: 'isMonitorOpen' } as const, false)
const now = atom({ plugin: 'duo-glance', key: 'now' } as const, 0)

const openMonitor = async ($: EngineInterface) => {
  const usage = await $.session.usage()
  await update($, gauges, () => readGauges(usage))
  const at = await $.clock.now()
  await update($, now, () => at)
  await update($, isMonitorOpen, () => true)
  await $.ui.open({ id: MONITOR_PANE, title: 'Monitor' })
}

function readGauges(usage: {
  context: { percent?: number }
  rateLimits: readonly { percentUsed: number }[]
  cost?: { usd: number }
}): Gauges {
  return {
    contextPercent: usage.context.percent ?? null,
    ratePercent: usage.rateLimits.length === 0 ? null : Math.max(...usage.rateLimits.map(limit => limit.percentUsed)),
    costUsd: usage.cost?.usd ?? null,
  }
}

const git = async ($: EngineInterface, args: string[], cwd?: string) => {
  const ran = await $.process.run(['git', ...args], { cwd, timeoutMs: 4000 })
  return ran.exitCode === 0 ? ran.stdout : null
}

// The checkout now, or null outside a git checkout (or where commands can't run).
const readTree = async ($: EngineInterface): Promise<TreeSnapshot | null> => {
  try {
    const top = await git($, ['rev-parse', '--show-toplevel'])
    if (top === null) return null
    const root = top.trim()
    const status = await git($, ['status', '--porcelain', '-z', '--untracked-files=all'], root)
    if (status === null) return null
    const head = (await git($, ['rev-parse', 'HEAD'], root))?.trim() ?? null
    const marks = await Promise.all(
      dirtyPaths(status).map(async relative => {
        const path = `${root}/${relative}`
        try {
          const stat = await $.fs.stat(path)
          return [path, `${stat.size}:${stat.mtimeMs}`] as const
        } catch {
          return [path, 'gone'] as const
        }
      }),
    )
    return { root, head, marks: Object.fromEntries(marks) }
  } catch {
    return null
  }
}

// Files that differ from the checkout as the phone left it: changed in the tree since,
// or moved by a commit, checkout or reset (which can leave the tree clean).
const changedSince = async ($: EngineInterface, then: TreeSnapshot): Promise<string[]> => {
  const current = await readTree($)
  if (current === null || current.root !== then.root) return []
  const paths = changedBetween(then.marks, current.marks)
  if (then.head !== null && current.head !== null && then.head !== current.head) {
    const moved = await git($, ['diff', '--name-only', '-z', then.head, current.head], then.root).catch(() => null)
    for (const relative of (moved ?? '').split('\0').filter(Boolean)) paths.push(`${then.root}/${relative}`)
  }
  return [...new Set(paths)]
}

// How many times the phone has left; a reconnect that sees this change mid-way leaves the
// absence open.
let departures = 0

// The phone left: start counting what happens until it comes back.
const leave = async ($: EngineInterface) => {
  const id = ++departures
  const since = await $.clock.now()
  await update($, isPhone, () => false)
  // Open the record before the checkout scan, so calls that finish during it still count.
  const opened = { isNew: false }
  await update($, away, current => {
    if (current !== null) return current
    opened.isNew = true
    return emptyAway(since, id)
  })
  if (!opened.isNew) return
  const tree = await readTree($)
  if (tree !== null) await update($, away, held => (held?.id === id ? { ...held, tree } : held))
}

// How many prompts have opened a recap; a checkout scan attaches only to the one it began.
let recaps = 0

// Both logs, the absence and the recap since your last message, see every turn and call.
const record = async ($: EngineInterface, change: (log: Away) => Away) => {
  await update($, away, held => (held === null ? null : change(held)))
  await update($, recap, held => (held === null ? null : change(held)))
}

// A shell command can change files too (sed -i, a formatter, a generator, a commit):
// compare the checkout with how it was when each log began, whenever the call began.
const shellChanges = async ($: EngineInterface, then: Away | null) => {
  const touched = then?.tree ? await changedSince($, then.tree) : []
  return (held: Away | null) => {
    if (held === null || held.id !== then?.id) return held
    const added = touched.filter(one => !held.changed.includes(one))
    return added.length === 0 ? held : { ...held, changed: [...held.changed, ...added] }
  }
}

const recordShellChanges = async ($: EngineInterface) => {
  const intoAway = await shellChanges($, await read($, away))
  await update($, away, intoAway)
  const intoRecap = await shellChanges($, await read($, recap))
  await update($, recap, intoRecap)
}

const startRecap = async ($: EngineInterface) => {
  const id = ++recaps
  const since = await $.clock.now()
  await update($, recap, () => emptyAway(since, id))
  const tree = await readTree($)
  if (tree !== null) await update($, recap, held => (held?.id === id ? { ...held, tree } : held))
}

const statusText = async ($: EngineInterface, isShellRunning: boolean) => {
  // A shell command still running may already have written files; its own check comes later.
  if (isShellRunning) await recordShellChanges($)
  const usage = await $.session.usage()
  await update($, gauges, () => readGauges(usage))
  return glanceText({
    at: await $.clock.now(),
    turnStartedAt: await read($, turnStartedAt),
    step: (await read($, steps)).slice(-1)[0]?.text,
    lastTest: await read($, lastTest),
    gauges: await read($, gauges),
    recap: await read($, recap),
    away: await read($, away),
    waiting: await read($, pending),
  })
}

const notifyAway = async ($: EngineInterface, text: string) => {
  if ((await read($, away)) === null) return
  void $.ui.notify(text, { title: 'Claude Code' }).catch(() => undefined)
}

export const register: Register = on => {
  let shellsRunning = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'glance',
      description: 'iPhone Duo glance: /glance monitor, /glance away, or /glance status',
      argumentHint: 'monitor | away | status',
    })
    const surfaces = await $.session.surfaces()
    await update($, isPhone, () => surfaces.includes('mobile'))
    const usage = await $.session.usage()
    await update($, gauges, () => readGauges(usage))
    $.clock.every(1000, () => {
      void (async () => {
        if ((await read($, isMonitorOpen)) && (await read($, turnStartedAt)) !== null) {
          const at = await $.clock.now()
          await update($, now, () => at)
        }
      })().catch(() => undefined)
    })

    return next(e)
  })

  on('session.attach', { surface: 'mobile' }, async ($, e, next) => {
    const result = await next(e)
    await update($, isPhone, () => true)
    const seen = departures
    const open = await read($, away)
    // A shell command still running may already have written files: count them now,
    // since once the absence ends its own check finds nothing to add to.
    const touched = open?.tree && shellsRunning > 0 ? await changedSince($, open.tree) : []
    // Close the record as it stands now, with whatever finished during the scan, unless
    // the phone left again meanwhile: then the absence goes on.
    const closed: { away: Away | null } = { away: null }
    await update($, away, current => {
      if (current === null || departures !== seen) return current
      closed.away = { ...current, changed: [...new Set([...current.changed, ...touched])] }
      return null
    })
    const held = closed.away
    if (held !== null && (hasNews(held) || (await read($, pending)).length > 0)) {
      const until = await $.clock.now()
      await update($, summary, () => ({ ...held, until }))
      await $.ui.open({ id: AWAY_PANE, title: 'While you were away' })
    }

    return result
  })

  on('session.detach', async ($, e, next) => {
    const result = await next(e)
    if (e.surface !== 'mobile' || e.reason === 'end') return result
    const surfaces = await $.session.surfaces()
    if (!surfaces.includes('mobile')) await leave($)

    return result
  })

  on('command.run', { command: 'glance' }, async ($, e) => {
    const word = e.args.trim().split(/\s+/)[0] || 'status'
    // The Claude app shows a command's text but not a pane, so it gets the glance as text.
    const isApp = e.origin.kind === 'bridge'
    if (word === 'monitor' && isApp) return { text: await statusText($, shellsRunning > 0) }
    if (word === 'monitor') {
      await openMonitor($)
      return { text: 'Desk monitor opened. Prop the phone half-open and it shows the session at a glance.' }
    }
    if (word === 'away' && isApp) {
      const text = "The app can't show the away pane. Send /glance any time to see what happened since your last message."
      return { text }
    }
    if (word === 'away') {
      // Pretend the phone just left, so the next time it attaches you get a summary.
      await leave($)
      return { text: 'Counting from now: the next time the phone opens this session it gets a summary.' }
    }
    return { text: await statusText($, shellsRunning > 0) }
  })

  // A prompt you sent, from the app or the terminal, starts a new recap.
  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'bridge' || e.origin.kind === 'composer'
    if (isTyped && e.command === undefined && e.isMeta !== true) await startRecap($)

    return next(e)
  })

  // A message from the app is delivered to the session first, and may not raise prompt.submit.
  on('session.receive', async ($, e, next) => {
    const isMessage = e.origin.kind === 'bridge' && e.agentId === undefined && !e.text.trimStart().startsWith('/')
    if (isMessage) await startRecap($)

    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === MONITOR_PANE) await update($, isMonitorOpen, () => false)
    if (e.id === AWAY_PANE) await update($, summary, () => null)

    return result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      await update($, turnStartedAt, () => at)
      await update($, now, () => at)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await update($, turnStartedAt, () => null)
    await update($, steps, () => [])
    // Nothing outlives its turn, even a call the engine never reported back on.
    await update($, pending, () => [])
    await record($, log => ({ ...log, turns: log.turns + 1 }))
    const usage = await $.session.usage()
    await update($, gauges, () => readGauges(usage))
    await notifyAway($, e.isAborted ? 'Claude stopped.' : 'Claude finished a turn.')

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, gauges, () => readGauges(e))

    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    // Only a real call carries an id; tracked while you are here too, so an absence that
    // starts mid-approval still lists it.
    const id = e.tool_use_id
    if (verdict.decision === 'ask' && id !== undefined) {
      const item = { id, text: `Approve ${describeCall(e.tool, e.input)}` }
      await update($, pending, list => [...list.filter(one => one.id !== id), item])
      await notifyAway($, `Waiting for your OK: ${describeCall(e.tool, e.input)}`)
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const input = callInput(e)
    const id = e.tool_use_id
    const isMainLoop = e.agentId === undefined
    if (isMainLoop) await update($, steps, list => [...list, { id, text: describeCall(e.tool, input) }])
    if (e.tool === 'AskUserQuestion') {
      const item = { id, text: firstQuestion(input) }
      await update($, pending, list => [...list, item])
      await notifyAway($, item.text)
    }
    const isShell = e.tool === 'Bash'
    if (isShell) shellsRunning++
    // Counted until its checkout scan below is done, so a phone coming back meanwhile reconciles.
    try {
      const ran = await next(e)
      // Finished, answered, approved or denied (here or on another surface): no longer
      // running and no longer waiting on you.
      if (isMainLoop) await update($, steps, list => list.filter(one => one.id !== id))
      await update($, pending, list => list.filter(one => one.id !== id))
      const isDenied = 'deny' in ran && ran.deny !== undefined
      if (isDenied) return ran
      const isFailed = ran.isError === true

      const command = field(input, 'command')
      if (e.tool === 'Bash' && command !== undefined && isTestCommand(command)) {
        const run = readTestRun(command, outputText('result' in ran ? ran.result : undefined), isFailed)
        await update($, lastTest, () => run)
        await record($, log => ({ ...log, tests: [...log.tests, run] }))
      } else if (isFailed) {
        await record($, log => ({ ...log, errors: log.errors + 1 }))
      }

      const path = field(input, 'file_path') ?? field(input, 'notebook_path')
      if (!isFailed && path !== undefined && WRITE_TOOLS.includes(e.tool)) {
        await record($, log => (log.changed.includes(path) ? log : { ...log, changed: [...log.changed, path] }))
      }
      if (isShell) await recordShellChanges($)

      return ran
    } finally {
      if (isShell) shellsRunning--
    }
  })

  on('ui.render', { component: 'Pane', requestId: AWAY_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const seen = await read($, summary)
    if (seen === null) return <Text dimColor>Nothing happened while you were away.</Text>
    const waiting = await read($, pending)
    const isWide = e.props.bodyColumns >= BREAKPOINT
    const latestTest = seen.tests[seen.tests.length - 1]
    const shown = seen.changed.slice(isWide ? -10 : -4)

    return (
      <Box flexDirection="column" gap="sm">
        <Text bold>Away {duration(seen.until - seen.since)}</Text>
        <Text>
          {seen.turns} turn{seen.turns === 1 ? '' : 's'} finished · {seen.changed.length} file
          {seen.changed.length === 1 ? '' : 's'} changed
          {seen.errors > 0 ? ` · ${seen.errors} error${seen.errors === 1 ? '' : 's'}` : ''}
        </Text>
        {latestTest !== undefined && (
          <Text color={latestTest.isPassing ? 'green' : 'red'}>{testLine(latestTest)}</Text>
        )}
        {waiting.length > 0 && (
          <Box key="waiting" flexDirection="column" borderStyle="round" paddingX="sm">
            <Text bold>Waiting on you</Text>
            {waiting.map(item => (
              <Text key={item.id} wrap="truncate-end">
                {item.text}
              </Text>
            ))}
          </Box>
        )}
        {shown.length > 0 && (
          <Box key="files" flexDirection="column">
            {shown.map(path => (
              <Text key={path} dimColor wrap="truncate-start">
                {isWide ? path : baseName(path)}
              </Text>
            ))}
            {seen.changed.length > shown.length && (
              <Text dimColor>and {seen.changed.length - shown.length} more</Text>
            )}
          </Box>
        )}
        <Box key="actions" flexDirection="row" flexWrap="wrap" gap="sm">
          <Button
            key="review"
            label="Review changes"
            variant="primary"
            onPress={() =>
              void $.prompt
                .submit({ text: reviewPrompt(seen.changed, seen.until - seen.since) })
                .catch(() => undefined)
            }
          />
          <Button key="monitor" label="Monitor" onPress={() => openMonitor($)} />
          <Button
            key="dismiss"
            label="Got it"
            role="dismiss"
            onPress={async () => {
              await update($, summary, () => null)
              await $.ui.close({ id: AWAY_PANE })
            }}
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: MONITOR_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns
    const isWide = columns >= BREAKPOINT
    const startedAt = await read($, turnStartedAt)
    const current = (await read($, steps)).slice(-1)[0]?.text
    const test = await read($, lastTest)
    const meters = await read($, gauges)
    const at = await read($, now)
    // About 7 px a column; unfolded, the gauges sit in the 45% column beside the status.
    const meterColumns = isWide ? Math.floor(columns * 0.45) - 2 : columns
    const width = Math.max(120, Math.min(320, meterColumns * 7))
    // An SVG bar where the surface draws one (not the terminal), else the figure as text.
    const gauge = (key: string, label: string, percent: number) => {
      const alt = `${label} ${Math.round(percent)}%`
      if (e.surface !== 'terminal') {
        const { Svg } = $.ui.resolve(e)
        return <Svg key={key} source={gaugeSvg(label, percent, width)} alt={alt} />
      }
      return (
        <Text key={key} dimColor>
          {alt}
        </Text>
      )
    }

    const status = (
      <Box key="status" flexDirection="column">
        <Text size="title" bold>
          {startedAt === null ? 'Idle' : clock(at - startedAt)}
        </Text>
        <Text dimColor wrap="truncate-end">
          {startedAt === null ? 'Waiting for your next prompt' : (current ?? 'Thinking')}
        </Text>
        {test === null ? (
          <Text dimColor>No test run yet</Text>
        ) : (
          <Text size="heading" color={test.isPassing ? 'green' : 'red'}>
            {testLine(test)}
          </Text>
        )}
      </Box>
    )

    const meterBox = (
      <Box key="meters" flexDirection="column" gap="sm">
        {meters.contextPercent !== null && gauge('context', 'Context', meters.contextPercent)}
        {meters.ratePercent !== null && gauge('rate', 'Rate limit', meters.ratePercent)}
        {meters.costUsd !== null && <Text dimColor>Cost so far ${meters.costUsd.toFixed(2)}</Text>}
      </Box>
    )

    return isWide ? (
      <Box flexDirection="row" gap="md">
        <Box width="55%">{status}</Box>
        <Box width="45%">{meterBox}</Box>
      </Box>
    ) : (
      <Box flexDirection="column" gap="md">
        {status}
        {meterBox}
      </Box>
    )
  })
}
