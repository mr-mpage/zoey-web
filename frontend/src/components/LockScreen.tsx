import { useRef, useState } from 'react'
import { useLogin } from '../api/hooks'
import { ApiError } from '../api/client'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'ok', '0', 'del'] as const

const MIN_LEN = 4
const AUTO_SUBMIT_LEN = 6
const MAX_LEN = 12

export function LockScreen() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const submittingRef = useRef(false)
  const login = useLogin()

  const submit = (code: string) => {
    if (submittingRef.current) return
    if (code.length < MIN_LEN) return
    submittingRef.current = true
    setError(null)
    login.mutate(code, {
      onError: (e) => {
        const msg = e instanceof ApiError ? e.message : 'Login failed'
        setError(msg)
        setShake(true)
        setPin('')
        submittingRef.current = false
        setTimeout(() => setShake(false), 400)
      },
      onSuccess: () => {
        // ref stays true; component will unmount when auth flips.
      },
    })
  }

  const tap = (k: string) => {
    if (submittingRef.current || login.isPending) return
    if (k === 'del') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (k === 'ok') {
      submit(pin)
      return
    }
    if (!k) return
    if (pin.length >= MAX_LEN) return
    const next = pin + k
    setPin(next)
    // Auto-submit at the canonical 6 to keep the fast one-handed UX.
    // Shorter or longer codes need an explicit OK tap.
    if (next.length === AUTO_SUBMIT_LEN) submit(next)
  }

  const busy = login.isPending || submittingRef.current
  const okEnabled = !busy && pin.length >= MIN_LEN

  // Dot indicator: always show at least 4 placeholders, grow as the user
  // types. Caps visually at 8 for layout sanity (the underlying pin can
  // still go longer).
  const dotCount = Math.max(4, Math.min(8, pin.length))

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="text-center mb-10">
        <div className="text-pink-200/90 text-3xl font-light tracking-wide">Zoey</div>
        <div className="text-zinc-500 text-sm mt-1">{busy ? 'Checking…' : 'Enter passcode'}</div>
      </div>
      <div className={`flex gap-3 mb-12 ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border ${
              i < pin.length ? 'bg-pink-200 border-pink-200' : 'border-zinc-600'
            } ${error ? 'border-rose-500' : ''}`}
          />
        ))}
      </div>
      <div className="text-rose-400 text-sm mb-4 h-5">{error ?? ''}</div>
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {KEYS.map((k, idx) => {
          const isOk = k === 'ok'
          const isDel = k === 'del'
          const disabled = busy || (isOk && !okEnabled) || (!isOk && !isDel && !k)
          return (
            <button
              key={idx}
              onClick={() => tap(k)}
              disabled={disabled}
              aria-label={isOk ? 'Sign in' : isDel ? 'Delete' : `Digit ${k}`}
              className={`h-16 rounded-full text-2xl font-light transition active:scale-95 disabled:opacity-30 ${
                isOk
                  ? okEnabled
                    ? 'bg-pink-300 text-zinc-900'
                    : 'bg-zinc-900/40 text-zinc-600'
                  : isDel
                    ? 'text-zinc-400 active:bg-zinc-800'
                    : 'bg-zinc-900/80 active:bg-zinc-800 text-zinc-100'
              }`}
            >
              {isOk ? '✓' : isDel ? '⌫' : k}
            </button>
          )
        })}
      </div>
      <div className="mt-10 text-[10px] text-zinc-600">© {new Date().getFullYear()} The Page Family</div>
    </div>
  )
}
