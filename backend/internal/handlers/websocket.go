package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	ws_pkg "github.com/scoreboard/backend/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type WebSocketHandler struct {
	hub       *ws_pkg.Hub
	matchRepo *repository.MatchRepo
}

func NewWebSocketHandler(hub *ws_pkg.Hub, matchRepo *repository.MatchRepo) *WebSocketHandler {
	return &WebSocketHandler{hub: hub, matchRepo: matchRepo}
}

func (h *WebSocketHandler) Connect(c *gin.Context) {
	userID     := auth.GetUserID(c)
	role       := auth.GetRole(c)
	deviceName := auth.GetDeviceName(c)
	tokenMatchID := auth.GetMatchID(c)

	if deviceName == "" {
		deviceName = "Browser"
	}

	// Extract real client IP
	ipAddress := c.GetHeader("X-Real-IP")
	if ipAddress == "" {
		ipAddress = c.GetHeader("X-Forwarded-For")
	}
	if ipAddress == "" {
		ipAddress = c.ClientIP()
	}
	// Take only first IP if comma-separated
	if idx := strings.Index(ipAddress, ","); idx != -1 {
		ipAddress = strings.TrimSpace(ipAddress[:idx])
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "WebSocket upgrade failed: " + err.Error()})
		return
	}

	// Determine rooms and match info.
	// A device (scorer) token carries a match_id claim — that scorer is LOCKED to
	// its own match: it never joins the global fan-out, so it can't receive (or be
	// switched to) another court's match. Admins/displays join global as usual.
	var rooms []string
	isDevice := tokenMatchID != ""
	matchID := c.Param("id")
	if isDevice {
		matchID = tokenMatchID // ignore any route id — scorer is scoped to its token's match
	}

	matchCode := ""
	matchName := ""
	if matchID != "" {
		rooms = append(rooms, matchID)
		if m, err := h.matchRepo.FindByID(matchID); err == nil && m != nil {
			matchCode = m.MatchCode
			matchName = m.TeamA + " vs " + m.TeamB
		}
	}
	if !isDevice {
		rooms = append(rooms, "global")
	}

	client := ws_pkg.NewClient(h.hub, conn, userID, role, ipAddress, deviceName, matchID, matchCode, matchName, rooms)
	h.hub.Register(client)

	// Send initial connected message
	connMsg, _ := json.Marshal(models.WSConnectedMsg{UserID: userID, Role: role})
	conn.WriteMessage(websocket.TextMessage, mustMarshalWS(models.WSMessage{
		Type:    "connected",
		Payload: connMsg,
	}))

	go client.WritePump()
	client.ReadPump()
}

func mustMarshalWS(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
