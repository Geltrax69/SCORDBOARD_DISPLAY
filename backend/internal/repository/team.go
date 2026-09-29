package repository

import (
	"database/sql"

	"github.com/scoreboard/backend/internal/models"
)

type TeamRepo struct {
	db *sql.DB
}

func NewTeamRepo(db *sql.DB) *TeamRepo {
	return &TeamRepo{db: db}
}

// List returns every team with its roster attached, in one pass over each table.
func (r *TeamRepo) List() ([]models.Team, error) {
	rows, err := r.db.Query(
		`SELECT id, name, color, logo_url, COALESCE(created_by::text,''), created_at, updated_at
		 FROM teams ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := []models.Team{}
	byID := map[string]int{}
	for rows.Next() {
		var t models.Team
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.LogoURL, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Players = []models.TeamPlayer{}
		byID[t.ID] = len(teams)
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(teams) == 0 {
		return teams, nil
	}

	prows, err := r.db.Query(
		`SELECT id, team_id, name, jersey_number, status, photo_url
		 FROM team_players ORDER BY team_id, sort_order, created_at`)
	if err != nil {
		return nil, err
	}
	defer prows.Close()
	for prows.Next() {
		var p models.TeamPlayer
		if err := prows.Scan(&p.ID, &p.TeamID, &p.Name, &p.JerseyNumber, &p.Status, &p.PhotoURL); err != nil {
			return nil, err
		}
		if i, ok := byID[p.TeamID]; ok {
			teams[i].Players = append(teams[i].Players, p)
		}
	}
	return teams, prows.Err()
}

func (r *TeamRepo) Create(t *models.Team, players []models.PlayerInput) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	err = tx.QueryRow(
		`INSERT INTO teams (name, color, logo_url, created_by)
		 VALUES ($1,$2,$3,NULLIF($4,'')::uuid)
		 RETURNING id, created_at, updated_at`,
		t.Name, t.Color, t.LogoURL, t.CreatedBy,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return err
	}
	if err := insertTeamPlayers(tx, t.ID, players); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	t.Players = echoPlayers(t.ID, players)
	return nil
}

// Update replaces the team's details and its whole roster (the UI edits it as one form).
func (r *TeamRepo) Update(t *models.Team, players []models.PlayerInput) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(
		`UPDATE teams SET name=$1, color=$2, logo_url=$3, updated_at=NOW() WHERE id=$4`,
		t.Name, t.Color, t.LogoURL, t.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	if _, err := tx.Exec(`DELETE FROM team_players WHERE team_id=$1`, t.ID); err != nil {
		return err
	}
	if err := insertTeamPlayers(tx, t.ID, players); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	t.Players = echoPlayers(t.ID, players)
	return nil
}

func (r *TeamRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM teams WHERE id=$1`, id)
	return err
}

// echoPlayers mirrors what was just written, so create/update responses aren't empty.
func echoPlayers(teamID string, players []models.PlayerInput) []models.TeamPlayer {
	out := []models.TeamPlayer{}
	for _, p := range players {
		if p.Name == "" {
			continue
		}
		status := p.Status
		if status != "sub" {
			status = "playing"
		}
		out = append(out, models.TeamPlayer{
			TeamID: teamID, Name: p.Name, JerseyNumber: p.JerseyNumber,
			Status: status, PhotoURL: p.PhotoURL,
		})
	}
	return out
}

func insertTeamPlayers(tx *sql.Tx, teamID string, players []models.PlayerInput) error {
	for i, p := range players {
		if p.Name == "" {
			continue
		}
		status := p.Status
		if status != "sub" {
			status = "playing"
		}
		_, err := tx.Exec(
			`INSERT INTO team_players (team_id, name, jersey_number, status, photo_url, sort_order)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			teamID, p.Name, p.JerseyNumber, status, p.PhotoURL, i)
		if err != nil {
			return err
		}
	}
	return nil
}
