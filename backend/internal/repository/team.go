package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/scoreboard/backend/internal/models"
)

var ErrTeamImportConflict = errors.New("team import conflict")

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
		`SELECT id, team_id, name, gender, jersey_number, status, photo_url
		 FROM team_players ORDER BY team_id, sort_order, created_at`)
	if err != nil {
		return nil, err
	}
	defer prows.Close()
	for prows.Next() {
		var p models.TeamPlayer
		if err := prows.Scan(&p.ID, &p.TeamID, &p.Name, &p.Gender, &p.JerseyNumber, &p.Status, &p.PhotoURL); err != nil {
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

// Import atomically appends verified players to district teams. A transaction-
// scoped advisory lock serializes imports so two simultaneous uploads cannot
// allocate the same player name or jersey number between their checks/inserts.
func (r *TeamRepo) Import(req models.TeamImportRequest, createdBy string) (*models.TeamImportResult, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`SELECT pg_advisory_xact_lock(hashtext('scorecast_team_import'))`); err != nil {
		return nil, err
	}

	result := &models.TeamImportResult{}
	for _, input := range req.Teams {
		var teamID string
		err := tx.QueryRow(
			`SELECT id::text FROM teams
			 WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
			 LIMIT 1 FOR UPDATE`, input.Name,
		).Scan(&teamID)
		switch {
		case err == sql.ErrNoRows:
			err = tx.QueryRow(
				`INSERT INTO teams (name, color, logo_url, created_by)
				 VALUES ($1,$2,'',NULLIF($3,'')::uuid) RETURNING id::text`,
				input.Name, input.Color, createdBy,
			).Scan(&teamID)
			if err != nil {
				return nil, err
			}
			result.TeamsCreated++
		case err != nil:
			return nil, err
		default:
			result.TeamsUpdated++
		}

		names := map[string]struct{}{}
		jerseys := map[int]struct{}{}
		maxSortOrder := -1
		rows, err := tx.Query(
			`SELECT LOWER(TRIM(name)), jersey_number, sort_order
			 FROM team_players WHERE team_id=$1 FOR UPDATE`, teamID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var name string
			var jersey, sortOrder int
			if err := rows.Scan(&name, &jersey, &sortOrder); err != nil {
				rows.Close()
				return nil, err
			}
			names[name] = struct{}{}
			if jersey > 0 {
				jerseys[jersey] = struct{}{}
			}
			if sortOrder > maxSortOrder {
				maxSortOrder = sortOrder
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()

		for playerIndex, player := range input.Players {
			if _, exists := names[strings.ToLower(strings.TrimSpace(player.Name))]; exists {
				return nil, fmt.Errorf("%w: %s already exists in %s", ErrTeamImportConflict, player.Name, input.Name)
			}
			if _, exists := jerseys[player.JerseyNumber]; exists {
				return nil, fmt.Errorf("%w: jersey number %d already exists in %s", ErrTeamImportConflict, player.JerseyNumber, input.Name)
			}
			if _, err := tx.Exec(
				`INSERT INTO team_players (team_id, name, gender, jersey_number, status, photo_url, sort_order)
				 VALUES ($1,$2,$3,$4,'playing','',$5)`,
				teamID, player.Name, player.Gender, player.JerseyNumber, maxSortOrder+playerIndex+1,
			); err != nil {
				return nil, err
			}
			names[strings.ToLower(strings.TrimSpace(player.Name))] = struct{}{}
			jerseys[player.JerseyNumber] = struct{}{}
			result.PlayersAdded++
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
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
			TeamID: teamID, Name: p.Name, Gender: p.Gender, JerseyNumber: p.JerseyNumber,
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
			`INSERT INTO team_players (team_id, name, gender, jersey_number, status, photo_url, sort_order)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			teamID, p.Name, p.Gender, p.JerseyNumber, status, p.PhotoURL, i)
		if err != nil {
			return err
		}
	}
	return nil
}
