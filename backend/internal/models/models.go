package models

import (
	"encoding/json"
	"time"
)

type Role string

const (
	RoleSuperAdmin Role = "super_admin"
	RoleScorer     Role = "scorer"
	RoleDisplay    Role = "display"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Name         string    `json:"name"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Tournament struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Sport     string    `json:"sport"`
	Status    string    `json:"status"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Court struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	TournamentID string    `json:"tournament_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type Match struct {
	ID             string     `json:"id"`
	CourtID        string     `json:"court_id"`
	TournamentID   string     `json:"tournament_id"`
	TeamA          string     `json:"team_a"`
	TeamB          string     `json:"team_b"`
	TeamAColor     string     `json:"team_a_color"`
	TeamBColor     string     `json:"team_b_color"`
	TeamALogo      string     `json:"team_a_logo"`
	TeamBLogo      string     `json:"team_b_logo"`
	MatchCode      string     `json:"match_code"`
	Status         string     `json:"status"`
	TimerSeconds   int        `json:"timer_seconds"`
	TimerRunning   bool       `json:"timer_running"`
	TimerStartedAt *time.Time `json:"timer_started_at"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`

	// Calculated from events
	ScoreA int `json:"score_a"`
	ScoreB int `json:"score_b"`

	// Joined
	CourtName      string `json:"court_name,omitempty"`
	TournamentName string `json:"tournament_name,omitempty"`
}

type Player struct {
	ID           string    `json:"id"`
	MatchID      string    `json:"match_id"`
	Team         string    `json:"team"`
	Name         string    `json:"name"`
	JerseyNumber int       `json:"jersey_number"`
	Status       string    `json:"status"` // "playing" | "sub"
	PhotoURL     string    `json:"photo_url"`
	CreatedAt    time.Time `json:"created_at"`
}

type PlayerInput struct {
	Name         string `json:"name"`
	JerseyNumber int    `json:"jersey_number"`
	Status       string `json:"status"`
	PhotoURL     string `json:"photo_url"`
}

type Event struct {
	ID        string          `json:"id"`
	MatchID   string          `json:"match_id"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
	CreatedBy string          `json:"created_by"`
	CreatedAt time.Time       `json:"created_at"`
	Undone    bool            `json:"undone"`
	UndonAt   *time.Time      `json:"undone_at,omitempty"`
	UndoneBy  *string         `json:"undone_by,omitempty"`
	Sequence  int64           `json:"sequence"`

	CreatedByName string `json:"created_by_name,omitempty"`
}

// Event type constants
const (
	EventScoreUpdate   = "score_update"
	EventScoreRemove   = "score_remove"
	EventMatchStart    = "match_start"
	EventMatchEnd      = "match_end"
	EventTimerStart    = "timer_start"
	EventTimerPause    = "timer_pause"
	EventTimeoutStart  = "timeout_start"
	EventTimeoutEnd    = "timeout_end"
	EventSubstitution  = "substitution"
	EventAnnouncement  = "announcement"
	EventDisplayLayout = "display_layout_change"
)

type ScorePayload struct {
	Team   string `json:"team"`
	Points int    `json:"points"`
}

type TimeoutPayload struct {
	Team     string `json:"team"`
	Duration int    `json:"duration"`
	Reason   string `json:"reason"`
}

type SubstitutionPayload struct {
	Team      string `json:"team"`
	PlayerOut string `json:"player_out"`
	PlayerIn  string `json:"player_in"`
	Number    int    `json:"number"`
}

type AnnouncementPayload struct {
	Message  string `json:"message"`
	Duration int    `json:"duration"`
}

type DisplayLayoutPayload struct {
	Mode     int      `json:"mode"`
	MatchIDs []string `json:"match_ids"`
}

type MatchState struct {
	ScoreA         int             `json:"score_a"`
	ScoreB         int             `json:"score_b"`
	Status         string          `json:"status"`
	TimerSeconds   int             `json:"timer_seconds"`
	TimerRunning   bool            `json:"timer_running"`
	CurrentTimeout *TimeoutPayload `json:"current_timeout,omitempty"`
}

