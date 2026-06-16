package repository

import (
	"database/sql"

	"github.com/scoreboard/backend/internal/models"
)

type DisplayAssetRepo struct {
	db *sql.DB
}

func NewDisplayAssetRepo(db *sql.DB) *DisplayAssetRepo {
	return &DisplayAssetRepo{db: db}
}

func (r *DisplayAssetRepo) Create(a *models.DisplayAsset) error {
	if a.Duration <= 0 {
		a.Duration = 10
	}
	return r.db.QueryRow(
		`INSERT INTO display_assets (type, title, body, image_url, duration)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at`,
		a.Type, a.Title, a.Body, a.ImageURL, a.Duration,
	).Scan(&a.ID, &a.CreatedAt)
}

func (r *DisplayAssetRepo) List() ([]models.DisplayAsset, error) {
	rows, err := r.db.Query(
		`SELECT id, type, title, body, image_url, duration, created_at
		 FROM display_assets ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	assets := []models.DisplayAsset{}
	for rows.Next() {
		var a models.DisplayAsset
		if err := rows.Scan(&a.ID, &a.Type, &a.Title, &a.Body, &a.ImageURL, &a.Duration, &a.CreatedAt); err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

func (r *DisplayAssetRepo) FindByID(id string) (*models.DisplayAsset, error) {
	var a models.DisplayAsset
	err := r.db.QueryRow(
		`SELECT id, type, title, body, image_url, duration, created_at
		 FROM display_assets WHERE id = $1`, id,
	).Scan(&a.ID, &a.Type, &a.Title, &a.Body, &a.ImageURL, &a.Duration, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *DisplayAssetRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM display_assets WHERE id = $1`, id)
	return err
}
