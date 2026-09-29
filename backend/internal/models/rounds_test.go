package models

import (
	"testing"
	"time"
)

// winSet drives `n` points for the given team so the current set closes.
func winSet(events []Event, team string, at time.Time) []Event {
	for i := 0; i < 15; i++ {
		events = append(events, ev(EventScoreUpdate, at, `{"team":"`+team+`","points":1}`))
	}
	return events
}

// winRound takes two straight sets for `team`, closing the round.
func winRound(events []Event, team string, at time.Time) []Event {
	events = winSet(events, team, at)
	events = winSet(events, team, at)
	return events
}

func start(base time.Time) []Event {
	return []Event{ev(EventMatchStart, base, "{}"), ev(EventTimerStart, base, "{}")}
}

// Regu is a single round: two sets ends the whole match.
func TestReguOneRound(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	st := CalculateStateFor(evs, EventTypeRegu)

	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("regu should complete with A winning, got status=%s winner=%q", st.Status, st.Winner)
	}
	if st.RoundsA != 1 || st.TotalRounds != 1 {
		t.Fatalf("expected 1/1 rounds, got roundsA=%d total=%d", st.RoundsA, st.TotalRounds)
	}
	if st.AwaitingRound {
		t.Fatalf("a finished regu must not wait for another round")
	}
}

// Double: winning round 1 does NOT end the match — it waits for the controller.
func TestDoubleWaitsForNextRound(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	st := CalculateStateFor(evs, EventTypeDouble)

	if st.Status == "completed" {
		t.Fatalf("double must not finish after one round")
	}
	if !st.AwaitingRound {
		t.Fatalf("expected to be awaiting round 2")
	}
	if st.RoundsA != 1 || st.RoundNumber != 1 {
		t.Fatalf("expected roundsA=1 while still on round 1, got %d / round %d", st.RoundsA, st.RoundNumber)
	}
	if st.TimerRunning {
		t.Fatalf("clock must stop between rounds")
	}
}

// round_start opens round 2 with a clean slate.
func TestRoundStartResetsSets(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	evs = append(evs, ev(EventRoundStart, base.Add(2*time.Second), "{}"))
	st := CalculateStateFor(evs, EventTypeDouble)

	if st.AwaitingRound {
		t.Fatalf("round_start should clear the wait")
	}
	if st.RoundNumber != 2 {
		t.Fatalf("expected round 2, got %d", st.RoundNumber)
	}
	if st.SetsA != 0 || st.SetsB != 0 || len(st.CompletedSets) != 0 {
		t.Fatalf("sets must reset for the new round: A=%d B=%d completed=%d", st.SetsA, st.SetsB, len(st.CompletedSets))
	}
	if st.RoundsA != 1 {
		t.Fatalf("rounds won must carry across: got %d", st.RoundsA)
	}
	if !st.TimerRunning {
		t.Fatalf("clock should run once the round starts")
	}
}

// Double taken 2–0 is over after its two scheduled rounds.
func TestDoubleTwoNilCompletes(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	evs = append(evs, ev(EventRoundStart, base.Add(2*time.Second), "{}"))
	evs = winRound(evs, "A", base.Add(3*time.Second))
	st := CalculateStateFor(evs, EventTypeDouble)

	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("expected completed with A, got %s / %q", st.Status, st.Winner)
	}
	if st.RoundsA != 2 || st.RoundsB != 0 {
		t.Fatalf("expected 2–0 on rounds, got %d–%d", st.RoundsA, st.RoundsB)
	}
}

// Double level at 1–1 earns a decider third round.
func TestDoubleTiedAddsDecider(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	evs = append(evs, ev(EventRoundStart, base.Add(2*time.Second), "{}"))
	evs = winRound(evs, "B", base.Add(3*time.Second))
	st := CalculateStateFor(evs, EventTypeDouble)

	if st.Status == "completed" {
		t.Fatalf("1–1 must not complete — a decider is owed")
	}
	if st.TotalRounds != 3 {
		t.Fatalf("expected a 3rd decider round, total=%d", st.TotalRounds)
	}
	if !st.AwaitingRound {
		t.Fatalf("expected to await the decider")
	}

	// Decider goes to B → B takes it 2–1.
	evs = append(evs, ev(EventRoundStart, base.Add(4*time.Second), "{}"))
	evs = winRound(evs, "B", base.Add(5*time.Second))
	st = CalculateStateFor(evs, EventTypeDouble)
	if st.Status != "completed" || st.Winner != "B" {
		t.Fatalf("decider should hand it to B, got %s / %q", st.Status, st.Winner)
	}
	if st.RoundsA != 1 || st.RoundsB != 2 {
		t.Fatalf("expected 1–2 on rounds, got %d–%d", st.RoundsA, st.RoundsB)
	}
}

// Quad always plays all three rounds, even at 2–0.
func TestQuadPlaysAllThreeRounds(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winRound(start(base), "A", base.Add(time.Second))
	evs = append(evs, ev(EventRoundStart, base.Add(2*time.Second), "{}"))
	evs = winRound(evs, "A", base.Add(3*time.Second))
	st := CalculateStateFor(evs, EventTypeQuad)

	if st.Status == "completed" {
		t.Fatalf("quad at 2–0 must still play round 3")
	}
	if !st.AwaitingRound || st.TotalRounds != 3 {
		t.Fatalf("expected to await round 3 of 3, awaiting=%v total=%d", st.AwaitingRound, st.TotalRounds)
	}

	evs = append(evs, ev(EventRoundStart, base.Add(4*time.Second), "{}"))
	evs = winRound(evs, "B", base.Add(5*time.Second))
	st = CalculateStateFor(evs, EventTypeQuad)
	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("2–1 should go to A, got %s / %q", st.Status, st.Winner)
	}
	if st.RoundsA != 2 || st.RoundsB != 1 {
		t.Fatalf("expected 2–1, got %d–%d", st.RoundsA, st.RoundsB)
	}
	if len(st.CompletedRounds) != 3 {
		t.Fatalf("expected 3 rounds on record, got %d", len(st.CompletedRounds))
	}
}

// The set that just ended is reported so the court-change card can name a winner.
func TestLastSetWinnerReported(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	evs := winSet(start(base), "B", base.Add(time.Second))
	st := CalculateStateFor(evs, EventTypeRegu)
	if st.LastSetWinner != "B" {
		t.Fatalf("expected B as last set winner, got %q", st.LastSetWinner)
	}
	if st.BreakRemaining <= 0 {
		t.Fatalf("expected a court-change break after the set")
	}
}

// Match point only when taking the round actually settles the match.
func TestMatchPointOnlyWhenDecisive(t *testing.T) {
	base := time.Now().Add(-time.Minute)
	// Quad, round 1, A leads a set and stands at set point of set 2.
	evs := winSet(start(base), "A", base.Add(time.Second))
	at := base.Add(2 * time.Second)
	for i := 0; i < 14; i++ {
		evs = append(evs, ev(EventScoreUpdate, at, `{"team":"A","points":1}`))
	}
	st := CalculateStateFor(evs, EventTypeQuad)
	if st.SetPoint != "A" || st.RoundPoint != "A" {
		t.Fatalf("expected A at set+round point, got set=%q round=%q", st.SetPoint, st.RoundPoint)
	}
	if st.MatchPoint != "" {
		t.Fatalf("winning round 1 of a quad cannot be match point, got %q", st.MatchPoint)
	}
	// Same position in a regu IS match point.
	if r := CalculateStateFor(evs, EventTypeRegu); r.MatchPoint != "A" {
		t.Fatalf("regu round point is match point, got %q", r.MatchPoint)
	}
}
