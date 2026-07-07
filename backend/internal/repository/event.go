package repository

import (
	"database/sql"
	"time"

	"github.com/scoreboard/backend/internal/models"
)

type EventRepo struct {
	db *sql.DB
}

func NewEventRepo(db *sql.DB) *EventRepo {
	return &EventRepo{db: db}
}

func (r *EventRepo) Create(e *models.Event) error {
	var createdBy interface{}
	if e.CreatedBy != "" {
		createdBy = e.CreatedBy
	}
	return r.db.QueryRow(
		`INSERT INTO events (match_id, type, payload, created_by)
		 VALUES ($1,$2,$3,$4)
		 RETURNING id, created_at, sequence`,
		e.MatchID, e.Type, e.Payload, createdBy,
	).Scan(&e.ID, &e.CreatedAt, &e.Sequence)
}

// DeleteByType removes all events of a given type for a match. Used to keep a
// single "first server" record instead of one row per toggle before kickoff.
func (r *EventRepo) DeleteByType(matchID, eventType string) error {
	_, err := r.db.Exec(`DELETE FROM events WHERE match_id = $1 AND type = $2`, matchID, eventType)
	return err
}

func (r *EventRepo) ListByMatch(matchID string) ([]models.Event, error) {
	rows, err := r.db.Query(`
		SELECT e.id, e.match_id, e.type, e.payload,
		       COALESCE(e.created_by::text, ''),
		       e.created_at, e.undone, e.undone_at, e.undone_by, e.sequence,
		       COALESCE(u.name, '')
		FROM events e
		LEFT JOIN users u ON u.id = e.created_by
		WHERE e.match_id = $1
		ORDER BY e.sequence ASC`, matchID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.Event
	for rows.Next() {
		var ev models.Event
		var undonAt sql.NullTime
		var undoneBy sql.NullString
		if err := rows.Scan(
			&ev.ID, &ev.MatchID, &ev.Type, &ev.Payload, &ev.CreatedBy,
			&ev.CreatedAt, &ev.Undone, &undonAt, &undoneBy, &ev.Sequence,
			&ev.CreatedByName,
		); err != nil {
			return nil, err
		}
		if undonAt.Valid {
			t := undonAt.Time
			ev.UndonAt = &t
		}
		if undoneBy.Valid {
			s := undoneBy.String
			ev.UndoneBy = &s
		}
		events = append(events, ev)
	}
	return events, rows.Err()
}

func (r *EventRepo) FindByID(id string) (*models.Event, error) {
	ev := &models.Event{}
	var undonAt sql.NullTime
	var undoneBy sql.NullString
	err := r.db.QueryRow(`
		SELECT id, match_id, type, payload,
		       COALESCE(created_by::text, ''),
		       created_at, undone, undone_at, undone_by, sequence
		FROM events WHERE id = $1`, id,
	).Scan(
		&ev.ID, &ev.MatchID, &ev.Type, &ev.Payload, &ev.CreatedBy,
		&ev.CreatedAt, &ev.Undone, &undonAt, &undoneBy, &ev.Sequence,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if undonAt.Valid {
		t := undonAt.Time
		ev.UndonAt = &t
	}
	if undoneBy.Valid {
		s := undoneBy.String
		ev.UndoneBy = &s
	}
	return ev, err
}

func (r *EventRepo) Undo(eventID, undoneBy string) error {
	now := time.Now()
	_, err := r.db.Exec(
		`UPDATE events SET undone = TRUE, undone_at = $1, undone_by = $2 WHERE id = $3`,
		now, undoneBy, eventID,
	)
	return err
}

func (r *EventRepo) Redo(eventID string) error {
	_, err := r.db.Exec(
		`UPDATE events SET undone = FALSE, undone_at = NULL, undone_by = NULL WHERE id = $1`,
		eventID,
	)
	return err
}

func (r *EventRepo) GetLastUndone(matchID string) (*models.Event, error) {
	ev := &models.Event{}
	err := r.db.QueryRow(`
		SELECT id, match_id, type, payload,
		       COALESCE(created_by::text, ''), created_at, sequence
		FROM events
		WHERE match_id = $1 AND undone = TRUE
		ORDER BY sequence DESC LIMIT 1`, matchID,
	).Scan(&ev.ID, &ev.MatchID, &ev.Type, &ev.Payload, &ev.CreatedBy, &ev.CreatedAt, &ev.Sequence)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return ev, err
}
