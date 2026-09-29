package models

import (
	"strings"
	"sync"
	"testing"
)

func validImportRequest() TeamImportRequest {
	return TeamImportRequest{Teams: []TeamImportInput{{
		Name: "  District One  ",
		Players: []PlayerInput{
			{Name: " Alice ", Gender: "female", JerseyNumber: 7},
			{Name: "Bob", Gender: "MALE", JerseyNumber: 12},
		},
	}}}
}

func TestTeamImportNormalizeAndValidate(t *testing.T) {
	req := validImportRequest()
	if err := req.NormalizeAndValidate(); err != nil {
		t.Fatalf("expected valid request: %v", err)
	}
	if req.Teams[0].Name != "District One" || req.Teams[0].Color != "#3B82F6" {
		t.Fatalf("team normalization failed: %+v", req.Teams[0])
	}
	if got := req.Teams[0].Players[0]; got.Name != "Alice" || got.Gender != "Female" || got.Status != "playing" {
		t.Fatalf("player normalization failed: %+v", got)
	}
}

func TestTeamImportValidationErrors(t *testing.T) {
	tests := []struct {
		name string
		edit func(*TeamImportRequest)
		want string
	}{
		{"empty import", func(r *TeamImportRequest) { r.Teams = nil }, "at least one team"},
		{"missing team", func(r *TeamImportRequest) { r.Teams[0].Name = " " }, "name is required"},
		{"long team", func(r *TeamImportRequest) { r.Teams[0].Name = strings.Repeat("x", 256) }, "255 characters"},
		{"invalid color", func(r *TeamImportRequest) { r.Teams[0].Color = "blue" }, "six-digit hex"},
		{"duplicate team", func(r *TeamImportRequest) { r.Teams = append(r.Teams, r.Teams[0]) }, "duplicate team"},
		{"no players", func(r *TeamImportRequest) { r.Teams[0].Players = nil }, "at least one player"},
		{"missing player", func(r *TeamImportRequest) { r.Teams[0].Players[0].Name = "" }, "full name is required"},
		{"long player", func(r *TeamImportRequest) { r.Teams[0].Players[0].Name = strings.Repeat("x", 256) }, "255 characters"},
		{"duplicate player", func(r *TeamImportRequest) { r.Teams[0].Players[1].Name = "ALICE" }, "duplicate player"},
		{"invalid gender", func(r *TeamImportRequest) { r.Teams[0].Players[0].Gender = "unknown" }, "gender must be"},
		{"low jersey", func(r *TeamImportRequest) { r.Teams[0].Players[0].JerseyNumber = 0 }, "jersey number must"},
		{"high jersey", func(r *TeamImportRequest) { r.Teams[0].Players[0].JerseyNumber = 100 }, "jersey number must"},
		{"duplicate jersey", func(r *TeamImportRequest) { r.Teams[0].Players[1].JerseyNumber = 7 }, "duplicate jersey"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := validImportRequest()
			test.edit(&req)
			err := req.NormalizeAndValidate()
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q error, got %v", test.want, err)
			}
		})
	}
}

func TestTeamImportValidationConcurrent(t *testing.T) {
	const workers = 200
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := validImportRequest()
			errs <- req.NormalizeAndValidate()
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent validation failed: %v", err)
		}
	}
}
