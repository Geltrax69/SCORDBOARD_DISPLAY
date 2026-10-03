export type Role = 'owner' | 'super_admin' | 'scorer' | 'display'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  match_count?: number
  created_at: string
  updated_at: string
}

/** Event format — decides how many rounds a match is played over. */
export type EventFormat = 'regu' | 'double' | 'quad'

export interface Tournament {
  id: string
  name: string
  sport: string
  event_type: EventFormat
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
  event_type: EventFormat
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
  timeout_remaining?: number
  break_remaining?: number
  winner?: string
  // Sepak takraw
  sets_a: number
  sets_b: number
  set_number: number
  completed_sets: [number, number][]
  serving: 'A' | 'B' | ''
  set_point?: 'A' | 'B'
  match_point?: 'A' | 'B'
  deuce?: boolean
  last_set_winner?: 'A' | 'B'
  // Rounds — sets above are scoped to the CURRENT round.
  event_type: EventFormat
  round_number: number
  total_rounds: number
  rounds_a: number
  rounds_b: number
  completed_rounds: [number, number][]
  awaiting_round: boolean
  round_point?: 'A' | 'B'
}

export type EventType =
  | 'score_update'
  | 'score_remove'
  | 'match_start'
  | 'match_end'
  | 'status_change'
  | 'serve_set'
  | 'round_start'
  | 'timer_start'
  | 'timer_pause'
  | 'timeout_start'
  | 'timeout_end'
  | 'substitution'
  | 'announcement'
  | 'display_layout_change'
  | 'sponsor_show'
  | 'display_background'
  | 'display_style'
  | 'display_identify'
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
  image_url?: string
  title?: string
}

export interface SponsorPayload {
  title: string
  image_url: string
  duration: number
}

export interface DisplayLayoutPayload {
  mode: 1 | 2 | 3 | 4 | 5
  match_ids: string[]
  show_player_animation?: boolean
  /** Screen the layout belongs to (set by the server on pushes). */
  screen?: string
  /** True when court-follow switched the match, not the admin. */
  auto?: boolean
}

/** One TV, opened once at /display?screen=<slug> and controlled on its own. */
export interface DisplayScreen {
  slug: string
  name: string
  mode: 1 | 2 | 3 | 4 | 5
  match_ids: string[]
  show_player_animation: boolean
  /** Court this screen follows ('' = matches picked by hand). */
  follow_court_id: string
  /** Displays currently connected to this screen. */
  online: number
  updated_at: string
}

export interface DisplayAsset {
  id: string
  type: 'sponsor' | 'announcement'
  title: string
  body: string
  image_url: string
  duration: number
  created_at: string
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
    image_url?: string
    title?: string
    mode?: number
    match_ids?: string[]
    user_id?: string
    role?: string
  }
}

/** Registration data imported from the player spreadsheet. */
export interface PlayerProfile {
  player_code?: string
  category?: string
  date_of_birth?: string
  age?: number
  district_games?: number
  state_games?: number
  national_games?: number
  international_games?: number
}

export interface PlayerInput extends PlayerProfile {
  name: string
  gender?: string
  jersey_number: number
  status: 'playing' | 'sub'
  photo_url: string
}

export interface Player {
  id: string
  match_id: string
  team: 'A' | 'B'
  name: string
  gender: string
  jersey_number: number
  status: 'playing' | 'sub'
  photo_url: string
  created_at: string
}

export interface TeamPlayer extends PlayerProfile {
  id: string
  team_id: string
  name: string
  gender: string
  jersey_number: number
  status: 'playing' | 'sub'
  photo_url: string
}

/** A saved roster template, reused when creating matches. */
export interface Team {
  id: string
  name: string
  color: string
  logo_url: string
  created_at: string
  updated_at: string
  players: TeamPlayer[]
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
