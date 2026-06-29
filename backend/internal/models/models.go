package models

import (
	"encoding/json"
	"time"
)

type Role string

const (
	RoleOwner      Role = "owner"       // top tier: manages users + everything an admin can do
	RoleSuperAdmin Role = "super_admin" // runs tournaments/matches/display
	RoleScorer     Role = "scorer"
	RoleDisplay    Role = "display"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Name         string    `json:"name"`
	Role         Role      `json:"role"`
	MatchCount   int       `json:"match_count"` // matches created by this user (computed in List)
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
	EventSponsorShow   = "sponsor_show"
	EventServeSet      = "serve_set" // referee sets who serves first (toss)
)

// Sepak takraw set targets: sets 1-2 play to 21 (cap 25); the deciding 3rd set
// (tie-break) plays to 15 (cap 17). deuceAt is the score at which serve and the
// win condition switch to "win by 2 / first to cap".
func setLimits(setIdx int) (target, capPts, deuceAt int) {
	if setIdx >= 2 {
		return 15, 17, 14
	}
	return 21, 25, 20
}

// setWon reports whether score x beats y under sepak takraw rules: reach target
// with a 2-point lead, or be first to the cap.
func setWon(x, y, target, capPts int) bool {
	return (x >= target && x-y >= 2) || x >= capPts
}

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
	ImageURL string `json:"image_url,omitempty"`
	Title    string `json:"title,omitempty"`
}

type SponsorPayload struct {
	Title    string `json:"title"`
	ImageURL string `json:"image_url"`
	Duration int    `json:"duration"`
}

// DisplayAsset is a reusable sponsor card or announcement the admin pre-builds
// once and pushes to the display with a single click.
type DisplayAsset struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // "sponsor" | "announcement"
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	ImageURL  string    `json:"image_url"`
	Duration  int       `json:"duration"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateDisplayAssetRequest struct {
	Type     string `json:"type" binding:"required"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	ImageURL string `json:"image_url"`
	Duration int    `json:"duration"`
}

type DisplayLayoutPayload struct {
	Mode                int      `json:"mode"`
	MatchIDs            []string `json:"match_ids"`
	ShowPlayerAnimation bool     `json:"show_player_animation"`
}

type MatchState struct {
	ScoreA         int             `json:"score_a"` // points in the CURRENT set
	ScoreB         int             `json:"score_b"`
	Status         string          `json:"status"`
	TimerSeconds   int             `json:"timer_seconds"`
	TimerRunning   bool            `json:"timer_running"`
	CurrentTimeout *TimeoutPayload `json:"current_timeout,omitempty"`
	TimeoutRemaining int           `json:"timeout_remaining,omitempty"` // secs left in the current timeout
	BreakRemaining   int           `json:"break_remaining,omitempty"`   // secs left in the court-change break
	Winner         string          `json:"winner,omitempty"`

	// Sepak takraw: best-of-3 sets, rally scoring, serve rotation.
	SetsA         int        `json:"sets_a"`         // sets won by A
	SetsB         int        `json:"sets_b"`         // sets won by B
	SetNumber     int        `json:"set_number"`     // current set, 1-based
	CompletedSets [][2]int   `json:"completed_sets"` // finished set scores [a,b]
	Serving       string     `json:"serving"`        // "A" | "B" — who serves the next rally
	SetPoint      string     `json:"set_point,omitempty"`   // team one point from winning the set
	MatchPoint    string     `json:"match_point,omitempty"` // team one point from winning the match
}

