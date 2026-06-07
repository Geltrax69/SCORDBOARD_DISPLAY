package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	"github.com/scoreboard/backend/internal/services"
)

type MatchHandler struct {
	matchRepo    *repository.MatchRepo
	playerRepo   *repository.PlayerRepo
	matchService *services.MatchService
}

func NewMatchHandler(matchRepo *repository.MatchRepo, playerRepo *repository.PlayerRepo, svc *services.MatchService) *MatchHandler {
	return &MatchHandler{matchRepo: matchRepo, playerRepo: playerRepo, matchService: svc}
}

func (h *MatchHandler) Create(c *gin.Context) {
	var req models.CreateMatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	m := &models.Match{
		CourtID:      req.CourtID,
		TournamentID: req.TournamentID,
		TeamA:        req.TeamA,
		TeamB:        req.TeamB,
		TeamAColor:   req.TeamAColor,
		TeamBColor:   req.TeamBColor,
		TeamALogo:    req.TeamALogo,
		TeamBLogo:    req.TeamBLogo,
		CreatedBy:    auth.GetUserID(c),
	}
	if err := h.matchRepo.Create(m); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create match: " + err.Error()})
		return
	}

	// Save players if provided
	if len(req.PlayersA)+len(req.PlayersB) > 0 {
		var players []models.Player
		for _, p := range req.PlayersA {
			players = append(players, models.Player{MatchID: m.ID, Team: "A", Name: p.Name, JerseyNumber: p.JerseyNumber})
		}
		for _, p := range req.PlayersB {
			players = append(players, models.Player{MatchID: m.ID, Team: "B", Name: p.Name, JerseyNumber: p.JerseyNumber})
		}
		_ = h.playerRepo.SetPlayers(m.ID, players)
	}

	c.JSON(http.StatusCreated, m)
}

func (h *MatchHandler) List(c *gin.Context) {
	tournamentID := c.Query("tournament_id")
	matches, err := h.matchRepo.List(tournamentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list matches"})
		return
	}
	if matches == nil {
		matches = []models.Match{}
	}
	c.JSON(http.StatusOK, matches)
}

func (h *MatchHandler) Get(c *gin.Context) {
	match, state, err := h.matchService.GetMatchWithState(c.Param("id"))
	if err != nil || match == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"match": match, "state": state})
}

// UpdateStatus — admin stops (cancelled) or resets a match
func (h *MatchHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	allowed := map[string]bool{"pending": true, "active": true, "completed": true, "cancelled": true, "paused": true}
	if !allowed[body.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	if err := h.matchRepo.UpdateStatus(c.Param("id"), body.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	// Broadcast the status change so display screens react
	h.matchService.BroadcastStatusChange(c.Param("id"), body.Status)
	c.JSON(http.StatusOK, gin.H{"status": body.Status})
}

// Delete — hard-deletes a match and all its events/players (CASCADE)
func (h *MatchHandler) Delete(c *gin.Context) {
	matchID := c.Param("id")
	match, err := h.matchRepo.FindByID(matchID)
	if err != nil || match == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "match not found"})
		return
	}
	if err := h.matchRepo.Delete(matchID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "delete failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "match deleted"})
}

func (h *MatchHandler) GetPlayers(c *gin.Context) {
	players, err := h.playerRepo.GetByMatch(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get players"})
		return
	}
	c.JSON(http.StatusOK, players)
}

func (h *MatchHandler) SetPlayers(c *gin.Context) {
	matchID := c.Param("id")
	var body struct {
		PlayersA []models.PlayerInput `json:"players_a"`
		PlayersB []models.PlayerInput `json:"players_b"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var players []models.Player
	for _, p := range body.PlayersA {
		players = append(players, models.Player{MatchID: matchID, Team: "A", Name: p.Name, JerseyNumber: p.JerseyNumber})
	}
	for _, p := range body.PlayersB {
		players = append(players, models.Player{MatchID: matchID, Team: "B", Name: p.Name, JerseyNumber: p.JerseyNumber})
	}
	if err := h.playerRepo.SetPlayers(matchID, players); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save players"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "players saved"})
}
