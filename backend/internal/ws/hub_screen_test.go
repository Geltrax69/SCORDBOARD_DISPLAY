package ws

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/scoreboard/backend/internal/models"
)

func registerTestClient(t *testing.T, h *Hub, rooms ...string) *Client {
	t.Helper()
	c := NewClient(h, nil, "u", "super_admin", "127.0.0.1", "TV", "", "", "", rooms)
	h.Register(c)
	return c
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for hub")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestBroadcastToScreensReachesOnlyThatScreen(t *testing.T) {
	h := NewHub()
	go h.Run()

	courtA := registerTestClient(t, h, "global", ScreenRoom("court-a"))
	courtB := registerTestClient(t, h, "global", ScreenRoom("court-b"))
	admin := registerTestClient(t, h, "global")
	waitFor(t, func() bool { return h.ConnectedCount() == 3 })

	h.BroadcastToScreens([]string{"court-a"}, models.WSMessage{Type: models.EventDisplayLayout})
	// A later global message proves the hub has finished with the screen one.
	h.BroadcastGlobal(models.WSMessage{Type: models.EventAnnouncement})
	waitFor(t, func() bool { return len(admin.send) == 1 })

	if len(courtA.send) != 2 {
		t.Fatalf("court-a should receive layout + announcement, got %d messages", len(courtA.send))
	}
	if len(courtB.send) != 1 || len(admin.send) != 1 {
		t.Fatalf("other clients must not receive it: court-b=%d admin=%d", len(courtB.send), len(admin.send))
	}
}

func TestBroadcastToScreensSendsOncePerClient(t *testing.T) {
	h := NewHub()
	go h.Run()

	tv := registerTestClient(t, h, "global", ScreenRoom("court-a"))
	waitFor(t, func() bool { return h.ConnectedCount() == 1 })

	h.BroadcastToScreens([]string{"court-a", "court-a"}, models.WSMessage{Type: models.EventAnnouncement})
	h.BroadcastGlobal(models.WSMessage{Type: models.EventDisplayStyle})
	waitFor(t, func() bool { return len(tv.send) >= 2 })
	if len(tv.send) != 2 {
		t.Fatalf("expected the screen message once plus the global one, got %d", len(tv.send))
	}
}

func TestScreenOnlineCountsDisplaysPerScreen(t *testing.T) {
	h := NewHub()
	go h.Run()

	registerTestClient(t, h, "global", ScreenRoom("main"))
	registerTestClient(t, h, "global", ScreenRoom("main"))
	registerTestClient(t, h, "global", ScreenRoom("lobby"))
	registerTestClient(t, h, "match-1")
	waitFor(t, func() bool { return h.ConnectedCount() == 4 })

	got := h.ScreenOnline()
	if got["main"] != 2 || got["lobby"] != 1 || len(got) != 2 {
		t.Fatalf("unexpected online counts: %v", got)
	}
}

// A match ending must reach a TV before court-follow switches it to the next match.
func TestScreenBroadcastKeepsOrderWithMatchEvents(t *testing.T) {
	h := NewHub()
	go h.Run()

	tv := registerTestClient(t, h, "global", ScreenRoom("court-a"))
	waitFor(t, func() bool { return h.ConnectedCount() == 1 })

	h.BroadcastToMatch("match-1", models.WSMessage{Type: models.EventMatchEnd})
	h.BroadcastToScreens([]string{"court-a"}, models.WSMessage{Type: models.EventDisplayLayout})
	waitFor(t, func() bool { return len(tv.send) == 2 })

	var first, second models.WSMessage
	json.Unmarshal(<-tv.send, &first)
	json.Unmarshal(<-tv.send, &second)
	if first.Type != models.EventMatchEnd || second.Type != models.EventDisplayLayout {
		t.Fatalf("wrong order: %s then %s", first.Type, second.Type)
	}
}
