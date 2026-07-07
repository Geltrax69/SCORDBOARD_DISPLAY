package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/netutil"
	"github.com/scoreboard/backend/internal/repository"
	ws_pkg "github.com/scoreboard/backend/internal/ws"
)

type DeviceHandler struct {
	hub           *ws_pkg.Hub
	matchRepo     *repository.MatchRepo
	jwtSecret     string
	frontendPort  string // e.g. "3000"

	// Current display layout + background (in-memory + DB backed)
	layoutMu   sync.RWMutex
	layout     models.DisplayLayoutPayload
	background string
	style      string
	db         *sql.DB
}

func NewDeviceHandler(hub *ws_pkg.Hub, matchRepo *repository.MatchRepo, secret string, info *models.ServerInfo, db *sql.DB) *DeviceHandler {
	h := &DeviceHandler{
		hub: hub, matchRepo: matchRepo,
		jwtSecret: secret, frontendPort: "3000", db: db,
		layout: models.DisplayLayoutPayload{Mode: 1, MatchIDs: []string{}},
		style:  "classic",
	}
	// Load persisted layout + background + style
	var mode int
	var matchIDsJSON []byte
	err := db.QueryRow(`SELECT mode, array_to_json(match_ids), background_url, display_style FROM current_display_layout LIMIT 1`).
		Scan(&mode, &matchIDsJSON, &h.background, &h.style)
	if err == nil {
		var ids []string
		if json.Unmarshal(matchIDsJSON, &ids) == nil {
			h.layout = models.DisplayLayoutPayload{Mode: mode, MatchIDs: ids}
		}
	}
	return h
}

// RefreshToken refreshes an expired or expiring device token
func (h *DeviceHandler) RefreshToken(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required"})
		return
	}

	claims, err := auth.ValidateToken(req.Token, h.jwtSecret)
	if err != nil && err.Error() != "token is expired" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	// Allow refresh for expired tokens as long as other claims are valid
	if claims == nil || claims.MatchID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid device token"})
		return
	}

	// Generate new token with same claims
	newToken, err := auth.GenerateDeviceToken(claims.MatchID, claims.DeviceName, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token generation failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": newToken})
}

// Connect — pair a scorer device using a 4-digit match code
func (h *DeviceHandler) Connect(c *gin.Context) {
	var req models.ConnectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	match, err := h.matchRepo.FindByCode(req.MatchCode)
	if err != nil || match == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid match code"})
		return
	}
	if match.Status == "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "match already completed"})
		return
	}

	deviceName := req.DeviceName
	if deviceName == "" {
		deviceName = "Scorer Device"
	}

	token, err := auth.GenerateDeviceToken(match.ID, deviceName, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
		return
	}
	c.JSON(http.StatusOK, models.ConnectResponse{Token: token, Match: match})
}

// GetServerInfo returns local IP, URLs, connected count — IP is resolved live
// so it reflects the current network even after WiFi/VPN changes.
func (h *DeviceHandler) GetServerInfo(c *gin.Context) {
	ip := netutil.LocalIP()
	connectURL := fmt.Sprintf("http://%s:%s/connect", ip, h.frontendPort)
	displayURL := fmt.Sprintf("http://%s:%s/display", ip, h.frontendPort)
	// In production, PUBLIC_BASE_URL (e.g. https://scorecast.simpedu.in) overrides
	// the LAN IP so the QR/connect/display links use the public domain.
	if base := strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/"); base != "" {
		connectURL = base + "/connect"
		displayURL = base + "/display"
	}
	info := models.ServerInfo{
		LocalIP:          ip,
		Port:             h.frontendPort,
		ConnectURL:       connectURL,
		DisplayURL:       displayURL,
		ConnectedDevices: h.hub.ConnectedCount(),
	}
	c.JSON(http.StatusOK, info)
}

