package ws

import (
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 50 * time.Second
	maxMessageSize = 8192
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte

	// Identity
	id         string
	userID     string
	role       string
	deviceName string
	ipAddress  string

	// Match subscription
	matchID   string
	matchCode string
	matchName string
	rooms     []string

	// Timing
	connectedAt time.Time
	lastSeen    time.Time
}

func NewClient(hub *Hub, conn *websocket.Conn, userID, role, ipAddress, deviceName, matchID, matchCode, matchName string, rooms []string) *Client {
	return &Client{
		hub:         hub,
		conn:        conn,
		send:        make(chan []byte, 256),
		id:          uuid.New().String(),
		userID:      userID,
		role:        role,
		deviceName:  deviceName,
		ipAddress:   ipAddress,
		matchID:     matchID,
		matchCode:   matchCode,
		matchName:   matchName,
		rooms:       rooms,
		connectedAt: time.Now(),
		lastSeen:    time.Now(),
	}
}

func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		c.hub.UpdateLastSeen(c)
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[ws] read error device=%s: %v", c.deviceName, err)
			}
			break
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
