import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useToast } from '../lib/toast'
import { fmtClock } from '../lib/format'
import type { AppSettings, Dashboard, Diaper, Feed, Overview, Pump, Weight, WeightStatus } from './types'

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

export function useOverview(enabled = true) {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.get<Overview>('/api/overview'),
    refetchInterval: 60_000,
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
  qc.invalidateQueries({ queryKey: ['diapers'] })
}

type FeedWriteInput = {
  amount_ml: number
  fed_at?: string
  notes?: string
  is_extra?: boolean
  method?: 'bottle' | 'breast'
  duration_min?: number | null
  /** YYYY-MM-DD to set, '' to clear, undefined to leave alone. */
  feeding_day_override?: string | null
}

export function useCreateFeed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: FeedWriteInput) => api.post<Feed>('/api/feeds', input),
    onSuccess: (feed) => {
      invalidateAll(qc)
      const label = feed.method === 'breast' ? 'Breastfeed' : 'Feed'
      toast.success(`${label} saved · ${feed.amount_ml.toFixed(0)} ml`)
    },
  })
}

export function usePatchFeed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number } & FeedWriteInput) =>
      api.patch(`/api/feeds/${id}`, rest),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Feed updated')
    },
  })
}

/** Delete takes the full Feed object so the undo toast can re-create it. */
export function useDeleteFeed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (feed: Feed) => {
      await api.del(`/api/feeds/${feed.id}`)
      return feed
    },
    onSuccess: (feed) => {
      invalidateAll(qc)
      toast.undo(
        `Feed deleted · ${feed.amount_ml.toFixed(0)} ml at ${fmtClock(feed.fed_at)}`,
        async () => {
          await api.post('/api/feeds', {
            amount_ml: feed.amount_ml,
            fed_at: feed.fed_at,
            notes: feed.notes ?? '',
            is_extra: feed.is_extra,
            method: feed.method,
            duration_min: feed.duration_min,
            feeding_day_override: feed.feeding_day_override ?? undefined,
          })
          invalidateAll(qc)
        },
      )
    },
  })
}

export function useCreatePump() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { amount_ml: number; pumped_at?: string; notes?: string }) =>
      api.post<Pump>('/api/pumps', input),
    onSuccess: (pump) => {
      invalidateAll(qc)
      toast.success(`Pump saved · ${pump.amount_ml.toFixed(0)} ml`)
    },
  })
}

export function usePatchPump() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; amount_ml?: number; pumped_at?: string; notes?: string }) =>
      api.patch(`/api/pumps/${id}`, rest),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Pump updated')
    },
  })
}

export function useDeletePump() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (pump: Pump) => {
      await api.del(`/api/pumps/${pump.id}`)
      return pump
    },
    onSuccess: (pump) => {
      invalidateAll(qc)
      toast.undo(
        `Pump deleted · ${pump.amount_ml.toFixed(0)} ml at ${fmtClock(pump.pumped_at)}`,
        async () => {
          await api.post('/api/pumps', {
            amount_ml: pump.amount_ml,
            pumped_at: pump.pumped_at,
            notes: pump.notes ?? '',
          })
          invalidateAll(qc)
        },
      )
    },
  })
}

export function useSetWeight() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { weight_grams: number; ml_per_kg_per_day: number; notes?: string }) =>
      api.post<Weight>('/api/weight', input),
    onSuccess: (w) => {
      invalidateAll(qc)
      toast.success(`Weight saved · ${w.weight_grams} g`)
    },
  })
}

export function usePatchWeight() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; weight_grams?: number; ml_per_kg_per_day?: number; recorded_at?: string; notes?: string }) =>
      api.patch(`/api/weight/${id}`, rest),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Weight updated')
    },
  })
}

export function useDeleteWeight() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (entry: Weight) => {
      await api.del(`/api/weight/${entry.id}`)
      return entry
    },
    onSuccess: (entry) => {
      invalidateAll(qc)
      toast.undo(
        `Weight deleted · ${entry.weight_grams} g`,
        async () => {
          await api.post('/api/weight', {
            weight_grams: entry.weight_grams,
            ml_per_kg_per_day: entry.ml_per_kg_per_day,
            notes: entry.notes ?? undefined,
          })
          invalidateAll(qc)
        },
      )
    },
  })
}

export function useDiapers(days = 7) {
  return useQuery({
    queryKey: ['diapers', days],
    queryFn: () => api.get<Diaper[]>(`/api/diapers?days=${days}`),
    refetchInterval: 30_000,
  })
}

export function useCreateDiaper() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { kind: 'wet' | 'dirty'; recorded_at?: string; notes?: string }) =>
      api.post<Diaper>('/api/diapers', input),
    onSuccess: (d) => {
      invalidateAll(qc)
      toast.success(`${d.kind === 'wet' ? 'Wet' : 'Dirty'} diaper logged`)
    },
  })
}

export function usePatchDiaper() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; recorded_at?: string; kind?: 'wet' | 'dirty'; notes?: string }) =>
      api.patch(`/api/diapers/${id}`, rest),
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Diaper updated')
    },
  })
}

export function useDeleteDiaper() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (diaper: Diaper) => {
      await api.del(`/api/diapers/${diaper.id}`)
      return diaper
    },
    onSuccess: (d) => {
      invalidateAll(qc)
      const label = d.kind === 'wet' ? 'Wet' : 'Dirty'
      toast.undo(
        `${label} diaper removed`,
        async () => {
          await api.post('/api/diapers', {
            kind: d.kind,
            recorded_at: d.recorded_at,
            notes: d.notes ?? undefined,
          })
          invalidateAll(qc)
        },
      )
    },
  })
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettings>('/api/settings'),
    staleTime: 60_000,
  })
}

export function useUpdateAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<AppSettings>) => api.patch<AppSettings>('/api/settings', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
