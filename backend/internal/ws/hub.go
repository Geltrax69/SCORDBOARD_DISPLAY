package ws

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/scoreboard/backend/internal/models"
)

type Hub struct {
	mu       sync.RWMutex
	clients  map[*Client]bool
	rooms    map[string]map[*Client]bool
	global   map[*Client]bool

	register   chan *Client
	unregister chan *Client
	broadcast  chan roomMessage
}

type roomMessage struct {
	room    string
	message []byte
	// roomOnly skips the fan-out to global clients (used for screen rooms).
	roomOnly bool
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]map[*Client]bool),
		global:     make(map[*Client]bool),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		broadcast:  make(chan roomMessage, 1024),
	}
}

func (h *Hub) Run() {
	// Periodic cleanup of dead connections (every 2 minutes)
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			// Only clients that explicitly subscribed to "global" (admins, displays)
			// join the cross-match fan-out. Scorer devices are scoped to their own
			// match room so they never receive another court's events.
			for _, room := range client.rooms {
				if room == "global" {
					h.global[client] = true
					continue
				}
				if h.rooms[room] == nil {
					h.rooms[room] = make(map[*Client]bool)
				}
				h.rooms[room][client] = true
			}
			h.mu.Unlock()
			log.Printf("[ws] connected device=%s ip=%s match=%s total=%d",
				client.deviceName, client.ipAddress, client.matchID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if h.clients[client] {
				delete(h.clients, client)
				delete(h.global, client)
				for _, room := range client.rooms {
					delete(h.rooms[room], client)
					if len(h.rooms[room]) == 0 {
						delete(h.rooms, room)
					}
				}
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("[ws] disconnected device=%s total=%d", client.deviceName, len(h.clients))

		case msg := <-h.broadcast:
			h.mu.RLock()
			if msg.room == "global" {
				for client := range h.global {
					select {
					case client.send <- msg.message:
					default:
						// buffer full — skip
					}
				}
			} else {
				// Send to room clients
				roomClients := h.rooms[msg.room]
				for client := range roomClients {
					select {
					case client.send <- msg.message:
					default:
						// buffer full — skip
					}
				}
				// Also send to global clients who are NOT in the room clients map
				// (screen rooms are room-only: other TVs must not get them).
				for client := range h.global {
					if msg.roomOnly {
						break
					}
					if roomClients == nil || !roomClients[client] {
						select {
						case client.send <- msg.message:
						default:
							// buffer full — skip
						}
					}
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			// Clean up connections that haven't been seen in 5 minutes
			h.mu.Lock()
			now := time.Now()
			var deadClients []*Client
			for client := range h.clients {
				if now.Sub(client.lastSeen) > 5*time.Minute {
					deadClients = append(deadClients, client)
				}
			}
			h.mu.Unlock()
			for _, client := range deadClients {
				client.conn.Close()
				h.Unregister(client)
				log.Printf("[ws] removed dead connection device=%s (inactive for 5min)", client.deviceName)
			}
		}
	}
}

func (h *Hub) BroadcastToMatch(matchID string, msg models.WSMessage) {
	data, _ := json.Marshal(msg)
	h.broadcast <- roomMessage{room: matchID, message: data}
}

func (h *Hub) BroadcastGlobal(msg models.WSMessage) {
	data, _ := json.Marshal(msg)
	h.broadcast <- roomMessage{room: "global", message: data}
}

// BroadcastAll sends to every connected client regardless of room, so a display
// scoped to a single match still receives global overlays (sponsors, announcements).
func (h *Hub) BroadcastAll(msg models.WSMessage) {
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
	h.mu.RUnlock()
}

// ScreenRoom is the room a display joins for its named screen (?screen=<slug>).
func ScreenRoom(slug string) string { return "screen:" + slug }

// BroadcastToScreens sends only to displays on the given screens. Unlike
// BroadcastToMatch it does not fan out to global clients, so changing one TV
// never touches the others. It goes through the same queue as match events, so
// a TV sees a match end before any automatic switch to the next match.
func (h *Hub) BroadcastToScreens(slugs []string, msg models.WSMessage) {
	data, _ := json.Marshal(msg)
	seen := make(map[string]bool)
	for _, slug := range slugs {
		if seen[slug] {
			continue
		}
		seen[slug] = true
		h.broadcast <- roomMessage{room: ScreenRoom(slug), message: data, roomOnly: true}
	}
}

// ScreenOnline returns how many displays are connected to each named screen.
func (h *Hub) ScreenOnline() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	counts := make(map[string]int)
	for room, clients := range h.rooms {
		if slug, ok := strings.CutPrefix(room, "screen:"); ok {
			counts[slug] = len(clients)
		}
	}
	return counts
}

func (h *Hub) Register(c *Client) {
	h.register <- c
}

func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}

func (h *Hub) ConnectedCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetDevices returns info about all connected WebSocket clients
func (h *Hub) GetDevices() []models.DeviceInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var devices []models.DeviceInfo
	for c := range h.clients {
		devices = append(devices, models.DeviceInfo{
			ID:          c.id,
			DeviceName:  c.deviceName,
			IPAddress:   c.ipAddress,
			MatchID:     c.matchID,
			MatchCode:   c.matchCode,
			MatchName:   c.matchName,
			Role:        c.role,
			ConnectedAt: c.connectedAt,
			LastSeen:    c.lastSeen,
			Online:      true,
		})
	}
	return devices
}

// UpdateLastSeen refreshes the heartbeat timestamp for a client
func (h *Hub) UpdateLastSeen(c *Client) {
	h.mu.Lock()
	c.lastSeen = time.Now()
	h.mu.Unlock()
}
