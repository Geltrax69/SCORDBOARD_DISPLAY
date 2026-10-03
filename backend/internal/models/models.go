package models

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

type Role string

const (
	RoleOwner      Role = "owner"       // top tier: manages users + everything an admin can do
	RoleSuperAdmin Role = "super_admin" // runs tournaments/matches/display
	RoleScorer     Role = "scorer"
	RoleDisplay    Role = "display"
)

var teamColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

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
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Sport      string    `json:"sport"`
	EventType  string    `json:"event_type"` // regu | double | quad
	Status     string    `json:"status"`
	ExternalID string    `json:"external_id"` // website tournament id when synced
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
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
	EventType      string     `json:"event_type"`
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
	Gender       string    `json:"gender"`
	JerseyNumber int       `json:"jersey_number"`
	Status       string    `json:"status"` // "playing" | "sub"
	PhotoURL     string    `json:"photo_url"`
	CreatedAt    time.Time `json:"created_at"`
}

type PlayerInput struct {
	Name         string `json:"name"`
	Gender       string `json:"gender"`
	JerseyNumber int    `json:"jersey_number"`
	Status       string `json:"status"`
	PhotoURL     string `json:"photo_url"`
	PlayerProfile
}

// PlayerProfile is the registration data imported from the player spreadsheet.
type PlayerProfile struct {
	PlayerCode         string `json:"player_code"`
	Category           string `json:"category"`
	DateOfBirth        string `json:"date_of_birth"`
	Age                int    `json:"age"`
	DistrictGames      int    `json:"district_games"`
	StateGames         int    `json:"state_games"`
	NationalGames      int    `json:"national_games"`
	InternationalGames int    `json:"international_games"`
}