// ListDevices returns only scorer/display devices (not admin browser tabs)
func (h *DeviceHandler) ListDevices(c *gin.Context) {
	all := h.hub.GetDevices()
	var filtered []models.DeviceInfo
	for _, d := range all {
		// Only include devices that are paired to a match, or are display clients
		if d.MatchID != "" || d.Role == "display" {
			filtered = append(filtered, d)
		}
	}
	if filtered == nil {
		filtered = []models.DeviceInfo{}
	}
	c.JSON(http.StatusOK, filtered)
}

// GetLayout returns the current display layout
func (h *DeviceHandler) GetLayout(c *gin.Context) {
	h.layoutMu.RLock()
	defer h.layoutMu.RUnlock()
	c.JSON(http.StatusOK, h.layout)
}

// SetLayout sets display layout, persists it, and broadcasts via WS
func (h *DeviceHandler) SetLayout(c *gin.Context) {
	var layout models.DisplayLayoutPayload
	if err := c.ShouldBindJSON(&layout); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if layout.MatchIDs == nil {
		layout.MatchIDs = []string{}
	}

	h.layoutMu.Lock()
	h.layout = layout
	h.layoutMu.Unlock()

	// Persist to DB
	go func() {
		ids := make([]string, len(layout.MatchIDs))
		copy(ids, layout.MatchIDs)
		h.db.Exec(`UPDATE current_display_layout SET mode=$1, match_ids=$2, updated_at=NOW()`,
			layout.Mode, pq_array(ids))
	}()

	// Broadcast to all display screens
	payload, _ := json.Marshal(layout)
	h.hub.BroadcastGlobal(models.WSMessage{
		Type:    models.EventDisplayLayout,
		Payload: payload,
	})

	c.JSON(http.StatusOK, layout)
}

// GetBackground returns the current persistent display background image URL.
func (h *DeviceHandler) GetBackground(c *gin.Context) {
	h.layoutMu.RLock()
	defer h.layoutMu.RUnlock()
	c.JSON(http.StatusOK, gin.H{"background_url": h.background})
}

// SetBackground stores the display background image (empty = clear), persists it,
// and broadcasts to every screen (including single-match displays).
func (h *DeviceHandler) SetBackground(c *gin.Context) {
	var req struct {
		BackgroundURL string `json:"background_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.layoutMu.Lock()
	h.background = req.BackgroundURL
	h.layoutMu.Unlock()

	go h.db.Exec(`UPDATE current_display_layout SET background_url=$1, updated_at=NOW()`, req.BackgroundURL)

	payload, _ := json.Marshal(gin.H{"background_url": req.BackgroundURL})
	h.hub.BroadcastAll(models.WSMessage{Type: models.EventDisplayBackground, Payload: payload})

	c.JSON(http.StatusOK, gin.H{"background_url": req.BackgroundURL})
}

// GetStyle returns the current scorecard display style ('classic' | 'cards').
func (h *DeviceHandler) GetStyle(c *gin.Context) {
	h.layoutMu.RLock()
	defer h.layoutMu.RUnlock()
	c.JSON(http.StatusOK, gin.H{"style": h.style})
}

// SetStyle stores the scorecard style, persists it, and broadcasts to all screens.
func (h *DeviceHandler) SetStyle(c *gin.Context) {
	var req struct {
		Style string `json:"style"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Style != "cards" {
		req.Style = "classic"
	}

	h.layoutMu.Lock()
	h.style = req.Style
	h.layoutMu.Unlock()

	go h.db.Exec(`UPDATE current_display_layout SET display_style=$1, updated_at=NOW()`, req.Style)

	payload, _ := json.Marshal(gin.H{"style": req.Style})
	h.hub.BroadcastAll(models.WSMessage{Type: models.EventDisplayStyle, Payload: payload})

	c.JSON(http.StatusOK, gin.H{"style": req.Style})
}

// pq_array converts []string to PostgreSQL array literal
func pq_array(s []string) interface{} {
	if len(s) == 0 {
		return "{}"
	}
	result := "{"
	for i, v := range s {
		if i > 0 {
			result += ","
		}
		result += `"` + v + `"`
	}
	result += "}"
	return result
}
