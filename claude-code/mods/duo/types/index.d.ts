export type DuoMode = 'auto' | 'on' | 'off'
export type Risk = 'read' | 'write' | 'danger' | 'other'
export type Activity = {
  id: string
  tool: string
  summary: string
  status: 'running' | 'done' | 'error'
}
export type Pending = { id: string; tool: string; summary: string; risk: Risk }

declare module 'claude-code' {
  interface PluginState {
    duo: {
      mode: DuoMode
      isPhone: boolean
      breakpoint: number
      turnId: string | null
      activity: Activity[]
      changed: string[]
      pending: Pending | null
      isAutoReads: boolean
    }
  }
}
