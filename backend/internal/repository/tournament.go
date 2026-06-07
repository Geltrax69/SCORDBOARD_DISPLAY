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
		`INSERT INTO tournaments (name, sport, created_by) VALUES ($1,$2,$3)
		 RETURNING id, status, created_at, updated_at`,
		t.Name, t.Sport, t.CreatedBy,
	).Scan(&t.ID, &t.Status, &t.CreatedAt, &t.UpdatedAt)
}

func (r *TournamentRepo) List() ([]models.Tournament, error) {
	rows, err := r.db.Query(
		`SELECT id, name, sport, status, created_by, created_at, updated_at
		 FROM tournaments ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ts []models.Tournament
	for rows.Next() {
		var t models.Tournament
		if err := rows.Scan(&t.ID, &t.Name, &t.Sport, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		ts = append(ts, t)
	}
	return ts, rows.Err()
}

func (r *TournamentRepo) FindByID(id string) (*models.Tournament, error) {
	t := &models.Tournament{}
	err := r.db.QueryRow(
		`SELECT id, name, sport, status, created_by, created_at, updated_at FROM tournaments WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.Name, &t.Sport, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
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
