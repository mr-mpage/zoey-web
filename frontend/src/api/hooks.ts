import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Dashboard, Feed, Pump, Weight, WeightStatus } from './types'

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: () => api.get<{ authenticated: boolean }>('/api/auth/me'),
    staleTime: 30_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (passcode: string) => api.post<{ authenticated: boolean }>('/api/auth/login', { passcode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/api/dashboard'),
    refetchInterval: 10_000,
    enabled,
  })
}

export function useFeeds(days = 7) {
  return useQuery({
    queryKey: ['feeds', days],
    queryFn: () => api.get<Feed[]>(`/api/feeds?days=${days}`),
    refetchInterval: 30_000,
  })
}

export function usePumps(days = 7) {
  return useQuery({
    queryKey: ['pumps', days],
    queryFn: () => api.get<Pump[]>(`/api/pumps?days=${days}`),
    refetchInterval: 30_000,
  })
}

export function useWeight() {
  return useQuery({
    queryKey: ['weight'],
    queryFn: () => api.get<WeightStatus>('/api/weight'),
  })
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['feeds'] })
  qc.invalidateQueries({ queryKey: ['pumps'] })
  qc.invalidateQueries({ queryKey: ['weight'] })
}

export function useCreateFeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { amount_ml: number; fed_at?: string; notes?: string }) =>
      api.post<Feed>('/api/feeds', input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePatchFeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; amount_ml?: number; fed_at?: string; notes?: string }) =>
      api.patch(`/api/feeds/${id}`, rest),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteFeed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/feeds/${id}`),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCreatePump() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { amount_ml: number; pumped_at?: string; notes?: string }) =>
      api.post<Pump>('/api/pumps', input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function usePatchPump() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; amount_ml?: number; pumped_at?: string; notes?: string }) =>
      api.patch(`/api/pumps/${id}`, rest),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeletePump() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/pumps/${id}`),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useSetWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { weight_grams: number; ml_per_kg_per_day: number; notes?: string }) =>
      api.post<Weight>('/api/weight', input),
    onSuccess: () => invalidateAll(qc),
  })
}
