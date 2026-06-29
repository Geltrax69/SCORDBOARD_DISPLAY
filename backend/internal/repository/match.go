package repository

import (
	"database/sql"
	"fmt"
	"math/rand"
	"strings"

	"github.com/scoreboard/backend/internal/models"
)

type MatchRepo struct {
	db *sql.DB
}

func NewMatchRepo(db *sql.DB) *MatchRepo {
	return &MatchRepo{db: db}
}

// generateMatchCode creates a unique 4-digit code (1000–9999)
func generateMatchCode() string {
	return fmt.Sprintf("%04d", 1000+rand.Intn(9000))
}

const matchSelectCols = `
	m.id, m.court_id, m.tournament_id, m.team_a, m.team_b,
	m.team_a_color, m.team_b_color,
	COALESCE(m.team_a_logo,''), COALESCE(m.team_b_logo,''),
	m.status, m.timer_seconds, m.timer_running, m.timer_started_at,
	COALESCE(m.match_code,''),
	COALESCE(m.created_by::text,''),
	m.created_at, m.updated_at,
	COALESCE(c.name,''), COALESCE(t.name,'')`

func scanMatch(row interface {
	Scan(...interface{}) error
}, m *models.Match) error {
	return row.Scan(
		&m.ID, &m.CourtID, &m.TournamentID, &m.TeamA, &m.TeamB,
		&m.TeamAColor, &m.TeamBColor, &m.TeamALogo, &m.TeamBLogo,
		&m.Status, &m.TimerSeconds, &m.TimerRunning, &m.TimerStartedAt,
		&m.MatchCode, &m.CreatedBy, &m.CreatedAt, &m.UpdatedAt,
		&m.CourtName, &m.TournamentName,
	)
}

func (r *MatchRepo) Create(m *models.Match) error {
	if m.TeamAColor == "" {
		m.TeamAColor = "#3B82F6"
	}
	if m.TeamBColor == "" {
		m.TeamBColor = "#EF4444"
	}

	var createdBy interface{}
	if m.CreatedBy != "" {
		createdBy = m.CreatedBy
	}

	// Retry up to 10 times to avoid match_code unique constraint collisions
	for attempt := 0; attempt < 10; attempt++ {
		code := generateMatchCode()
		err := r.db.QueryRow(
			`INSERT INTO matches
			   (court_id, tournament_id, team_a, team_b, team_a_color, team_b_color,
			    team_a_logo, team_b_logo, match_code, created_by)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
			 RETURNING id, status, timer_seconds, timer_running, match_code, created_at, updated_at`,
			m.CourtID, m.TournamentID, m.TeamA, m.TeamB, m.TeamAColor, m.TeamBColor,
			m.TeamALogo, m.TeamBLogo, code, createdBy,
		).Scan(&m.ID, &m.Status, &m.TimerSeconds, &m.TimerRunning,
			&m.MatchCode, &m.CreatedAt, &m.UpdatedAt)
		if err == nil {
			return nil
		}
		// Only retry on unique constraint violation (match_code collision)
		if !strings.Contains(err.Error(), "unique") && !strings.Contains(err.Error(), "duplicate") {
			return err
		}
	}
	return fmt.Errorf("failed to generate unique match code after 10 attempts")
}

func (r *MatchRepo) FindByID(id string) (*models.Match, error) {
	m := &models.Match{}
	err := scanMatch(r.db.QueryRow(`
		SELECT `+matchSelectCols+`
		FROM matches m
		LEFT JOIN courts c ON c.id = m.court_id
		LEFT JOIN tournaments t ON t.id = m.tournament_id
		WHERE m.id = $1`, id), m)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

func (r *MatchRepo) FindByCode(code string) (*models.Match, error) {
	m := &models.Match{}
	err := scanMatch(r.db.QueryRow(`
		SELECT `+matchSelectCols+`
		FROM matches m
		LEFT JOIN courts c ON c.id = m.court_id
		LEFT JOIN tournaments t ON t.id = m.tournament_id
		WHERE m.match_code = $1`, code), m)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

// List returns matches scoped to a user (via their tournaments). If all is true (owner), returns every match.
func (r *MatchRepo) List(tournamentID, userID string, all bool) ([]models.Match, error) {
	query := `SELECT ` + matchSelectCols + `
		FROM matches m
		LEFT JOIN courts c ON c.id = m.court_id
		LEFT JOIN tournaments t ON t.id = m.tournament_id`
	var args []interface{}
	var where []string
	if tournamentID != "" {
		args = append(args, tournamentID)
		where = append(where, fmt.Sprintf("m.tournament_id = $%d", len(args)))
	}
	if !all {
		args = append(args, userID)
		where = append(where, fmt.Sprintf("t.created_by = $%d", len(args)))
	}
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, " AND ")
	}
	query += ` ORDER BY m.created_at DESC`

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var matches []models.Match
	for rows.Next() {
		var m models.Match
		if err := scanMatch(rows, &m); err != nil {
			return nil, err
		}
		matches = append(matches, m)
	}
	return matches, rows.Err()
}

func (r *MatchRepo) UpdateStatus(id, status string) error {
	_, err := r.db.Exec(`UPDATE matches SET status=$1, updated_at=NOW() WHERE id=$2`, status, id)
	return err
}

func (r *MatchRepo) UpdateTimer(id string, seconds int, running bool) error {
	_, err := r.db.Exec(`UPDATE matches SET timer_seconds=$1, timer_running=$2, updated_at=NOW() WHERE id=$3`, seconds, running, id)
	return err
}

func (r *MatchRepo) UpdateScore(id string, a, b int) error {
	_, err := r.db.Exec(`UPDATE matches SET score_a=$1, score_b=$2, updated_at=NOW() WHERE id=$3`, a, b, id)
	return err
}

func (r *MatchRepo) Delete(matchID string) error {
	_, err := r.db.Exec(`DELETE FROM matches WHERE id = $1`, matchID)
	return err
}

func (r *MatchRepo) GetCourtID(matchID string) (string, error) {
	var courtID string
	err := r.db.QueryRow(`SELECT court_id FROM matches WHERE id=$1`, matchID).Scan(&courtID)
	return courtID, err
}

func (r *MatchRepo) UpdatePlayerStatus(matchID, team, name, status string) error {
	_, err := r.db.Exec(
		`UPDATE match_players 
		 SET status = $1 
		 WHERE match_id = $2 AND team = $3 AND LOWER(TRIM(name)) = LOWER(TRIM($4))`,
		status, matchID, team, name,
	)
	return err
}
