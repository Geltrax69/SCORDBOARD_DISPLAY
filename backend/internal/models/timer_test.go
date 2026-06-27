package models

import (
	"encoding/json"
	"testing"
	"time"
)

func ev(t string, at time.Time, payload string) Event {
	return Event{Type: t, CreatedAt: at, Payload: json.RawMessage(payload)}
}

// Timer accumulates only while running and freezes on pause — and the value is
// the same no matter how many score events arrive in between (the bug was that
// every event reset the clock to 0).
func TestCalculateStateTimer(t *testing.T) {
	base := time.Now().Add(-10 * time.Minute)

	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base.Add(0*time.Second), "{}"),
		ev(EventScoreUpdate, base.Add(30*time.Second), `{"team":"A","points":2}`),
		ev(EventTimerPause, base.Add(60*time.Second), "{}"),     // ran 60s
		ev(EventScoreUpdate, base.Add(90*time.Second), `{"team":"B","points":3}`), // paused, no time added
		ev(EventTimerStart, base.Add(120*time.Second), "{}"),
		ev(EventTimerPause, base.Add(150*time.Second), "{}"),    // +30s => 90s total
	}

	st := CalculateState(events)

	if st.TimerSeconds != 90 {
		t.Fatalf("expected 90s elapsed, got %d", st.TimerSeconds)
	}
	if st.TimerRunning {
		t.Fatalf("timer should be paused")
	}
	if st.ScoreA != 2 || st.ScoreB != 3 {
		t.Fatalf("scores wrong: A=%d B=%d", st.ScoreA, st.ScoreB)
	}

	// Adding a score event while paused must NOT change the elapsed time.
	events = append(events, ev(EventScoreUpdate, base.Add(180*time.Second), `{"team":"A","points":1}`))
	if got := CalculateState(events).TimerSeconds; got != 90 {
		t.Fatalf("score while paused changed timer: got %d", got)
	}
}

// While running, the clock counts up to "now" so a freshly-loaded display shows
// real elapsed time instead of a frozen snapshot.
func TestCalculateStateTimerRunning(t *testing.T) {
	base := time.Now().Add(-45 * time.Second)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
	}
	st := CalculateState(events)
	if !st.TimerRunning {
		t.Fatalf("timer should be running")
	}
	if st.TimerSeconds < 44 || st.TimerSeconds > 47 {
		t.Fatalf("expected ~45s elapsed, got %d", st.TimerSeconds)
	}
}

// A timeout freezes the clock just like a pause.
func TestCalculateStateTimerTimeout(t *testing.T) {
	base := time.Now().Add(-5 * time.Minute)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
		ev(EventTimeoutStart, base.Add(20*time.Second), `{"team":"A","type":"timeout","duration":60}`),
		ev(EventTimeoutEnd, base.Add(80*time.Second), "{}"),
	}
	st := CalculateState(events)
	// Clock froze for the 60s timeout (20s elapsed before it), then auto-resumes
	// at timeout_end and keeps counting to now (~base+5min => ~220s after resume).
	if !st.TimerRunning {
		t.Fatalf("timer should auto-resume after timeout ends")
	}
	if st.TimerSeconds < 235 || st.TimerSeconds > 245 {
		t.Fatalf("expected ~240s (20 pre + ~220 post-resume), got %d", st.TimerSeconds)
	}
}
