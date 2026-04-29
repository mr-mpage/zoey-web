import { createContext, useContext } from 'react'

export type AuthModeValue = {
  mode: 'edit' | 'view'
  label: string | null
}

export const AuthModeContext = createContext<AuthModeValue>({ mode: 'edit', label: null })

export function useAuthMode(): AuthModeValue {
  return useContext(AuthModeContext)
}

export function useIsReadOnly(): boolean {
  return useAuthMode().mode === 'view'
}