// Team is a saved roster template, reused across matches.
type Team struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Color     string       `json:"color"`
	LogoURL   string       `json:"logo_url"`
	CreatedBy string       `json:"created_by"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
	Players   []TeamPlayer `json:"players"`

	// Set on teams synced from the website (empty for hand-made teams).
	TournamentID string `json:"tournament_id"`
	ExternalID   string `json:"external_id"`
	District     string `json:"district"`
	EventType    string `json:"event_type"`
}

type TeamPlayer struct {
	ID           string `json:"id"`
	TeamID       string `json:"team_id"`
	Name         string `json:"name"`
	Gender       string `json:"gender"`
	JerseyNumber int    `json:"jersey_number"`
	Status       string `json:"status"`
	PhotoURL     string `json:"photo_url"`
	PlayerProfile
}

type TeamRequest struct {
	Name    string        `json:"name" binding:"required"`
	Color   string        `json:"color"`
	LogoURL string        `json:"logo_url"`
	Players []PlayerInput `json:"players"`
}

const (
	MaxImportTeams   = 100
	MaxImportPlayers = 5000
)

// TeamImportRequest is the verified client preview submitted as one atomic import.
// NormalizeAndValidate is also called server-side so API clients cannot bypass the
// spreadsheet checks performed in the browser.
type TeamImportRequest struct {
	Teams []TeamImportInput `json:"teams" binding:"required"`
}

type TeamImportInput struct {
	Name    string        `json:"name"`
	Color   string        `json:"color"`
	Players []PlayerInput `json:"players"`
}

type TeamImportResult struct {
	TeamsCreated int `json:"teams_created"`
	TeamsUpdated int `json:"teams_updated"`
	PlayersAdded int `json:"players_added"`
}

func (r *TeamImportRequest) NormalizeAndValidate() error {
	if len(r.Teams) == 0 {
		return fmt.Errorf("at least one team is required")
	}
	if len(r.Teams) > MaxImportTeams {
		return fmt.Errorf("too many teams: maximum is %d", MaxImportTeams)
	}

	totalPlayers := 0
	teamNames := make(map[string]struct{}, len(r.Teams))
	for teamIndex := range r.Teams {
		team := &r.Teams[teamIndex]
		team.Name = strings.TrimSpace(team.Name)
		if team.Name == "" {
			return fmt.Errorf("team %d: name is required", teamIndex+1)
		}
		if len([]rune(team.Name)) > 255 {
			return fmt.Errorf("team %d: name must be 255 characters or fewer", teamIndex+1)
		}
		teamKey := strings.ToLower(team.Name)
		if _, exists := teamNames[teamKey]; exists {
			return fmt.Errorf("duplicate team: %s", team.Name)
		}
		teamNames[teamKey] = struct{}{}
		if team.Color == "" {
			team.Color = "#3B82F6"
		}
		if !teamColorPattern.MatchString(team.Color) {
			return fmt.Errorf("team %s: color must be a six-digit hex value", team.Name)
		}
		team.Color = strings.ToUpper(team.Color)
		if len(team.Players) == 0 {
			return fmt.Errorf("team %s: at least one player is required", team.Name)
		}

		totalPlayers += len(team.Players)
		if totalPlayers > MaxImportPlayers {
			return fmt.Errorf("too many players: maximum is %d", MaxImportPlayers)
		}
		playerNames := make(map[string]struct{}, len(team.Players))
		jerseys := make(map[int]struct{}, len(team.Players))
		for playerIndex := range team.Players {
			player := &team.Players[playerIndex]
			player.Name = strings.TrimSpace(player.Name)
			if player.Name == "" {
				return fmt.Errorf("team %s, player %d: full name is required", team.Name, playerIndex+1)
			}
			if len([]rune(player.Name)) > 255 {
				return fmt.Errorf("team %s, player %d: full name must be 255 characters or fewer", team.Name, playerIndex+1)
			}
			nameKey := strings.ToLower(player.Name)
			if _, exists := playerNames[nameKey]; exists {
				return fmt.Errorf("team %s: duplicate player %s", team.Name, player.Name)
			}
			playerNames[nameKey] = struct{}{}

			switch strings.ToLower(strings.TrimSpace(player.Gender)) {
			case "male":
				player.Gender = "Male"
			case "female":
				player.Gender = "Female"
			case "other":
				player.Gender = "Other"
			default:
				return fmt.Errorf("team %s, player %s: gender must be Male, Female, or Other", team.Name, player.Name)
			}
			if player.JerseyNumber < 1 || player.JerseyNumber > 99 {
				return fmt.Errorf("team %s, player %s: jersey number must be from 1 to 99", team.Name, player.Name)
			}
			if _, exists := jerseys[player.JerseyNumber]; exists {
				return fmt.Errorf("team %s: duplicate jersey number %d", team.Name, player.JerseyNumber)
			}
			jerseys[player.JerseyNumber] = struct{}{}
			player.Status = "playing"
		}
	}
	return nil
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
	EventScoreUpdate       = "score_update"
	EventScoreRemove       = "score_remove"
	EventMatchStart        = "match_start"
	EventMatchEnd          = "match_end"
	EventTimerStart        = "timer_start"
	EventTimerPause        = "timer_pause"
	EventTimeoutStart      = "timeout_start"
	EventTimeoutEnd        = "timeout_end"
	EventSubstitution      = "substitution"
	EventAnnouncement      = "announcement"
	EventDisplayLayout     = "display_layout_change"
	EventSponsorShow       = "sponsor_show"
	EventDisplayBackground = "display_background" // persistent full-screen bg image
	EventDisplayStyle      = "display_style"      // scorecard style: classic | cards
	EventDisplayIdentify   = "display_identify"   // flash a screen's name so staff can find the TV
	EventServeSet          = "serve_set"          // referee sets who serves first (toss)
	EventRoundStart        = "round_start"        // controller starts the next round
)

// All sets play to 15. deuceAt (14): once both teams reach 14-14 it's deuce and
// the set goes to whoever reaches 17 first (no win-by-2: 16-14 does not win).
// Event formats. A round is always best-of-3 sets; the format decides how many
// rounds make a match.
const (
	EventTypeRegu   = "regu"
	EventTypeDouble = "double"
	EventTypeQuad   = "quad"
)

// roundsFor returns how many rounds the format schedules, and whether a decider
// round is added when the scheduled rounds end level.
func roundsFor(eventType string) (scheduled int, decider bool) {
	switch eventType {
	case EventTypeDouble:
		return 2, true // 2 rounds, +1 decider only if 1–1
	case EventTypeQuad:
		return 3, false // always play all 3; winner leads on rounds
	default:
		return 1, false // regu — a single round settles it
	}
}

func setLimits(setIdx int) (target, capPts, deuceAt int) {
	return 15, 17, 14
}

// setWon reports whether score x beats y: reach target before the opponent hits
// deuceAt, otherwise (after deuceAt-all) be first to the cap.
func setWon(x, y, target, capPts, deuceAt int) bool {
	return x >= capPts || (x >= target && y < deuceAt)
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
	// Screen the layout belongs to; displays ignore layouts for other screens.
	Screen string `json:"screen,omitempty"`
	// Auto marks a switch made by court-follow rather than by the admin.
	Auto bool `json:"auto,omitempty"`
}

// DisplayScreen is one physical TV, opened once at /display?screen=<slug> and
// then controlled independently from the admin panel.
type DisplayScreen struct {
	Slug                string    `json:"slug"`
	Name                string    `json:"name"`
	Mode                int       `json:"mode"`
	MatchIDs            []string  `json:"match_ids"`
	ShowPlayerAnimation bool      `json:"show_player_animation"`
	FollowCourtID       string    `json:"follow_court_id"` // "" = layout picked by hand
	Online              int       `json:"online"`          // connected displays on this screen
	UpdatedAt           time.Time `json:"updated_at"`
}

type MatchState struct {
	ScoreA           int             `json:"score_a"` // points in the CURRENT set
	ScoreB           int             `json:"score_b"`
	Status           string          `json:"status"`
	TimerSeconds     int             `json:"timer_seconds"`
	TimerRunning     bool            `json:"timer_running"`
	CurrentTimeout   *TimeoutPayload `json:"current_timeout,omitempty"`
	TimeoutRemaining int             `json:"timeout_remaining,omitempty"` // secs left in the current timeout
	BreakRemaining   int             `json:"break_remaining,omitempty"`   // secs left in the court-change break
	Winner           string          `json:"winner,omitempty"`

	// Sepak takraw: best-of-3 sets, rally scoring, serve rotation.
	SetsA         int      `json:"sets_a"`                    // sets won by A
	SetsB         int      `json:"sets_b"`                    // sets won by B
	SetNumber     int      `json:"set_number"`                // current set, 1-based
	CompletedSets [][2]int `json:"completed_sets"`            // finished set scores [a,b]
	Serving       string   `json:"serving"`                   // "A" | "B" — who serves the next rally
	SetPoint      string   `json:"set_point,omitempty"`       // team one point from winning the set
	MatchPoint    string   `json:"match_point,omitempty"`     // team one point from winning the match
	Deuce         bool     `json:"deuce,omitempty"`           // both teams at deuceAt+ ("all point", win by 2 / first to cap)
	LastSetWinner string   `json:"last_set_winner,omitempty"` // who took the set that just ended (court-change card)

	// Rounds — regu is one round, double/quad stack several. Sets above are
	// scoped to the CURRENT round and reset when the next one starts.
	EventType       string   `json:"event_type"`            // regu | double | quad
	RoundNumber     int      `json:"round_number"`          // current round, 1-based
	TotalRounds     int      `json:"total_rounds"`          // rounds scheduled (grows to 3 on a double decider)
	RoundsA         int      `json:"rounds_a"`              // rounds won by A
	RoundsB         int      `json:"rounds_b"`              // rounds won by B
	CompletedRounds [][2]int `json:"completed_rounds"`      // per-round set tallies [a,b]
	AwaitingRound   bool     `json:"awaiting_round"`        // round done — waiting for the controller to start the next
	RoundPoint      string   `json:"round_point,omitempty"` // team one point from taking the round
}

// CalculateState derives a regu (single-round) match. Use CalculateStateFor to
// evaluate a double/quad match, which stacks several rounds.
func CalculateState(events []Event) MatchState {
	return CalculateStateFor(events, EventTypeRegu)
}

func CalculateStateFor(events []Event, eventType string) MatchState {
	scheduledRounds, allowsDecider := roundsFor(eventType)
	state := MatchState{
		Status:      "pending",
		EventType:   eventType,
		RoundNumber: 1,
		TotalRounds: scheduledRounds,
	}

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
		target, capPts, deuceAt := setLimits(setIdx)
		a, b := state.ScoreA, state.ScoreB
		if !setWon(a, b, target, capPts, deuceAt) && !setWon(b, a, target, capPts, deuceAt) {
			return
		}
		state.CompletedSets = append(state.CompletedSets, [2]int{a, b})
		if a > b {
			state.SetsA++
			state.LastSetWinner = "A"
		} else {
			state.SetsB++
			state.LastSetWinner = "B"
		}
		state.ScoreA, state.ScoreB = 0, 0

		// Two sets takes the ROUND — not necessarily the match.
		if state.SetsA == 2 || state.SetsB == 2 {
			state.CompletedRounds = append(state.CompletedRounds, [2]int{state.SetsA, state.SetsB})
			if state.SetsA > state.SetsB {
				state.RoundsA++
			} else {
				state.RoundsB++
			}
			// A double level after its scheduled rounds gets one decider round.
			if allowsDecider && len(state.CompletedRounds) == scheduledRounds && state.RoundsA == state.RoundsB {
				state.TotalRounds = scheduledRounds + 1
			}
			if len(state.CompletedRounds) >= state.TotalRounds {
				matchOver = true
				state.TimerRunning = false
				stopTimer(at)
				return
			}
			// More rounds to play: hold here until the controller starts the next.
			state.AwaitingRound = true
			state.TimerRunning = false
			stopTimer(at)
			return
		}

		setIdx++
		// Court change: pause the clock for the 2-minute break.
		state.TimerRunning = false
		stopTimer(at)
		bs := at
		breakStart = &bs
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
				// The match clock keeps running through a timeout — only a court
				// change stops it. Timeout is shown as an overlay, not a pause.
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
			// Clock was never stopped, so leave it exactly as it is — forcing it
			// back on here would override a court-change break or a manual pause.
		case EventRoundStart:
			// Controller advances to the next round: sets reset, the round counter
			// moves on, and the clock starts for the opening rally.
			if state.AwaitingRound {
				state.AwaitingRound = false
				state.RoundNumber++
				state.SetsA, state.SetsB = 0, 0
				state.CompletedSets = nil
				state.ScoreA, state.ScoreB = 0, 0
				state.LastSetWinner = ""
				setIdx = 0
				breakStart = nil
				state.TimerRunning = true
				if lastStart == nil {
					t := e.CreatedAt
					lastStart = &t
				}
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
			// Clock untouched: a timeout never paused it.
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

	// Match auto-completes once every scheduled round is played (unless an
	// explicit match_end already set the status/winner above). The winner leads
	// on ROUNDS; a quad played out 2–1 still goes to the team on 2.
	if matchOver && state.Status != "completed" {
		state.Status = "completed"
		state.TimerRunning = false
		switch {
		case state.RoundsA > state.RoundsB:
			state.Winner = "A"
		case state.RoundsB > state.RoundsA:
			state.Winner = "B"
		default:
			state.Winner = "" // level on rounds with no decider left — a draw
		}
	}

	// Serve alternates every point (rally-by-rally): the side serving swaps on
	// each point regardless of who scores. The set's first server alternates each
	// set from the toss winner.
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
	total := state.ScoreA + state.ScoreB
	state.Serving = flip(setServer, total)

	// Set point → round point → match point. One more point may win the set; if
	// that set also takes the round it's round point; and if that round settles
	// the match (no rival can still catch up) it's match point too.
	if !matchOver && !state.AwaitingRound && state.Status != "completed" {
		target, capPts, deuceAt := setLimits(setIdx)
		if state.ScoreA >= deuceAt && state.ScoreB >= deuceAt {
			state.Deuce = true
		}
		// decisive reports whether taking this round ends the match for that team.
		decisive := func(roundsSelf, roundsOpp int) bool {
			remaining := state.TotalRounds - (len(state.CompletedRounds) + 1)
			if remaining < 0 {
				remaining = 0
			}
			return roundsSelf+1 > roundsOpp+remaining
		}
		if setWon(state.ScoreA+1, state.ScoreB, target, capPts, deuceAt) {
			state.SetPoint = "A"
			if state.SetsA == 1 {
				state.RoundPoint = "A"
				if decisive(state.RoundsA, state.RoundsB) {
					state.MatchPoint = "A"
				}
			}
		} else if setWon(state.ScoreB+1, state.ScoreA, target, capPts, deuceAt) {
			state.SetPoint = "B"
			if state.SetsB == 1 {
				state.RoundPoint = "B"
				if decisive(state.RoundsB, state.RoundsA) {
					state.MatchPoint = "B"
				}
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
	Name      string `json:"name" binding:"required"`
	Sport     string `json:"sport"`
	EventType string `json:"event_type"` // regu (default) | double | quad
}

// ValidEventType normalises an event format, falling back to regu.
func ValidEventType(t string) string {
	switch t {
	case EventTypeDouble, EventTypeQuad:
		return t
	default:
		return EventTypeRegu
	}
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
	// Format of this match (regu | double | quad). Empty = the tournament's.
	// Multi-event tournaments need it: a Doubles match in a Regu+Doubles event.
	EventType string `json:"event_type"`
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
