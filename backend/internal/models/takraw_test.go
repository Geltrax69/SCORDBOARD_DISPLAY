package models

import (
	"testing"
	"time"
)

// points builds a sequence of single-point rallies, "a" for A, "b" for B.
func points(seq string) []Event {
	now := time.Now().Add(-time.Hour)
	out := []Event{ev(EventMatchStart, now, "{}")}
	for i, c := range seq {
		at := now.Add(time.Duration(i+1) * time.Second)
		if c == 'a' {
			out = append(out, ev(EventScoreUpdate, at, `{"team":"A","points":1}`))
		} else {
			out = append(out, ev(EventScoreUpdate, at, `{"team":"B","points":1}`))
		}
	}
	return out
}

func repeat(c byte, n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = c
	}
	return string(b)
}

func TestSetWinAndReset(t *testing.T) {
	// A wins set 1 15-0; current set resets, A leads 1-0 in sets.
	st := CalculateState(points(repeat('a', 15)))
	if st.SetsA != 1 || st.SetsB != 0 {
		t.Fatalf("sets A=%d B=%d, want 1-0", st.SetsA, st.SetsB)
	}
	if st.ScoreA != 0 || st.ScoreB != 0 {
		t.Fatalf("current set should reset, got %d-%d", st.ScoreA, st.ScoreB)
	}
	if st.SetNumber != 2 {
		t.Fatalf("set number = %d, want 2", st.SetNumber)
	}
	if st.Status == "completed" {
		t.Fatalf("match should not be over after one set")
	}
}

func TestDeuceWinByTwo(t *testing.T) {
	// 14-14 (all point) then A scores 2 -> 16-14, a 2-point lead wins the set.
	st := CalculateState(points(alt(28) + "aa"))
	if len(st.CompletedSets) != 1 || st.CompletedSets[0] != [2]int{16, 14} {
		t.Fatalf("completed set = %v, want [16 14]", st.CompletedSets)
	}
}

func TestCapAt17(t *testing.T) {
	// 16-16 then A scores 1 -> 17-16, the cap ends the set on a 1-point lead.
	st := CalculateState(points(alt(32) + "a"))
	if len(st.CompletedSets) != 1 || st.CompletedSets[0] != [2]int{17, 16} {
		t.Fatalf("completed set = %v, want [17 16]", st.CompletedSets)
	}
}

func TestMatchCompletesBestOfThree(t *testing.T) {
	// A wins set1 (15-0) and set2 (15-0) -> match over, winner A.
	st := CalculateState(points(repeat('a', 30)))
	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("match status=%q winner=%q, want completed/A", st.Status, st.Winner)
	}
	if st.SetsA != 2 {
		t.Fatalf("sets A=%d, want 2", st.SetsA)
	}
}

func TestTieBreakTo15(t *testing.T) {
	// A set1, B set2, then deciding set to 15.
	seq := repeat('a', 15) + repeat('b', 15) + repeat('a', 15)
	st := CalculateState(points(seq))
	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("status=%q winner=%q want completed/A", st.Status, st.Winner)
	}
	if st.CompletedSets[2] != [2]int{15, 0} {
		t.Fatalf("tie-break score = %v, want [15 0]", st.CompletedSets[2])
	}
}

func TestServeRotation(t *testing.T) {
	// First server A (default). Serve alternates every point, regardless of scorer.
	if st := CalculateState(points(alt(1))); st.Serving != "B" {
		t.Fatalf("after 1 point serve should pass to B, got %s", st.Serving)
	}
	if st := CalculateState(points(alt(2))); st.Serving != "A" {
		t.Fatalf("after 2 points serve back to A, got %s", st.Serving)
	}
	if st := CalculateState(points(alt(3))); st.Serving != "B" {
		t.Fatalf("after 3 points serve to B, got %s", st.Serving)
	}
}

func TestFirstServerAlternatesEachSet(t *testing.T) {
	// A serves first in set 1. After set 1 closes, set 2 must open with B serving.
	st := CalculateState(points(repeat('a', 15))) // A wins set 1 15-0, set 2 at 0-0
	if st.SetNumber != 2 {
		t.Fatalf("expected set 2, got set %d", st.SetNumber)
	}
	if st.Serving != "B" {
		t.Fatalf("set 2 should open with B serving (alternates from set 1), got %s", st.Serving)
	}
}

func TestMatchPoint(t *testing.T) {
	// A won set1; in set2 at 14-13 A is at set point AND match point.
	seq := repeat('a', 15) + alt(26) + "a" // set1 to A, then 13-13, then A->14
	st := CalculateState(points(seq))
	if st.ScoreA != 14 || st.ScoreB != 13 {
		t.Fatalf("set2 score %d-%d, want 14-13", st.ScoreA, st.ScoreB)
	}
	if st.SetPoint != "A" || st.MatchPoint != "A" {
		t.Fatalf("setPoint=%q matchPoint=%q, want A/A", st.SetPoint, st.MatchPoint)
	}
}

func TestDeuceFlagAt14All(t *testing.T) {
	// 14-14 is "all point": deuce set, no team at set point yet.
	st := CalculateState(points(alt(28)))
	if !st.Deuce || st.SetPoint != "" {
		t.Fatalf("at 14-14 want deuce/no setpoint, got deuce=%v setPoint=%q", st.Deuce, st.SetPoint)
	}
}

// alt returns n points alternating a,b,a,b...
func alt(n int) string {
	b := make([]byte, n)
	for i := range b {
		if i%2 == 0 {
			b[i] = 'a'
		} else {
			b[i] = 'b'
		}
	}
	return string(b)
}
