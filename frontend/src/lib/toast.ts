import { createContext, useContext } from 'react'

export type Toast = {
  id: number
  kind: 'success' | 'undo'
  message: string
  /** Only set on undo toasts. Tapping Undo invokes this and dismisses. */
  onUndo?: () => void | Promise<void>
}

export type ToastApi = {
  success: (message: string) => void
  undo: (message: string, onUndo: () => void | Promise<void>) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Returns the toast API. Falls back to a silent no-op when no provider is
 *  mounted (e.g. before auth, or in test/storybook contexts), so callers
 *  don't need to null-check. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) return { success: () => {}, undo: () => {} }
  return ctx
}
