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
      // The last prompt or /duo command you sent came from the Claude app over Remote Control, which
      // relays text but never attaches as a surface.
      isFromApp: boolean
      // Where the last prompt.submit came from (its origin kind), shown by /duo status.
      lastOrigin: string | null
      breakpoint: number
      turnId: string | null
      activity: Activity[]
      changed: string[]
      pending: Pending | null
      isAutoReads: boolean
    }
  }
}
