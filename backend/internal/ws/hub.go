package ws

import (
	"encoding/json"
	"log"
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
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.global[client] = true
			for _, room := range client.rooms {
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
			var targets map[*Client]bool
			if msg.room == "global" {
				targets = h.global
			} else {
				targets = h.rooms[msg.room]
			}
			for client := range targets {
				select {
				case client.send <- msg.message:
				default:
					// buffer full — skip
				}
			}
			h.mu.RUnlock()
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
