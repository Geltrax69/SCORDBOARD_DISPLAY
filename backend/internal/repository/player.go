package repository

import (
	"database/sql"

	"github.com/scoreboard/backend/internal/models"
)

type PlayerRepo struct {
	db *sql.DB
}

func NewPlayerRepo(db *sql.DB) *PlayerRepo {
	return &PlayerRepo{db: db}
}

func (r *PlayerRepo) SetPlayers(matchID string, players []models.Player) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM match_players WHERE match_id = $1`, matchID); err != nil {
		tx.Rollback()
		return err
	}
	for _, p := range players {
		status := p.Status
		if status == "" {
			status = "playing"
		}
		if _, err := tx.Exec(
			`INSERT INTO match_players (match_id, team, name, jersey_number, status, photo_url)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			matchID, p.Team, p.Name, p.JerseyNumber, status, p.PhotoURL,
		); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (r *PlayerRepo) GetByMatch(matchID string) ([]models.Player, error) {
	rows, err := r.db.Query(
		`SELECT id, match_id, team, name, jersey_number,
		        COALESCE(status,'playing'), COALESCE(photo_url,''),
		        created_at
		 FROM match_players WHERE match_id = $1
		 ORDER BY team, status DESC, jersey_number`,
		matchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var players []models.Player
	for rows.Next() {
		var p models.Player
		if err := rows.Scan(&p.ID, &p.MatchID, &p.Team, &p.Name,
			&p.JerseyNumber, &p.Status, &p.PhotoURL, &p.CreatedAt); err != nil {
			return nil, err
		}
		players = append(players, p)
	}
	if players == nil {
		players = []models.Player{}
	}
	return players, rows.Err()
}
