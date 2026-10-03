package services

import (
	"crypto/sha1"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/scoreboard/backend/internal/models"
)

// WebsiteSync mirrors tournaments and approved district teams from the website
// backend (GET {WEBSITE_API_URL}/api/integration/sync) into this database.
// The website is the source of truth; the scoreboard only reads from it.
type WebsiteSync struct {
	db        *sql.DB
	baseURL   string
	apiKey    string
	uploadDir string
	client    *http.Client
	onChange  func() // called after a sync that changed anything (live-refreshes admin dashboards)
}

func NewWebsiteSync(db *sql.DB, baseURL, apiKey, uploadDir string, onChange func()) *WebsiteSync {
	return &WebsiteSync{
		db:        db,
		baseURL:   strings.TrimRight(baseURL, "/"),
		apiKey:    apiKey,
		uploadDir: uploadDir,
		onChange:  onChange,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

// Run syncs immediately, then every interval. Errors are logged and retried on
// the next tick, so a website outage never affects live scoring.
func (s *WebsiteSync) Run(interval time.Duration) {
	for {
		if err := s.SyncOnce(); err != nil {
			log.Printf("[website-sync] %v", err)
		}
		time.Sleep(interval)
	}
}

type syncSnapshot struct {
	Tournaments []struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		EventType string `json:"eventType"`
		Status    string `json:"status"`
	} `json:"tournaments"`
	Teams []syncTeam `json:"teams"`
}

type syncTeam struct {
	ID           string `json:"id"`
	TournamentID string `json:"tournamentId"`
	Name         string `json:"name"`
	TeamType     string `json:"teamType"`
	District     string `json:"district"`
	Players      []struct {
		Name     string `json:"name"`
		PlayerID string `json:"playerId"`
		Gender   string `json:"gender"`
		PhotoKey string `json:"photoKey"`
		PhotoURL string `json:"photoUrl"`
	} `json:"players"`
}

// On-court players per format; the rest of the squad starts as substitutes.
var startersFor = map[string]int{models.EventTypeRegu: 3, models.EventTypeDouble: 2, models.EventTypeQuad: 4}

func (s *WebsiteSync) SyncOnce() error {
	req, err := http.NewRequest(http.MethodGet, s.baseURL+"/api/integration/sync", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Integration-Key", s.apiKey)
	res, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch: website returned %s", res.Status)
	}
	var snap syncSnapshot
	if err := json.NewDecoder(res.Body).Decode(&snap); err != nil {
		return fmt.Errorf("decode: %w", err)
	}

	// Tournaments: upsert by website id. Never deleted here — courts and played
	// matches hang off them.
	tourIDs := map[string]string{} // website id -> local id
	tourChanged := 0
	for _, t := range snap.Tournaments {
		status := "active"
		if t.Status == "COMPLETED" {
			status = "completed"
		}
		var id string
		err := s.db.QueryRow(
			`INSERT INTO tournaments (name, sport, event_type, status, external_id)
			 VALUES ($1, 'sepak takraw', $2, $3, $4)
			 ON CONFLICT (external_id) DO UPDATE
			   SET name=EXCLUDED.name, event_type=EXCLUDED.event_type, status=EXCLUDED.status, updated_at=NOW()
			   WHERE (tournaments.name, tournaments.event_type, tournaments.status)
			         IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.event_type, EXCLUDED.status)
			 RETURNING id`,
			t.Title, models.ValidEventType(t.EventType), status, t.ID,
		).Scan(&id)
		if err == sql.ErrNoRows { // unchanged → DO UPDATE skipped, look it up
			err = s.db.QueryRow(`SELECT id FROM tournaments WHERE external_id=$1`, t.ID).Scan(&id)
		} else if err == nil {
			tourChanged++
		}
		if err != nil {
			return fmt.Errorf("tournament %q: %w", t.Title, err)
		}
		tourIDs[t.ID] = id
	}

	// Teams: upsert changed ones; drop synced teams that are no longer approved.
	// Matches copy rosters into match_players, so deleting a team is safe.
	seen := []string{}
	changed := 0
	for _, t := range snap.Teams {
		localTour, ok := tourIDs[t.TournamentID]
		if !ok {
			continue
		}
		seen = append(seen, t.ID)
		// Hash without photoUrl: signed URLs change on every request.
		h := t
		h.Players = append(h.Players[:0:0], t.Players...)
		for i := range h.Players {
			h.Players[i].PhotoURL = ""
		}
		raw, _ := json.Marshal(h)
		sum := sha1.Sum(raw)
		hash := hex.EncodeToString(sum[:])
		var cur string
		_ = s.db.QueryRow(`SELECT sync_hash FROM teams WHERE external_id=$1`, t.ID).Scan(&cur)
		if cur == hash {
			continue
		}
		if err := s.upsertTeam(t, localTour, hash); err != nil {
			return fmt.Errorf("team %q: %w", t.Name, err)
		}
		changed++
	}
	removed, err := s.db.Exec(
		`DELETE FROM teams WHERE external_id IS NOT NULL AND NOT (external_id = ANY(string_to_array($1, ',')))`,
		strings.Join(seen, ","))
	if err != nil {
		return fmt.Errorf("prune teams: %w", err)
	}
	if n, _ := removed.RowsAffected(); tourChanged > 0 || changed > 0 || n > 0 {
		log.Printf("[website-sync] %d tournaments updated, %d teams updated, %d removed", tourChanged, changed, n)
		if s.onChange != nil {
			s.onChange()
		}
	}
	return nil
}

func (s *WebsiteSync) upsertTeam(t syncTeam, tournamentID, hash string) error {
	eventType := models.ValidEventType(t.TeamType)
	starters := startersFor[eventType]
	players := make([]models.PlayerInput, 0, len(t.Players))
	for i, p := range t.Players {
		photo := s.localPhoto(p.PhotoKey, p.PhotoURL)
		if photo == "" && p.PhotoKey != "" {
			hash = "" // photo download failed → retry this team next sync
		}
		status := "playing"
		if i >= starters {
			status = "sub"
		}
		players = append(players, models.PlayerInput{
			Name: p.Name, Gender: titleGender(p.Gender), JerseyNumber: i + 1, Status: status,
			PhotoURL:      photo,
			PlayerProfile: models.PlayerProfile{PlayerCode: p.PlayerID},
		})
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var teamID string
	err = tx.QueryRow(
		`INSERT INTO teams (name, external_id, tournament_id, district, event_type, sync_hash)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (external_id) DO UPDATE
		   SET name=EXCLUDED.name, tournament_id=EXCLUDED.tournament_id, district=EXCLUDED.district,
		       event_type=EXCLUDED.event_type, sync_hash=EXCLUDED.sync_hash, updated_at=NOW()
		 RETURNING id`,
		t.Name, t.ID, tournamentID, t.District, eventType, hash,
	).Scan(&teamID)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM team_players WHERE team_id=$1`, teamID); err != nil {
		return err
	}
	if err := insertSyncedPlayers(tx, teamID, players); err != nil {
		return err
	}
	return tx.Commit()
}

func insertSyncedPlayers(tx *sql.Tx, teamID string, players []models.PlayerInput) error {
	for i, p := range players {
		if _, err := tx.Exec(
			`INSERT INTO team_players (team_id, name, gender, jersey_number, status, photo_url, sort_order, player_code)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			teamID, p.Name, p.Gender, p.JerseyNumber, p.Status, p.PhotoURL, i, p.PlayerCode,
		); err != nil {
			return err
		}
	}
	return nil
}

