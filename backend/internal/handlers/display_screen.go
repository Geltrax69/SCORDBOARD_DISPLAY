package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	ws_pkg "github.com/scoreboard/backend/internal/ws"
)

// ScreenHandler manages named display screens: each TV opens
// /display?screen=<slug> once and the admin controls every screen separately.
type ScreenHandler struct {
	repo *repository.DisplayScreenRepo
	hub  *ws_pkg.Hub
}

func NewScreenHandler(repo *repository.DisplayScreenRepo, hub *ws_pkg.Hub) *ScreenHandler {
	return &ScreenHandler{repo: repo, hub: hub}
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const maxSlugLen = 40

// slugify turns "Court A — TV 1" into "court-a-tv-1".
func slugify(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if b.Len() > 0 && !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	slug := strings.Trim(b.String(), "-")
	if len(slug) > maxSlugLen {
		slug = strings.Trim(slug[:maxSlugLen], "-")
	}
	return slug
}

// List returns every screen with how many displays are currently connected to it.
func (h *ScreenHandler) List(c *gin.Context) {
	screens, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list screens"})
		return
	}
	online := h.hub.ScreenOnline()
	for i := range screens {
		screens[i].Online = online[screens[i].Slug]
	}
	c.JSON(http.StatusOK, screens)
}

// Get returns one screen's layout. Public, like the old /display/layout.
func (h *ScreenHandler) Get(c *gin.Context) {
	h.respondScreen(c, c.Param("slug"))
}

// GetMainLayout keeps the old GET /display/layout working for plain /display.
func (h *ScreenHandler) GetMainLayout(c *gin.Context) {
	h.respondScreen(c, repository.MainScreenSlug)
}

func (h *ScreenHandler) respondScreen(c *gin.Context, slug string) {
	screen, err := h.repo.Find(slug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load screen"})
		return
	}
	if screen == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "screen not found"})
		return
	}
	c.JSON(http.StatusOK, screen)
}

func (h *ScreenHandler) Create(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "screen name is required"})
		return
	}
	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = slugify(req.Name)
	}
	if len(slug) > maxSlugLen || !slugPattern.MatchString(slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "screen link name may only use lowercase letters, numbers and dashes"})
		return
	}

	screen, created, err := h.repo.Create(slug, req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create screen"})
		return
	}
	if !created {
		c.JSON(http.StatusConflict, gin.H{"error": "a screen with link name \"" + slug + "\" already exists"})
		return
	}
	c.JSON(http.StatusCreated, screen)
}

// Rename changes the label only; the slug stays so the TV's link keeps working.
func (h *ScreenHandler) Rename(c *gin.Context) {
	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "screen name is required"})
		return
	}
	screen, err := h.repo.Rename(c.Param("slug"), req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to rename screen"})
		return
	}
	if screen == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "screen not found"})
		return
	}
	c.JSON(http.StatusOK, screen)
}

func (h *ScreenHandler) Delete(c *gin.Context) {
	slug := c.Param("slug")
	if slug == repository.MainScreenSlug {
		c.JSON(http.StatusBadRequest, gin.H{"error": "the main display cannot be deleted"})
		return
	}
	found, err := h.repo.Delete(slug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete screen"})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "screen not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// SetLayout pushes a layout to one screen only.
func (h *ScreenHandler) SetLayout(c *gin.Context) {
	h.setLayout(c, c.Param("slug"))
}

// SetMainLayout keeps the old POST /display/layout working for plain /display.
func (h *ScreenHandler) SetMainLayout(c *gin.Context) {
	h.setLayout(c, repository.MainScreenSlug)
}

func (h *ScreenHandler) setLayout(c *gin.Context, slug string) {
	var layout models.DisplayLayoutPayload
	if err := c.ShouldBindJSON(&layout); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if layout.Mode < 1 || layout.Mode > 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mode must be between 1 and 5"})
		return
	}
	if layout.MatchIDs == nil {
		layout.MatchIDs = []string{}
	}

	screen, err := h.repo.SetLayout(slug, layout)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save layout"})
		return
	}
	if screen == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "screen not found"})
		return
	}

	layout.Screen = slug
	payload, _ := json.Marshal(layout)
	h.hub.BroadcastToScreens([]string{slug}, models.WSMessage{Type: models.EventDisplayLayout, Payload: payload})

	c.JSON(http.StatusOK, screen)
}

// Identify flashes the screen's name on its TV so staff can tell which is which.
func (h *ScreenHandler) Identify(c *gin.Context) {
	screen, err := h.repo.Find(c.Param("slug"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load screen"})
		return
	}
	if screen == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "screen not found"})
		return
	}
	payload, _ := json.Marshal(gin.H{"screen": screen.Slug, "name": screen.Name})
	h.hub.BroadcastToScreens([]string{screen.Slug}, models.WSMessage{Type: models.EventDisplayIdentify, Payload: payload})
	c.JSON(http.StatusOK, gin.H{"message": "identify sent", "online": h.hub.ScreenOnline()[screen.Slug]})
}
