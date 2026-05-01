import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useToast } from '../lib/toast'
import { fmtClock } from '../lib/format'
import type {
  AppSettings,
  Dashboard,
  Diaper,
  Feed,
  Med,
  MedDoseWithMed,
  MedsToday,
  Overview,
  Pump,
  Weight,
  WeightStatus,
} from './types'

export type AuthState = {
  authenticated: boolean
  mode?: 'edit' | 'view'
  label?: string | null
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: () => api.get<AuthState>('/api/auth/me'),
    staleTime: 30_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (passcode: string) => api.post<AuthState>('/api/auth/login', { passcode }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth'] }),
  })
}

export type ViewerPasscode = {
  id: number
  label: string
  last_seen_at: string | null
  created_at: string
}

export function useViewerPasscodes() {
  return useQuery({
    queryKey: ['viewer-passcodes'],
    queryFn: () => api.get<ViewerPasscode[]>('/api/auth/viewer-passcodes'),
    refetchInterval: 60_000,
  })
}

export function useCreateViewerPasscode() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { label: string; passcode: string }) =>
      api.post<ViewerPasscode>('/api/auth/viewer-passcodes', input),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['viewer-passcodes'] })
      toast.success(`Viewer "${v.label}" added`)
    },
  })
}

export function useDeleteViewerPasscode() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (v: ViewerPasscode) => api.del(`/api/auth/viewer-passcodes/${v.id}`).then(() => v),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['viewer-passcodes'] })
      toast.success(`Viewer "${v.label}" removed`)
    },
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

export type VitalsDay = {
  feeding_day: string
  hr_avg: number | null
  hr_min: number | null
  hr_max: number | null
  spo2_avg: number | null
  spo2_min_avg10: number | null
  monitoring_minutes: number
  session_count: number
  low_spo2_alert_count: number
  sample_count: number
}

export type VitalsSummary = {
  days: VitalsDay[]
  configured: boolean
}

export function useVitalsSummary(days = 7) {
  return useQuery({
    queryKey: ['vitals', days],
    queryFn: () => api.get<VitalsSummary>(`/api/vitals/summary?days=${days}`),
    refetchInterval: 5 * 60_000,
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

// --- Meds -----------------------------------------------------------------

function invalidateMeds(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['meds'] })
  qc.invalidateQueries({ queryKey: ['meds', 'today'] })
  qc.invalidateQueries({ queryKey: ['meds', 'doses'] })
}

export function useMeds() {
  return useQuery({
    queryKey: ['meds'],
    queryFn: () => api.get<Med[]>('/api/meds'),
    staleTime: 60_000,
  })
}

export function useMedsToday() {
  return useQuery({
    queryKey: ['meds', 'today'],
    queryFn: () => api.get<MedsToday>('/api/meds/today'),
    refetchInterval: 60_000,
  })
}

export function useMedDoses(days = 14) {
  return useQuery({
    queryKey: ['meds', 'doses', days],
    queryFn: () => api.get<MedDoseWithMed[]>(`/api/meds/doses?days=${days}`),
  })
}

export function useCreateMed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { name: string; doses_per_day: number; sort_order?: number }) =>
      api.post<Med>('/api/meds', input),
    onSuccess: (m) => {
      invalidateMeds(qc)
      toast.success(`"${m.name}" added`)
    },
  })
}

export function usePatchMed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; name?: string; doses_per_day?: number; sort_order?: number; archived?: boolean }) =>
      api.patch<Med>(`/api/meds/${id}`, rest),
    onSuccess: (m) => {
      invalidateMeds(qc)
      toast.success(`"${m.name}" updated`)
    },
  })
}

export function useArchiveMed() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (med: Med) => {
      await api.del(`/api/meds/${med.id}`)
      return med
    },
    onSuccess: (m) => {
      invalidateMeds(qc)
      toast.undo(
        `"${m.name}" archived`,
        async () => {
          await api.patch(`/api/meds/${m.id}`, { archived: false })
          invalidateMeds(qc)
        },
      )
    },
  })
}

export function useCreateMedDose() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: { med_id?: number | null; name?: string; given_at?: string; notes?: string; feeding_day_override?: string | null }) =>
      api.post<MedDoseWithMed>('/api/meds/doses', input),
    onSuccess: (d) => {
      invalidateMeds(qc)
      const t = fmtClock(d.given_at)
      toast.success(`${d.name} logged · ${t}`)
    },
  })
}

export function usePatchMedDose() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: number; given_at?: string; notes?: string; feeding_day_override?: string | null }) =>
      api.patch<MedDoseWithMed>(`/api/meds/doses/${id}`, rest),
    onSuccess: () => {
      invalidateMeds(qc)
      toast.success('Dose updated')
    },
  })
}

export function useDeleteMedDose() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (dose: MedDoseWithMed) => {
      await api.del(`/api/meds/doses/${dose.id}`)
      return dose
    },
    onSuccess: (d) => {
      invalidateMeds(qc)
      toast.undo(
        `${d.name} removed`,
        async () => {
          await api.post('/api/meds/doses', {
            med_id: d.med_id,
            name: d.med_id ? undefined : d.name,
            given_at: d.given_at,
            notes: d.notes ?? undefined,
            feeding_day_override: d.feeding_day_override ?? undefined,
          })
          invalidateMeds(qc)
        },
      )
    },
  })
}
