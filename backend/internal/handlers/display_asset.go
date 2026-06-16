package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	ws_pkg "github.com/scoreboard/backend/internal/ws"
)

type AssetHandler struct {
	repo *repository.DisplayAssetRepo
	hub  *ws_pkg.Hub
}

func NewAssetHandler(repo *repository.DisplayAssetRepo, hub *ws_pkg.Hub) *AssetHandler {
	return &AssetHandler{repo: repo, hub: hub}
}

// Create saves a reusable sponsor card or announcement.
func (h *AssetHandler) Create(c *gin.Context) {
	var req models.CreateDisplayAssetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Type != "sponsor" && req.Type != "announcement" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be 'sponsor' or 'announcement'"})
		return
	}
	if req.Type == "sponsor" && req.ImageURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sponsor requires an image"})
		return
	}
	if req.Type == "announcement" && req.Body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "announcement requires text"})
		return
	}

	asset := &models.DisplayAsset{
		Type:     req.Type,
		Title:    req.Title,
		Body:     req.Body,
		ImageURL: req.ImageURL,
		Duration: req.Duration,
	}
	if err := h.repo.Create(asset); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save asset"})
		return
	}
	c.JSON(http.StatusCreated, asset)
}

// List returns all saved assets (newest first).
func (h *AssetHandler) List(c *gin.Context) {
	assets, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list assets"})
		return
	}
	c.JSON(http.StatusOK, assets)
}

// Delete removes a saved asset.
func (h *AssetHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete asset"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// Show pushes a saved asset to every display screen via WebSocket.
func (h *AssetHandler) Show(c *gin.Context) {
	asset, err := h.repo.FindByID(c.Param("id"))
	if err != nil || asset == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}

	if asset.Type == "sponsor" {
		payload, _ := json.Marshal(models.SponsorPayload{
			Title:    asset.Title,
			ImageURL: asset.ImageURL,
			Duration: asset.Duration,
		})
		h.hub.BroadcastGlobal(models.WSMessage{Type: models.EventSponsorShow, Payload: payload})
	} else {
		payload, _ := json.Marshal(models.AnnouncementPayload{
			Message:  asset.Body,
			Title:    asset.Title,
			ImageURL: asset.ImageURL,
			Duration: asset.Duration,
		})
		h.hub.BroadcastGlobal(models.WSMessage{Type: models.EventAnnouncement, Payload: payload})
	}

	c.JSON(http.StatusOK, gin.H{"message": "shown"})
}
