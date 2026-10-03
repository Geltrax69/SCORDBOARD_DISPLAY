package repository

import (
	"database/sql"

	"github.com/lib/pq"
	"github.com/scoreboard/backend/internal/models"
)

// MainScreenSlug is the screen plain /display (no ?screen=) shows.
const MainScreenSlug = "main"

type DisplayScreenRepo struct {
	db *sql.DB
}

func NewDisplayScreenRepo(db *sql.DB) *DisplayScreenRepo {
	return &DisplayScreenRepo{db: db}
}

const screenColumns = `slug, name, mode, match_ids, show_player_animation, COALESCE(follow_court_id::text, ''), updated_at`

func scanScreen(row interface{ Scan(...any) error }) (*models.DisplayScreen, error) {
	var s models.DisplayScreen
	var ids pq.StringArray
	if err := row.Scan(&s.Slug, &s.Name, &s.Mode, &ids, &s.ShowPlayerAnimation, &s.FollowCourtID, &s.UpdatedAt); err != nil {
		return nil, err
	}
	s.MatchIDs = []string(ids)
	if s.MatchIDs == nil {
		s.MatchIDs = []string{}
	}
	return &s, nil
}

func (r *DisplayScreenRepo) List() ([]models.DisplayScreen, error) {
	rows, err := r.db.Query(`SELECT ` + screenColumns + ` FROM display_screens
		ORDER BY (slug = 'main') DESC, created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	screens := []models.DisplayScreen{}
	for rows.Next() {
		s, err := scanScreen(rows)
		if err != nil {
			return nil, err
		}
		screens = append(screens, *s)
	}
	return screens, rows.Err()
}

// Find returns nil, nil when no screen has that slug.
func (r *DisplayScreenRepo) Find(slug string) (*models.DisplayScreen, error) {
	s, err := scanScreen(r.db.QueryRow(`SELECT `+screenColumns+` FROM display_screens WHERE slug = $1`, slug))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

// Create inserts a new screen; created is false when the slug is already taken.
func (r *DisplayScreenRepo) Create(slug, name string) (screen *models.DisplayScreen, created bool, err error) {
	s, err := scanScreen(r.db.QueryRow(
		`INSERT INTO display_screens (slug, name) VALUES ($1, $2)
		 ON CONFLICT (slug) DO NOTHING
		 RETURNING `+screenColumns, slug, name))
	if err == sql.ErrNoRows {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return s, true, nil
}

// Rename returns nil, nil when the screen does not exist.
func (r *DisplayScreenRepo) Rename(slug, name string) (*models.DisplayScreen, error) {
	s, err := scanScreen(r.db.QueryRow(
		`UPDATE display_screens SET name = $2, updated_at = NOW() WHERE slug = $1
		 RETURNING `+screenColumns, slug, name))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

// SetLayout saves a layout picked by hand, which also stops any court-follow.
// It returns nil, nil when the screen does not exist.
func (r *DisplayScreenRepo) SetLayout(slug string, layout models.DisplayLayoutPayload) (*models.DisplayScreen, error) {
	ids := layout.MatchIDs
	if ids == nil {
		ids = []string{}
	}
	s, err := scanScreen(r.db.QueryRow(
		`UPDATE display_screens
		 SET mode = $2, match_ids = $3, show_player_animation = $4, follow_court_id = NULL, updated_at = NOW()
		 WHERE slug = $1
		 RETURNING `+screenColumns, slug, layout.Mode, pq.Array(ids), layout.ShowPlayerAnimation))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

// SetFollow makes a screen follow a court ("" stops following and keeps the
// current layout). It returns nil, nil when the screen does not exist.
func (r *DisplayScreenRepo) SetFollow(slug, courtID string, showPlayerAnimation bool) (*models.DisplayScreen, error) {
	s, err := scanScreen(r.db.QueryRow(
		`UPDATE display_screens
		 SET follow_court_id = NULLIF($2, '')::uuid, show_player_animation = $3, updated_at = NOW()
		 WHERE slug = $1
		 RETURNING `+screenColumns, slug, courtID, showPlayerAnimation))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

// SetFollowedMatch stores the match a court-following screen switched to,
// without touching its follow setting. Empty matchID = nothing to show.
func (r *DisplayScreenRepo) SetFollowedMatch(slug, matchID string) error {
	ids := []string{}
	if matchID != "" {
		ids = append(ids, matchID)
	}
	_, err := r.db.Exec(
		`UPDATE display_screens SET mode = 1, match_ids = $2, updated_at = NOW() WHERE slug = $1`,
		slug, pq.Array(ids))
	return err
}

// FollowingCourt returns the screens that follow the given court.
func (r *DisplayScreenRepo) FollowingCourt(courtID string) ([]models.DisplayScreen, error) {
	rows, err := r.db.Query(`SELECT `+screenColumns+` FROM display_screens WHERE follow_court_id = $1`, courtID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	screens := []models.DisplayScreen{}
	for rows.Next() {
		s, err := scanScreen(rows)
		if err != nil {
			return nil, err
		}
		screens = append(screens, *s)
	}
	return screens, rows.Err()
}

// CourtCurrentMatch picks what a court-following screen shows: the court's
// live match (active, timeout or paused), otherwise its next pending match in
// the order they were created. "" means the court has nothing left to play.
func (r *DisplayScreenRepo) CourtCurrentMatch(courtID string) (string, error) {
	var id string
	err := r.db.QueryRow(
		`SELECT id FROM matches
		 WHERE court_id = $1 AND status IN ('active', 'timeout', 'paused', 'pending')
		 ORDER BY (status = 'pending'), created_at, id
		 LIMIT 1`, courtID).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return id, err
}

func (r *DisplayScreenRepo) Delete(slug string) (bool, error) {
	res, err := r.db.Exec(`DELETE FROM display_screens WHERE slug = $1`, slug)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}
