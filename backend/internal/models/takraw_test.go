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
	// A wins set 1 21-0; current set resets, A leads 1-0 in sets.
	st := CalculateState(points(repeat('a', 21)))
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
	// 20-20 then A scores 2 -> 22-20, a 2-point lead wins the set.
	st := CalculateState(points(alt(40) + "aa"))
	if len(st.CompletedSets) != 1 || st.CompletedSets[0] != [2]int{22, 20} {
		t.Fatalf("completed set = %v, want [22 20]", st.CompletedSets)
	}
}

func TestCapAt25(t *testing.T) {
	// 24-24 then A scores 1 -> 25-24, the cap ends the set on a 1-point lead.
	st := CalculateState(points(alt(48) + "a"))
	if len(st.CompletedSets) != 1 || st.CompletedSets[0] != [2]int{25, 24} {
		t.Fatalf("completed set = %v, want [25 24]", st.CompletedSets)
	}
}

func TestMatchCompletesBestOfThree(t *testing.T) {
	// A wins set1 (21-0) and set2 (21-0) -> match over, winner A.
	st := CalculateState(points(repeat('a', 42)))
	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("match status=%q winner=%q, want completed/A", st.Status, st.Winner)
	}
	if st.SetsA != 2 {
		t.Fatalf("sets A=%d, want 2", st.SetsA)
	}
}

func TestTieBreakTo15(t *testing.T) {
	// A set1, B set2, then deciding set to 15.
	seq := repeat('a', 21) + repeat('b', 21) + repeat('a', 15)
	st := CalculateState(points(seq))
	if st.Status != "completed" || st.Winner != "A" {
		t.Fatalf("status=%q winner=%q want completed/A", st.Status, st.Winner)
	}
	if st.CompletedSets[2] != [2]int{15, 0} {
		t.Fatalf("tie-break score = %v, want [15 0]", st.CompletedSets[2])
	}
}

func TestServeRotation(t *testing.T) {
	// First server A (default). Serve passes every 3 points. Alternate the points
	// so neither side reaches 21 and the set stays open.
	if st := CalculateState(points(alt(2))); st.Serving != "A" {
		t.Fatalf("after 2 points A still serves, got %s", st.Serving)
	}
	if st := CalculateState(points(alt(3))); st.Serving != "B" {
		t.Fatalf("after 3 points serve should pass to B, got %s", st.Serving)
	}
	if st := CalculateState(points(alt(6))); st.Serving != "A" {
		t.Fatalf("after 6 points serve back to A, got %s", st.Serving)
	}
}

func TestMatchPoint(t *testing.T) {
	// A won set1; in set2 at 20-19 A is at set point AND match point.
	seq := repeat('a', 21) + alt(38) + "a" // set1 to A, then 19-19, then A->20
	st := CalculateState(points(seq))
	if st.ScoreA != 20 || st.ScoreB != 19 {
		t.Fatalf("set2 score %d-%d, want 20-19", st.ScoreA, st.ScoreB)
	}
	if st.SetPoint != "A" || st.MatchPoint != "A" {
		t.Fatalf("setPoint=%q matchPoint=%q, want A/A", st.SetPoint, st.MatchPoint)
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
