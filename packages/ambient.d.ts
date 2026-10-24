import type { ReactElement, ReactNode } from 'react'

declare module '@deepseek-ai/dsh-invariants' {
  export type InvariantInstaller = () => void
}

declare module '../../deepseek-harness/vendor/cordis/src/context.ts' {
  interface Context {
    invariants: {
      register(pkg: string, install: () => void): () => void
    }
  }
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface ClientContext {
    effect(fn: () => unknown, label?: string): void
    locale: {
      register(ns: string, dicts: Record<string, unknown>): () => void
    }
    slots: {
      inject(slot: string, fn: () => unknown): void
      register(meta: Record<string, unknown>, component: unknown): unknown
    }
  }
}

declare module '@deepseek-ai/dsh-client-locale/client' {}
declare module '@deepseek-ai/dsh-client-ui-sidebar/client' {}
declare module '@deepseek-ai/dsh-client-ui-layout/client' {}

declare module '@deepseek-ai/dsh-client-ui-tool/client' {
  export interface ToolCallViewProps {
    readonly callId: string
    readonly toolName: string
    readonly block: unknown
    readonly inspect?: () => void
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export type PropsRuntime<Slot extends string = string> =
    Slot extends 'sidebar.footer.action'
      ? { readonly wide?: boolean }
      : Record<string, unknown>

  export type PropsLocale<NS extends string = string> = {
    readonly t: (key: string) => string
    readonly _ns?: NS
  }
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  export function Tooltip(props: {
    readonly label: string
    readonly side?: 'top' | 'right' | 'bottom' | 'left'
    readonly children: ReactNode
  }): ReactElement
}
