export type Role = 'super_admin' | 'scorer' | 'display'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  created_at: string
  updated_at: string
}

export interface Tournament {
  id: string
  name: string
  sport: string
  status: 'active' | 'completed' | 'cancelled'
  created_by: string
  created_at: string
  updated_at: string
}

export interface Court {
  id: string
  name: string
  tournament_id: string
  created_at: string
}

export interface Match {
  id: string
  court_id: string
  tournament_id: string
  team_a: string
  team_b: string
  team_a_color: string
  team_b_color: string
  team_a_logo: string
  team_b_logo: string
  match_code: string
  status: 'pending' | 'active' | 'paused' | 'timeout' | 'completed' | 'cancelled'
  timer_seconds: number
  timer_running: boolean
  timer_started_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  score_a: number
  score_b: number
  court_name?: string
  tournament_name?: string
}

export interface MatchState {
  score_a: number
  score_b: number
  status: string
  timer_seconds: number
  timer_running: boolean
  current_timeout?: TimeoutPayload
  winner?: string
}

export type EventType =
  | 'score_update'
  | 'score_remove'
  | 'match_start'
  | 'match_end'
  | 'timer_start'
  | 'timer_pause'
  | 'timeout_start'
  | 'timeout_end'
  | 'substitution'
  | 'announcement'
  | 'display_layout_change'
  | 'connected'

export interface Event {
  id: string
  match_id: string
  type: EventType
  payload: Record<string, unknown>
  created_by: string
  created_by_name?: string
  created_at: string
  undone: boolean
  undone_at?: string
  undone_by?: string
  sequence: number
}

export interface ScorePayload {
  team: 'A' | 'B'
  points: number
}

export interface TimeoutPayload {
  team: 'A' | 'B'
  duration: number
  reason: string
}

export interface SubstitutionPayload {
  team: 'A' | 'B'
  player_out: string
  player_in: string
  number: number
}

export interface AnnouncementPayload {
  message: string
  duration: number
}

export interface DisplayLayoutPayload {
  mode: 1 | 2 | 3 | 4 | 5
  match_ids: string[]
}

export interface WSMessage {
  type: EventType | 'connected'
  match_id?: string
  payload: {
    match?: Match
    event?: Event
    state?: MatchState
    message?: string
    duration?: number
    mode?: number
    match_ids?: string[]
    user_id?: string
    role?: string
  }
}

export interface PlayerInput {
  name: string
  jersey_number: number
  status: 'playing' | 'sub'
  photo_url: string
}

export interface Player {
  id: string
  match_id: string
  team: 'A' | 'B'
  name: string
  jersey_number: number
  status: 'playing' | 'sub'
  photo_url: string
  created_at: string
}

export interface DeviceInfo {
  id: string
  device_name: string
  ip_address: string
  match_id: string
  match_code: string
  match_name: string
  role: string
  connected_at: string
  last_seen: string
  online: boolean
}

export interface ServerInfo {
  local_ip: string
  port: string
  connect_url: string
  display_url: string
  connected_devices: number
}

export interface CreateMatchPayload {
  court_id: string
  tournament_id: string
  team_a: string
  team_b: string
  team_a_color: string
  team_b_color: string
}

export interface DisplayMode {
  mode: 1 | 2 | 3 | 4 | 5
  matchIds: string[]
}
