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
		ev(EventTimerPause, base.Add(60*time.Second), "{}"),                       // ran 60s
		ev(EventScoreUpdate, base.Add(90*time.Second), `{"team":"B","points":3}`), // paused, no time added
		ev(EventTimerStart, base.Add(120*time.Second), "{}"),
		ev(EventTimerPause, base.Add(150*time.Second), "{}"), // +30s => 90s total
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

// A timeout does NOT stop the match clock — it keeps running underneath the
// timeout overlay. Only a court change stops it.
func TestCalculateStateTimerTimeoutKeepsRunning(t *testing.T) {
	base := time.Now().Add(-5 * time.Minute)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
		ev(EventTimeoutStart, base.Add(20*time.Second), `{"team":"A","type":"timeout","duration":60}`),
		ev(EventTimeoutEnd, base.Add(80*time.Second), "{}"),
	}
	st := CalculateState(events)
	if !st.TimerRunning {
		t.Fatalf("timer should still be running after a timeout")
	}
	// Ran uninterrupted for the whole 5 minutes, timeout included.
	if st.TimerSeconds < 295 || st.TimerSeconds > 305 {
		t.Fatalf("expected ~300s (timeout must not deduct time), got %d", st.TimerSeconds)
	}
}

// While a timeout is still open the clock keeps advancing.
func TestCalculateStateTimerDuringOpenTimeout(t *testing.T) {
	base := time.Now().Add(-90 * time.Second)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
		ev(EventTimeoutStart, base.Add(30*time.Second), `{"team":"A","type":"timeout","duration":60}`),
	}
	st := CalculateState(events)
	if !st.TimerRunning {
		t.Fatalf("clock must keep running inside a timeout")
	}
	if st.TimerSeconds < 85 || st.TimerSeconds > 95 {
		t.Fatalf("expected ~90s of continuous running, got %d", st.TimerSeconds)
	}
}

// A referee's explicit pause still stops the clock, even during a timeout.
func TestCalculateStateManualPauseStillWorksInTimeout(t *testing.T) {
	base := time.Now().Add(-3 * time.Minute)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
		ev(EventTimeoutStart, base.Add(20*time.Second), `{"team":"A","type":"timeout","duration":60}`),
		ev(EventTimerPause, base.Add(40*time.Second), "{}"),
	}
	st := CalculateState(events)
	if st.TimerRunning {
		t.Fatalf("an explicit timer_pause must still stop the clock")
	}
	if st.TimerSeconds != 40 {
		t.Fatalf("expected 40s frozen at the pause, got %d", st.TimerSeconds)
	}
}

// Court change (a completed set) is the one thing that stops the match clock.
func TestCourtChangeStopsClock(t *testing.T) {
	base := time.Now().Add(-30 * time.Second)
	events := []Event{
		ev(EventMatchStart, base, "{}"),
		ev(EventTimerStart, base, "{}"),
	}
	// Drive set 1 to 15-0 so it closes and triggers the court-change break.
	at := base.Add(10 * time.Second)
	for i := 0; i < 15; i++ {
		events = append(events, ev(EventScoreUpdate, at, `{"team":"A","points":1}`))
	}
	st := CalculateState(events)
	if st.TimerRunning {
		t.Fatalf("clock must stop for the court-change break")
	}
	if len(st.CompletedSets) != 1 {
		t.Fatalf("expected 1 completed set, got %d", len(st.CompletedSets))
	}
	if st.BreakRemaining <= 0 {
		t.Fatalf("expected a court-change break countdown, got %d", st.BreakRemaining)
	}
	if st.TimerSeconds != 10 {
		t.Fatalf("expected clock frozen at 10s when the set closed, got %d", st.TimerSeconds)
	}
}
