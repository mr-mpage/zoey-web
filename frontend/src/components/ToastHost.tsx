import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type Toast, type ToastApi } from '../lib/toast'

const SUCCESS_MS = 2200
const UNDO_MS = 5000

/** Wrap the app so descendants can call useToast(). Renders the visual
 *  host pinned above the tab bar with a stack of recent toasts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Record<number, number>>({})

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const handle = timersRef.current[id]
    if (handle) {
      window.clearTimeout(handle)
      delete timersRef.current[id]
    }
  }, [])

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    idRef.current += 1
    const id = idRef.current
    setToasts((t) => [...t, { ...toast, id }])
    const ttl = toast.kind === 'undo' ? UNDO_MS : SUCCESS_MS
    timersRef.current[id] = window.setTimeout(() => dismiss(id), ttl)
  }, [dismiss])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push({ kind: 'success', message }),
      undo: (message, onUndo) => push({ kind: 'undo', message, onUndo }),
    }),
    [push],
  )

  const handleUndo = async (t: Toast) => {
    if (!t.onUndo) return
    dismiss(t.id)
    try {
      await t.onUndo()
    } catch {
      // Swallow — caller's mutation will surface its own error if needed.
    }
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="absolute left-0 right-0 z-50 px-4 max-w-xl mx-auto flex flex-col items-center gap-2 pointer-events-none"
        // Above the tab bar (~56-60px) plus a margin. Absolute against
        // #root, which is sized to the live VisualViewport — fixed
        // positioning would inherit iOS's stale viewport report.
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        {toasts.map((t) => {
          const isUndo = t.kind === 'undo'
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg flex items-center gap-3 max-w-full animate-toast-pop ${
                isUndo
                  ? 'bg-zinc-900 border-amber-500/30'
                  : 'bg-zinc-900 border-emerald-500/30'
              }`}
            >
              <span className="text-zinc-100 truncate">{t.message}</span>
              {isUndo && (
                <button
                  onClick={() => handleUndo(t)}
                  className="ml-1 px-2 py-1 -my-1 rounded-md text-amber-300 text-xs font-medium uppercase tracking-wider"
                >
                  Undo
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-zinc-500 text-xl leading-none -my-1 -mr-1 px-1"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
