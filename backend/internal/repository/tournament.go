package repository

import (
	"database/sql"

	"github.com/scoreboard/backend/internal/models"
)

type TournamentRepo struct {
	db *sql.DB
}

func NewTournamentRepo(db *sql.DB) *TournamentRepo {
	return &TournamentRepo{db: db}
}

func (r *TournamentRepo) Create(t *models.Tournament) error {
	return r.db.QueryRow(
		`INSERT INTO tournaments (name, sport, event_type, created_by) VALUES ($1,$2,$3,$4)
		 RETURNING id, status, created_at, updated_at`,
		t.Name, t.Sport, t.EventType, t.CreatedBy,
	).Scan(&t.ID, &t.Status, &t.CreatedAt, &t.UpdatedAt)
}

// List returns tournaments scoped to a user. If all is true (owner), returns every tournament.
func (r *TournamentRepo) List(userID string, all bool) ([]models.Tournament, error) {
	q := `SELECT id, name, sport, event_type, status, COALESCE(created_by::text,''), COALESCE(external_id,''), created_at, updated_at FROM tournaments`
	var args []interface{}
	if !all {
		q += ` WHERE created_by = $1 OR external_id IS NOT NULL` // synced tournaments are shared
		args = append(args, userID)
	}
	q += ` ORDER BY created_at DESC`
	rows, err := r.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ts []models.Tournament
	for rows.Next() {
		var t models.Tournament
		if err := rows.Scan(&t.ID, &t.Name, &t.Sport, &t.EventType, &t.Status, &t.CreatedBy, &t.ExternalID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		ts = append(ts, t)
	}
	return ts, rows.Err()
}

func (r *TournamentRepo) FindByID(id string) (*models.Tournament, error) {
	t := &models.Tournament{}
	err := r.db.QueryRow(
		`SELECT id, name, sport, event_type, status, COALESCE(created_by::text,''), COALESCE(external_id,''), created_at, updated_at FROM tournaments WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Sport, &t.EventType, &t.Status, &t.CreatedBy, &t.ExternalID, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

func (r *TournamentRepo) UpdateStatus(id, status string) error {
	_, err := r.db.Exec(
		`UPDATE tournaments SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	return err
}
