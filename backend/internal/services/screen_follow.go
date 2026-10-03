package services

import (
	"encoding/json"
	"log"
	"slices"
	"sync"

	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	"github.com/scoreboard/backend/internal/ws"
)

// ScreenFollower keeps court-following screens on their court's current match:
// the live one, else the next pending one. MatchService calls CourtChanged
// whenever a match on a court is created, changes status, or is deleted.
type ScreenFollower struct {
	repo *repository.DisplayScreenRepo
	hub  *ws.Hub
	mu   sync.Mutex // one resolve at a time, so two quick changes can't race
}

func NewScreenFollower(repo *repository.DisplayScreenRepo, hub *ws.Hub) *ScreenFollower {
	return &ScreenFollower{repo: repo, hub: hub}
}

// CourtChanged re-checks every screen following the court and switches the
// ones whose match changed.
func (f *ScreenFollower) CourtChanged(courtID string) {
	if courtID == "" {
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()

	screens, err := f.repo.FollowingCourt(courtID)
	if err != nil {
		log.Printf("[screens] follow lookup for court %s: %v", courtID, err)
		return
	}
	for i := range screens {
		if _, err := f.sync(&screens[i], false); err != nil {
			log.Printf("[screens] follow sync %s: %v", screens[i].Slug, err)
		}
	}
}

// Sync puts one court-following screen on its court's current match and
// pushes it to the TV, even if it was already showing it.
func (f *ScreenFollower) Sync(screen *models.DisplayScreen) (*models.DisplayScreen, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.sync(screen, true)
}

func (f *ScreenFollower) sync(screen *models.DisplayScreen, force bool) (*models.DisplayScreen, error) {
	if screen.FollowCourtID == "" {
		return screen, nil
	}
	matchID, err := f.repo.CourtCurrentMatch(screen.FollowCourtID)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	if matchID != "" {
		ids = append(ids, matchID)
	}
	if !force && screen.Mode == 1 && slices.Equal(screen.MatchIDs, ids) {
		return screen, nil
	}
	if err := f.repo.SetFollowedMatch(screen.Slug, matchID); err != nil {
		return nil, err
	}
	screen.Mode, screen.MatchIDs = 1, ids

	payload, _ := json.Marshal(models.DisplayLayoutPayload{
		Mode:                1,
		MatchIDs:            ids,
		ShowPlayerAnimation: screen.ShowPlayerAnimation,
		Screen:              screen.Slug,
		Auto:                true,
	})
	f.hub.BroadcastToScreens([]string{screen.Slug}, models.WSMessage{Type: models.EventDisplayLayout, Payload: payload})
	return screen, nil
}
