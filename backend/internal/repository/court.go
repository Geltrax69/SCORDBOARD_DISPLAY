package repository

import (
	"database/sql"

	"github.com/scoreboard/backend/internal/models"
)

type CourtRepo struct {
	db *sql.DB
}

func NewCourtRepo(db *sql.DB) *CourtRepo {
	return &CourtRepo{db: db}
}

func (r *CourtRepo) Create(c *models.Court) error {
	return r.db.QueryRow(
		`INSERT INTO courts (name, tournament_id) VALUES ($1,$2) RETURNING id, created_at`,
		c.Name, c.TournamentID,
	).Scan(&c.ID, &c.CreatedAt)
}

func (r *CourtRepo) FindByID(id string) (*models.Court, error) {
	c := &models.Court{}
	err := r.db.QueryRow(
		`SELECT id, name, tournament_id, created_at FROM courts WHERE id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.TournamentID, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return c, err
}

func (r *CourtRepo) ListByTournament(tournamentID string) ([]models.Court, error) {
	rows, err := r.db.Query(
		`SELECT id, name, tournament_id, created_at FROM courts WHERE tournament_id = $1 ORDER BY name`,
		tournamentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var courts []models.Court
	for rows.Next() {
		var c models.Court
		if err := rows.Scan(&c.ID, &c.Name, &c.TournamentID, &c.CreatedAt); err != nil {
			return nil, err
		}
		courts = append(courts, c)
	}
	return courts, rows.Err()
}

func (r *CourtRepo) List() ([]models.Court, error) {
	rows, err := r.db.Query(
		`SELECT id, name, tournament_id, created_at FROM courts ORDER BY name`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var courts []models.Court
	for rows.Next() {
		var c models.Court
		if err := rows.Scan(&c.ID, &c.Name, &c.TournamentID, &c.CreatedAt); err != nil {
			return nil, err
		}
		courts = append(courts, c)
	}
	return courts, rows.Err()
}