func CalculateState(events []Event) MatchState {
	state := MatchState{Status: "pending"}
	for _, e := range events {
		if e.Undone {
			continue
		}
		switch e.Type {
		case EventScoreUpdate:
			var p ScorePayload
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				if p.Team == "A" {
					state.ScoreA += p.Points
				} else {
					state.ScoreB += p.Points
				}
			}
		case EventScoreRemove:
			var p ScorePayload
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				if p.Team == "A" {
					state.ScoreA -= p.Points
					if state.ScoreA < 0 {
						state.ScoreA = 0
					}
				} else {
					state.ScoreB -= p.Points
					if state.ScoreB < 0 {
						state.ScoreB = 0
					}
				}
			}
		case EventMatchStart:
			state.Status = "active"
		case EventMatchEnd:
			state.Status = "completed"
			state.TimerRunning = false
		case EventTimerStart:
			state.TimerRunning = true
		case EventTimerPause:
			state.TimerRunning = false
		case EventTimeoutStart:
			var p TimeoutPayload
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				state.CurrentTimeout = &p
				state.Status = "timeout"
				state.TimerRunning = false
			}
		case EventTimeoutEnd:
			state.CurrentTimeout = nil
			state.Status = "active"
		}
	}
	return state
}

type WSMessage struct {
	Type    string          `json:"type"`
	MatchID string          `json:"match_id,omitempty"`
	Payload json.RawMessage `json:"payload"`
}

type WSConnectedMsg struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

// DeviceInfo — tracked in WS hub (scorer / display only; admin browsers excluded)
type DeviceInfo struct {
	ID          string    `json:"id"`
	DeviceName  string    `json:"device_name"`
	IPAddress   string    `json:"ip_address"`
	MatchID     string    `json:"match_id"`
	MatchCode   string    `json:"match_code"`
	MatchName   string    `json:"match_name"`
	Role        string    `json:"role"`
	ConnectedAt time.Time `json:"connected_at"`
	LastSeen    time.Time `json:"last_seen"`
	Online      bool      `json:"online"`
}

type ServerInfo struct {
	LocalIP          string `json:"local_ip"`
	Port             string `json:"port"`
	ConnectURL       string `json:"connect_url"`
	DisplayURL       string `json:"display_url"`
	ConnectedDevices int    `json:"connected_devices"`
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateUserRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
	Role     Role   `json:"role" binding:"required"`
}

type CreateTournamentRequest struct {
	Name  string `json:"name" binding:"required"`
	Sport string `json:"sport"`
}

type CreateCourtRequest struct {
	Name         string `json:"name" binding:"required"`
	TournamentID string `json:"tournament_id" binding:"required"`
}

type CreateMatchRequest struct {
	CourtID      string        `json:"court_id" binding:"required"`
	TournamentID string        `json:"tournament_id" binding:"required"`
	TeamA        string        `json:"team_a" binding:"required"`
	TeamB        string        `json:"team_b" binding:"required"`
	TeamAColor   string        `json:"team_a_color"`
	TeamBColor   string        `json:"team_b_color"`
	TeamALogo    string        `json:"team_a_logo"`
	TeamBLogo    string        `json:"team_b_logo"`
	PlayersA     []PlayerInput `json:"players_a"`
	PlayersB     []PlayerInput `json:"players_b"`
}

type CreateEventRequest struct {
	Type    string          `json:"type" binding:"required"`
	Payload json.RawMessage `json:"payload"`
}

type AssignScorerRequest struct {
	UserID string `json:"user_id" binding:"required"`
}

type ConnectRequest struct {
	MatchCode  string `json:"match_code" binding:"required"`
	DeviceName string `json:"device_name"`
}

type ConnectResponse struct {
	Token string `json:"token"`
	Match *Match `json:"match"`
}
