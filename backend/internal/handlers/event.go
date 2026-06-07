package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	"github.com/scoreboard/backend/internal/services"
)

type EventHandler struct {
	eventRepo    *repository.EventRepo
	matchRepo    *repository.MatchRepo
	userRepo     *repository.UserRepo
	matchService *services.MatchService
}

func NewEventHandler(
	eventRepo *repository.EventRepo,
	matchRepo *repository.MatchRepo,
	userRepo *repository.UserRepo,
	svc *services.MatchService,
) *EventHandler {
	return &EventHandler{eventRepo: eventRepo, matchRepo: matchRepo, userRepo: userRepo, matchService: svc}
}

func (h *EventHandler) Create(c *gin.Context) {
	matchID := c.Param("id")
	userID := auth.GetUserID(c)
	role := auth.GetRole(c)
	deviceMatchID := auth.GetMatchID(c) // non-empty only for device tokens

	// Device token: check it's for the right match
	if deviceMatchID != "" {
		if deviceMatchID != matchID {
			c.JSON(http.StatusForbidden, gin.H{"error": "device not authorized for this match"})
			return
		}
		// Device tokens store UserID as "device:<matchID>" which is not a valid UUID.
		// Use the matchID itself as the creator so the DB receives a real UUID.
		userID = matchID
	} else if role == string(models.RoleScorer) {
		// Regular scorer: must be assigned to the court
		courtID, err := h.matchRepo.GetCourtID(matchID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
			return
		}
		assigned, err := h.userRepo.IsAssignedToCourt(userID, courtID)
		if err != nil || !assigned {
			c.JSON(http.StatusForbidden, gin.H{"error": "not assigned to this court"})
			return
		}
	}

	var req models.CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ev, err := h.matchService.RecordEvent(matchID, userID, req.Type, req.Payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ev.CreatedByName = h.userRepo.GetNameByID(userID)
	c.JSON(http.StatusCreated, ev)
}

func (h *EventHandler) List(c *gin.Context) {
	events, err := h.eventRepo.ListByMatch(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list events"})
		return
	}
	if events == nil {
		events = []models.Event{}
	}
	c.JSON(http.StatusOK, events)
}

func (h *EventHandler) Undo(c *gin.Context) {
	userID := auth.GetUserID(c)
	if err := h.matchService.UndoEvent(c.Param("eventId"), userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "event undone"})
}

func (h *EventHandler) Redo(c *gin.Context) {
	if err := h.matchService.RedoEvent(c.Param("eventId")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "event redone"})
}

func (h *EventHandler) Announce(c *gin.Context) {
	var body struct {
		Message  string `json:"message" binding:"required"`
		Duration int    `json:"duration"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Duration == 0 {
		body.Duration = 10
	}
	h.matchService.BroadcastAnnouncement(body.Message, body.Duration)
	c.JSON(http.StatusOK, gin.H{"message": "announced"})
}

func (h *EventHandler) SetDisplayLayout(c *gin.Context) {
	var layout models.DisplayLayoutPayload
	if err := c.ShouldBindJSON(&layout); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.matchService.BroadcastDisplayLayout(layout)
	c.JSON(http.StatusOK, gin.H{"message": "layout updated"})
}
