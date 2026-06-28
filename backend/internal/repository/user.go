package repository

import (
	"database/sql"
	"fmt"

	"github.com/scoreboard/backend/internal/models"
)

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) FindByEmail(email string) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, email, password_hash, name, role, created_at, updated_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func (r *UserRepo) FindByID(id string) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRow(
		`SELECT id, email, password_hash, name, role, created_at, updated_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func (r *UserRepo) Create(u *models.User) error {
	return r.db.QueryRow(
		`INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
		 RETURNING id, created_at, updated_at`,
		u.Email, u.PasswordHash, u.Name, u.Role,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
}

// Update changes username/name/role, and password only when a new hash is given.
func (r *UserRepo) Update(id, email, name string, role models.Role, passwordHash string) error {
	if passwordHash != "" {
		_, err := r.db.Exec(
			`UPDATE users SET email=$1, name=$2, role=$3, password_hash=$4, updated_at=NOW() WHERE id=$5`,
			email, name, role, passwordHash, id)
		return err
	}
	_, err := r.db.Exec(
		`UPDATE users SET email=$1, name=$2, role=$3, updated_at=NOW() WHERE id=$4`,
		email, name, role, id)
	return err
}

func (r *UserRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM users WHERE id=$1`, id)
	return err
}

func (r *UserRepo) List() ([]models.User, error) {
	rows, err := r.db.Query(
		`SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *UserRepo) IsAssignedToCourt(userID, courtID string) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM court_scorers WHERE user_id = $1 AND court_id = $2`,
		userID, courtID,
	).Scan(&count)
	return count > 0, err
}

func (r *UserRepo) AssignToCourt(userID, courtID string) error {
	_, err := r.db.Exec(
		`INSERT INTO court_scorers (user_id, court_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
		userID, courtID,
	)
	return err
}

func (r *UserRepo) GetCourtsByUser(userID string) ([]string, error) {
	rows, err := r.db.Query(
		`SELECT court_id FROM court_scorers WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *UserRepo) GetNameByID(id string) string {
	if id == "" {
		return ""
	}
	var name string
	err := r.db.QueryRow(`SELECT name FROM users WHERE id = $1`, id).Scan(&name)
	if err != nil {
		return fmt.Sprintf("user:%s", id[:8])
	}
	return name
}
