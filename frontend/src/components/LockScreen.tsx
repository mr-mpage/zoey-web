import { useEffect, useState } from 'react'
import { useLogin } from '../api/hooks'
import { ApiError } from '../api/client'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function LockScreen() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const login = useLogin()

  useEffect(() => {
    if (pin.length !== 6) return
    setError(null)
    login.mutate(pin, {
      onError: (e) => {
        const msg = e instanceof ApiError ? e.message : 'Login failed'
        setError(msg)
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 400)
      },
    })
  }, [pin, login])

  const tap = (k: string) => {
    if (login.isPending) return
    if (k === 'del') setPin((p) => p.slice(0, -1))
    else if (k && pin.length < 6) setPin((p) => p + k)
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 select-none">
      <div className="text-center mb-10">
        <div className="text-pink-200/90 text-3xl font-light tracking-wide">Zoey</div>
        <div className="text-zinc-500 text-sm mt-1">Enter passcode</div>
      </div>
      <div className={`flex gap-3 mb-12 ${shake ? 'animate-shake' : ''}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border ${
              i < pin.length ? 'bg-pink-200 border-pink-200' : 'border-zinc-600'
            } ${error ? 'border-rose-500' : ''}`}
          />
        ))}
      </div>
      {error && <div className="text-rose-400 text-sm mb-4 h-5">{error}</div>}
      {!error && <div className="h-5 mb-4" />}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {KEYS.map((k, idx) => (
          <button
            key={idx}
            onClick={() => tap(k)}
            disabled={!k && k !== ''}
            className={`h-16 rounded-full text-2xl font-light transition active:scale-95 ${
              k === ''
                ? 'invisible'
                : k === 'del'
                ? 'text-zinc-400 active:bg-zinc-800'
                : 'bg-zinc-900/80 active:bg-zinc-800 text-zinc-100'
            }`}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
