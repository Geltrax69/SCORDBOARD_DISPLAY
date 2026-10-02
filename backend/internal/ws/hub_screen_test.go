package ws

import (
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

	if len(courtA.send) != 1 {
		t.Fatalf("court-a should receive the layout, got %d messages", len(courtA.send))
	}
	if len(courtB.send) != 0 || len(admin.send) != 0 {
		t.Fatalf("other clients must not receive it: court-b=%d admin=%d", len(courtB.send), len(admin.send))
	}
}

func TestBroadcastToScreensSendsOncePerClient(t *testing.T) {
	h := NewHub()
	go h.Run()

	tv := registerTestClient(t, h, "global", ScreenRoom("court-a"))
	waitFor(t, func() bool { return h.ConnectedCount() == 1 })

	h.BroadcastToScreens([]string{"court-a", "court-a"}, models.WSMessage{Type: models.EventAnnouncement})
	if len(tv.send) != 1 {
		t.Fatalf("expected one message, got %d", len(tv.send))
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
