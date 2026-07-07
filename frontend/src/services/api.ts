import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import type {
  User, Tournament, Court, Match, Event, MatchState, Player,
  CreateMatchPayload, DisplayLayoutPayload, TimeoutPayload,
  SubstitutionPayload, ScorePayload, PlayerInput, DeviceInfo, ServerInfo,
  DisplayAsset,
} from '@/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const login = (email: string, password: string) =>
  api.post<{ token: string; user: User }>('/auth/login', { email, password }).then((r) => r.data)

export const getMe = () => api.get<User>('/auth/me').then((r) => r.data)

export const createUser = (data: {
  email: string; password: string; name?: string; role: string
}) => api.post<User>('/users', data).then((r) => r.data)

export const listUsers = () => api.get<User[]>('/users').then((r) => r.data)

export const updateUser = (id: string, data: {
  email?: string; password?: string; name?: string; role?: string
}) => api.put(`/users/${id}`, data)

export const deleteUser = (id: string) => api.delete(`/users/${id}`)

// Tournaments
export const listTournaments = () => api.get<Tournament[]>('/tournaments').then((r) => r.data)
export const getTournament = (id: string) => api.get<Tournament>(`/tournaments/${id}`).then((r) => r.data)
export const createTournament = (data: { name: string; sport?: string }) =>
  api.post<Tournament>('/tournaments', data).then((r) => r.data)
export const updateTournamentStatus = (id: string, status: string) =>
  api.patch(`/tournaments/${id}/status`, { status })

// Courts
export const listCourts = (tournamentId?: string) =>
  api.get<Court[]>('/courts', { params: tournamentId ? { tournament_id: tournamentId } : {} }).then((r) => r.data)
export const createCourt = (data: { name: string; tournament_id: string }) =>
  api.post<Court>('/courts', data).then((r) => r.data)
export const assignScorer = (courtId: string, userId: string) =>
  api.post(`/courts/${courtId}/scorers`, { user_id: userId })

// Matches
export const updateMatchStatus = (matchId: string, status: string) =>
  api.patch(`/matches/${matchId}/status`, { status })

export const deleteMatch = (matchId: string) =>
  api.delete(`/matches/${matchId}`)

export const listMatches = (tournamentId?: string) =>
  api.get<Match[]>('/matches', { params: tournamentId ? { tournament_id: tournamentId } : {} }).then((r) => r.data)
export const getMatch = (id: string) =>
  api.get<{ match: Match; state: MatchState }>(`/matches/${id}`).then((r) => r.data)
export const createMatch = (data: CreateMatchPayload & { players_a?: PlayerInput[]; players_b?: PlayerInput[] }) =>
  api.post<Match>('/matches', data).then((r) => r.data)

export const getMatchPlayers = (matchId: string) =>
  api.get<Player[]>(`/matches/${matchId}/players`).then((r) => r.data)

export const setMatchPlayers = (matchId: string, players_a: PlayerInput[], players_b: PlayerInput[]) =>
  api.put(`/matches/${matchId}/players`, { players_a, players_b })

export const getServerInfo = () => api.get<ServerInfo>('/server-info').then((r) => r.data)

export const uploadTeamLogo = async (file: File): Promise<string> => {
  const form = new FormData()
  form.append('logo', file)
  const r = await api.post<{ url: string }>('/upload/team-logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return r.data.url
}
export const listDevices   = () => api.get<DeviceInfo[]>('/devices').then((r) => r.data)

// Image OR video upload (sponsor cards / banners)
export const uploadMedia = async (file: File): Promise<{ url: string; is_video: boolean }> => {
  const form = new FormData()
  form.append('file', file)
  const r = await api.post<{ url: string; is_video: boolean }>('/upload/media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return r.data
}

// Events
export const listEvents = (matchId: string) =>
  api.get<Event[]>(`/matches/${matchId}/events`).then((r) => r.data)

export const createEvent = (matchId: string, type: string, payload: Record<string, unknown> = {}) =>
  api.post<Event>(`/matches/${matchId}/events`, { type, payload }).then((r) => r.data)

export const undoEvent = (eventId: string) => api.post(`/events/${eventId}/undo`)
export const redoEvent = (eventId: string) => api.post(`/events/${eventId}/redo`)

// Score shortcuts
export const addScore = (matchId: string, team: 'A' | 'B', points: number) =>
  createEvent(matchId, 'score_update', { team, points } satisfies ScorePayload)

export const removeScore = (matchId: string, team: 'A' | 'B', points: number) =>
  createEvent(matchId, 'score_remove', { team, points } satisfies ScorePayload)

export const startMatch = (matchId: string) => createEvent(matchId, 'match_start')
export const endMatch = (matchId: string) => createEvent(matchId, 'match_end')
export const startTimer = (matchId: string) => createEvent(matchId, 'timer_start')
export const pauseTimer = (matchId: string) => createEvent(matchId, 'timer_pause')

export const startTimeout = (matchId: string, payload: TimeoutPayload) =>
  createEvent(matchId, 'timeout_start', payload as unknown as Record<string, unknown>)

export const endTimeout = (matchId: string) => createEvent(matchId, 'timeout_end')

export const createSubstitution = (matchId: string, payload: SubstitutionPayload) =>
  createEvent(matchId, 'substitution', payload as unknown as Record<string, unknown>)

// Sponsor / announcement library
export const listDisplayAssets = () =>
  api.get<DisplayAsset[]>('/display-assets').then((r) => r.data)

export const createDisplayAsset = (data: {
  type: 'sponsor' | 'announcement'
  title?: string
  body?: string
  image_url?: string
  duration?: number
}) => api.post<DisplayAsset>('/display-assets', data).then((r) => r.data)

export const deleteDisplayAsset = (id: string) =>
  api.delete(`/display-assets/${id}`)

export const showDisplayAsset = (id: string) =>
  api.post(`/display-assets/${id}/show`)

// Announcements & Display
export const announce = (message: string, duration = 10) =>
  api.post('/announce', { message, duration })

export const setDisplayLayout = (layout: DisplayLayoutPayload) =>
  api.post('/display/layout', layout)

export const getDisplayBackground = () =>
  api.get<{ background_url: string }>('/display/background').then((r) => r.data.background_url)

export const setDisplayBackground = (background_url: string) =>
  api.post('/display/background', { background_url })

export default api