func CalculateState(events []Event) MatchState {
	state := MatchState{Status: "pending"}

	// Authoritative timer: derive elapsed seconds from event timestamps so every
	// client (display, phone, admin) sees the same clock without it resetting on
	// each score/timeout. accumulated holds completed running intervals; lastStart
	// marks an interval still in progress. Source of truth is the event log, so
	// the timer also survives a backend restart.
	var accumulated float64
	var lastStart *time.Time
	stopTimer := func(at time.Time) {
		if lastStart != nil {
			accumulated += at.Sub(*lastStart).Seconds()
			lastStart = nil
		}
	}

	// Open timeout tracking — a timeout auto-expires after its duration so the
	// match resumes on its own even if no one taps "End Timeout".
	var toStart *time.Time
	var toDur int

	// Court-change break: when a set finishes the clock pauses for 2 minutes,
	// then auto-resumes for the next set.
	var breakStart *time.Time
	const courtChangeSecs = 120

	// Sepak takraw set tracking. Each rally is one point in the current set; when
	// a set's win condition is met it closes, sides swap, and play moves to the
	// next set. firstServer is the toss winner (set via serve_set, default A).
	firstServer := "A"
	setIdx := 0
	matchOver := false
	closeSet := func(at time.Time) {
		target, capPts, _ := setLimits(setIdx)
		a, b := state.ScoreA, state.ScoreB
		if !setWon(a, b, target, capPts) && !setWon(b, a, target, capPts) {
			return
		}
		state.CompletedSets = append(state.CompletedSets, [2]int{a, b})
		if a > b {
			state.SetsA++
		} else {
			state.SetsB++
		}
		state.ScoreA, state.ScoreB = 0, 0
		if state.SetsA == 2 || state.SetsB == 2 {
			matchOver = true
		} else {
			setIdx++
			// Court change: pause the clock for the 2-minute break.
			state.TimerRunning = false
			stopTimer(at)
			bs := at
			breakStart = &bs
		}
	}

	for _, e := range events {
		if e.Undone {
			continue
		}
		switch e.Type {
		case EventServeSet:
			var p ScorePayload
			if err := json.Unmarshal(e.Payload, &p); err == nil && (p.Team == "A" || p.Team == "B") {
				firstServer = p.Team
			}
		case EventScoreUpdate:
			if matchOver {
				break
			}
			// A point means play resumed → end any court-change break early and
			// restart the clock for the new set.
			if breakStart != nil {
				breakStart = nil
				state.TimerRunning = true
				if lastStart == nil {
					t := e.CreatedAt
					lastStart = &t
				}
			}
			var p ScorePayload
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				if p.Team == "A" {
					state.ScoreA += p.Points
				} else {
					state.ScoreB += p.Points
				}
				closeSet(e.CreatedAt)
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
			// Clock does NOT start here — the pre-match intro plays first, then the
			// referee starts the clock (timer_start) when play actually begins.
		case EventMatchEnd:
			state.Status = "completed"
			state.TimerRunning = false
			stopTimer(e.CreatedAt)
			var p struct {
				Winner string `json:"winner"`
			}
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				state.Winner = p.Winner
			}
		case EventTimerStart:
			state.TimerRunning = true
			if lastStart == nil {
				t := e.CreatedAt
				lastStart = &t
			}
		case EventTimerPause:
			state.TimerRunning = false
			stopTimer(e.CreatedAt)
		case EventTimeoutStart:
			var p TimeoutPayload
			if err := json.Unmarshal(e.Payload, &p); err == nil {
				state.CurrentTimeout = &p
				state.Status = "timeout"
				state.TimerRunning = false
				stopTimer(e.CreatedAt)
				ts := e.CreatedAt
				toStart = &ts
				toDur = p.Duration
				if toDur <= 0 {
					toDur = 60
				}
			}
		case EventTimeoutEnd:
			state.CurrentTimeout = nil
			state.Status = "active"
			toStart = nil
			// Timeout over → clock auto-resumes (play restarts immediately).
			state.TimerRunning = true
			if lastStart == nil {
				t := e.CreatedAt
				lastStart = &t
			}
		case EventSubstitution:
			// A substitution stops the clock; referee resumes when play restarts.
			state.TimerRunning = false
			stopTimer(e.CreatedAt)
		}
	}

	// Auto-expire an open timeout once its duration has elapsed: clear it, set
	// the match active again, and resume the clock from the moment it ended.
	if toStart != nil && state.CurrentTimeout != nil {
		end := toStart.Add(time.Duration(toDur) * time.Second)
		if time.Now().After(end) {
			state.CurrentTimeout = nil
			state.Status = "active"
			state.TimerRunning = true
			if lastStart == nil {
				lastStart = &end
			}
		} else {
			state.TimeoutRemaining = int(time.Until(end).Seconds()) + 1
		}
	}

	// Court-change break: clock stays paused for 2 minutes after a set, then
	// auto-resumes for the next set.
	if breakStart != nil && state.CurrentTimeout == nil && state.Status == "active" && !matchOver {
		end := breakStart.Add(courtChangeSecs * time.Second)
		if time.Now().After(end) {
			state.TimerRunning = true
			if lastStart == nil {
				lastStart = &end
			}
		} else if lastStart == nil {
			state.TimerRunning = false // still changing courts
			state.BreakRemaining = int(time.Until(end).Seconds()) + 1
		}
	}

	// If a running interval is still open, count up to "now".
	if lastStart != nil {
		accumulated += time.Since(*lastStart).Seconds()
	}
	state.TimerSeconds = int(accumulated)

	state.SetNumber = setIdx + 1
	if state.CompletedSets == nil {
		state.CompletedSets = [][2]int{}
	}

	// Match auto-completes when a team wins 2 sets (unless an explicit match_end
	// already set the status/winner above).
	if matchOver && state.Status != "completed" {
		state.Status = "completed"
		state.TimerRunning = false
		if state.SetsA > state.SetsB {
			state.Winner = "A"
		} else {
			state.Winner = "B"
		}
	}

	// Serve: the set's first server alternates each set from the toss winner.
	// Serve passes every 3 points; at deuce (both at deuceAt) it alternates every
	// point. deuce can only begin at exactly deuceAt-deuceAt, so the switch count
	// is a closed form over the current set's points.
	flip := func(s string, n int) string {
		if n%2 == 1 {
			if s == "A" {
				return "B"
			}
			return "A"
		}
		return s
	}
	setServer := flip(firstServer, setIdx)
	_, _, deuceAt := setLimits(setIdx)
	total := state.ScoreA + state.ScoreB
	deuceTotal := 2 * deuceAt
	if total < deuceTotal {
		state.Serving = flip(setServer, total/3)
	} else {
		base := flip(setServer, deuceTotal/3)
		state.Serving = flip(base, total-deuceTotal)
	}

	// Set point / match point: a team is at set point if one more point wins the
	// current set; it's also match point if winning that set wins the match.
	if !matchOver && state.Status != "completed" {
		target, capPts, _ := setLimits(setIdx)
		if setWon(state.ScoreA+1, state.ScoreB, target, capPts) {
			state.SetPoint = "A"
			if state.SetsA == 1 {
				state.MatchPoint = "A"
			}
		} else if setWon(state.ScoreB+1, state.ScoreA, target, capPts) {
			state.SetPoint = "B"
			if state.SetsB == 1 {
				state.MatchPoint = "B"
			}
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
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type CreateUserRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required,min=4"`
	Name     string `json:"name"`
	Role     Role   `json:"role" binding:"required"`
}

type UpdateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     Role   `json:"role"`
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
