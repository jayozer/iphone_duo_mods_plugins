export type TestRun = { command: string; isPassing: boolean; passed: number | null; failed: number | null }

// Something that needed you, keyed by the tool call that raised it.
export type Waiting = { id: string; text: string }

export type Away = {
  since: number
  turns: number
  changed: string[]
  tests: TestRun[]
  errors: number
  waiting: Waiting[]
}

export type Gauges = { contextPercent: number | null; ratePercent: number | null; costUsd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'duo-glance': {
      isPhone: boolean
      away: Away | null
      summary: (Away & { until: number }) | null
      step: string | null
      turnStartedAt: number | null
      lastTest: TestRun | null
      gauges: Gauges
      isMonitorOpen: boolean
      now: number
    }
  }
}
