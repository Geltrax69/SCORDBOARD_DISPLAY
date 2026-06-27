package services

import (
	"encoding/json"
	"fmt"

	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	"github.com/scoreboard/backend/internal/ws"
)

type MatchService struct {
	matchRepo *repository.MatchRepo
	eventRepo *repository.EventRepo
	userRepo  *repository.UserRepo
	hub       *ws.Hub
}

func NewMatchService(
	matchRepo *repository.MatchRepo,
	eventRepo *repository.EventRepo,
	userRepo *repository.UserRepo,
	hub *ws.Hub,
) *MatchService {
	return &MatchService{
		matchRepo: matchRepo,
		eventRepo: eventRepo,
		userRepo:  userRepo,
		hub:       hub,
	}
}

// RecordEvent persists an event and broadcasts the updated match state via WS
func (s *MatchService) RecordEvent(matchID, userID, eventType string, payload json.RawMessage) (*models.Event, error) {
	if payload == nil {
		payload = json.RawMessage("{}")
	}
	ev := &models.Event{
		MatchID:   matchID,
		Type:      eventType,
		Payload:   payload,
		CreatedBy: userID,
	}
	if err := s.eventRepo.Create(ev); err != nil {
		return nil, fmt.Errorf("create event: %w", err)
	}

	// Apply side effects to the match row
	if err := s.applyEventSideEffects(matchID, ev); err != nil {
		return nil, err
	}

	// Broadcast to all WebSocket clients watching this match
	s.broadcastMatchUpdate(matchID, ev)

	return ev, nil
}

func (s *MatchService) applyEventSideEffects(matchID string, ev *models.Event) error {
	switch ev.Type {
	case models.EventMatchStart:
		return s.matchRepo.UpdateStatus(matchID, "active")
	case models.EventMatchEnd:
		s.matchRepo.UpdateTimer(matchID, 0, false)
		return s.matchRepo.UpdateStatus(matchID, "completed")
	case models.EventTimerStart:
		return s.matchRepo.UpdateTimer(matchID, 0, true)
	case models.EventTimerPause:
		return s.matchRepo.UpdateTimer(matchID, 0, false)
	case models.EventTimeoutStart:
		return s.matchRepo.UpdateStatus(matchID, "timeout")
	case models.EventTimeoutEnd:
		return s.matchRepo.UpdateStatus(matchID, "active")
	case models.EventSubstitution:
		var sub models.SubstitutionPayload
		if err := json.Unmarshal(ev.Payload, &sub); err != nil {
			return err
		}
		if err := s.matchRepo.UpdatePlayerStatus(matchID, sub.Team, sub.PlayerOut, "sub"); err != nil {
			return err
		}
		return s.matchRepo.UpdatePlayerStatus(matchID, sub.Team, sub.PlayerIn, "playing")
	}
	return nil
}

func (s *MatchService) broadcastMatchUpdate(matchID string, ev *models.Event) {
	events, err := s.eventRepo.ListByMatch(matchID)
	if err != nil {
		return
	}
	state := models.CalculateState(events)

	match, err := s.matchRepo.FindByID(matchID)
	if err != nil || match == nil {
		return
	}
	match.ScoreA = state.ScoreA
	match.ScoreB = state.ScoreB
	// Persist the live score so the dashboard list (which reads the match row,
	// not the event log) stays correct after a refresh.
	s.matchRepo.UpdateScore(matchID, state.ScoreA, state.ScoreB)

	// A match can auto-complete by winning 2 sets (no explicit match_end event).
	// Persist that so the row/dashboard/control screen show it as finished too.
	if state.Status == "completed" && match.Status != "completed" {
		s.matchRepo.UpdateStatus(matchID, "completed")
		match.Status = "completed"
	}

	type broadcastPayload struct {
		Match  *models.Match  `json:"match"`
		Event  *models.Event  `json:"event"`
		State  models.MatchState `json:"state"`
	}

	payloadBytes, _ := json.Marshal(broadcastPayload{
		Match: match,
		Event: ev,
		State: state,
	})

	s.hub.BroadcastToMatch(matchID, models.WSMessage{
		Type:    ev.Type,
		MatchID: matchID,
		Payload: payloadBytes,
	})
}

func (s *MatchService) GetMatchWithState(matchID string) (*models.Match, *models.MatchState, error) {
	match, err := s.matchRepo.FindByID(matchID)
	if err != nil {
		return nil, nil, err
	}
	if match == nil {
		return nil, nil, nil
	}

	events, err := s.eventRepo.ListByMatch(matchID)
	if err != nil {
		return nil, nil, err
	}
	state := models.CalculateState(events)
	match.ScoreA = state.ScoreA
	match.ScoreB = state.ScoreB
	return match, &state, nil
}

func (s *MatchService) UndoEvent(eventID, userID string) error {
	ev, err := s.eventRepo.FindByID(eventID)
	if err != nil || ev == nil {
		return fmt.Errorf("event not found")
	}
	if ev.Undone {
		return fmt.Errorf("event already undone")
	}
	if err := s.eventRepo.Undo(eventID, userID); err != nil {
		return err
	}
	// Re-broadcast after undo
	ev.Undone = true
	s.broadcastMatchUpdate(ev.MatchID, ev)
	return nil
}

func (s *MatchService) RedoEvent(eventID string) error {
	ev, err := s.eventRepo.FindByID(eventID)
	if err != nil || ev == nil {
		return fmt.Errorf("event not found")
	}
	if !ev.Undone {
		return fmt.Errorf("event is not undone")
	}
	if err := s.eventRepo.Redo(eventID); err != nil {
		return err
	}
	ev.Undone = false
	s.broadcastMatchUpdate(ev.MatchID, ev)
	return nil
}

func (s *MatchService) BroadcastStatusChange(matchID, status string) {
	match, _ := s.matchRepo.FindByID(matchID)
	if match == nil {
		return
	}
	events, _ := s.eventRepo.ListByMatch(matchID)
	state := models.CalculateState(events)
	state.Status = status

	type payload struct {
		Match *models.Match      `json:"match"`
		State models.MatchState  `json:"state"`
	}
	p, _ := json.Marshal(payload{Match: match, State: state})
	s.hub.BroadcastToMatch(matchID, models.WSMessage{
		Type:    "status_change",
		MatchID: matchID,
		Payload: p,
	})
}

func (s *MatchService) BroadcastAnnouncement(msg string, duration int) {
	type ann struct {
		Message  string `json:"message"`
		Duration int    `json:"duration"`
	}
	p, _ := json.Marshal(ann{Message: msg, Duration: duration})
	s.hub.BroadcastGlobal(models.WSMessage{
		Type:    models.EventAnnouncement,
		Payload: p,
	})
}

func (s *MatchService) BroadcastDisplayLayout(layout models.DisplayLayoutPayload) {
	p, _ := json.Marshal(layout)
	s.hub.BroadcastGlobal(models.WSMessage{
		Type:    models.EventDisplayLayout,
		Payload: p,
	})
}
