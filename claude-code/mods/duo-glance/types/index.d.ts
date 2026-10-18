export type TestRun = { command: string; isPassing: boolean; passed: number | null; failed: number | null }

// One line about a tool call, keyed by its id: something waiting on you, or a step in progress.
export type CallLine = { id: string; text: string }

export type Away = {
  since: number
  turns: number
  changed: string[]
  tests: TestRun[]
  errors: number
}

export type Gauges = { contextPercent: number | null; ratePercent: number | null; costUsd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'duo-glance': {
      isPhone: boolean
      away: Away | null
      summary: (Away & { until: number }) | null
      // Approvals and questions still open, kept whether or not the phone is away.
      pending: CallLine[]
      // Main-loop tool calls running now, oldest first.
      steps: CallLine[]
      turnStartedAt: number | null
      lastTest: TestRun | null
      gauges: Gauges
      isMonitorOpen: boolean
      now: number
    }
  }
}