// localPhoto downloads a website photo once into uploads/players (website URLs
// may be short-lived signed links) and returns its local /uploads path.
// Failures return "" so a missing photo never blocks the sync.
func (s *WebsiteSync) localPhoto(key, url string) string {
	if key == "" || url == "" {
		return ""
	}
	sum := sha1.Sum([]byte(key))
	ext := strings.ToLower(filepath.Ext(strings.SplitN(key, "?", 2)[0]))
	if ext == "" || len(ext) > 5 {
		ext = ".jpg"
	}
	name := "web_" + hex.EncodeToString(sum[:8]) + ext
	path := filepath.Join(s.uploadDir, "players", name)
	public := "/uploads/players/" + name
	if _, err := os.Stat(path); err == nil {
		return public
	}
	res, err := s.client.Get(url)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ""
	}
	tmp := path + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return ""
	}
	_, err = io.Copy(f, io.LimitReader(res.Body, 10<<20))
	f.Close()
	if err != nil || os.Rename(tmp, path) != nil {
		os.Remove(tmp)
		return ""
	}
	return public
}

// titleGender maps the website's "male"/"female" to the scoreboard's "Male"/"Female".
func titleGender(g string) string {
	g = strings.ToLower(strings.TrimSpace(g))
	if g == "" {
		return ""
	}
	return strings.ToUpper(g[:1]) + g[1:]
}
