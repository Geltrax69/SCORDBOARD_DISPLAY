package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
)

type CourtHandler struct {
	courtRepo *repository.CourtRepo
	userRepo  *repository.UserRepo
}

func NewCourtHandler(courtRepo *repository.CourtRepo, userRepo *repository.UserRepo) *CourtHandler {
	return &CourtHandler{courtRepo: courtRepo, userRepo: userRepo}
}

func (h *CourtHandler) Create(c *gin.Context) {
	var req models.CreateCourtRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	court := &models.Court{
		Name:         req.Name,
		TournamentID: req.TournamentID,
	}
	if err := h.courtRepo.Create(court); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create court"})
		return
	}
	c.JSON(http.StatusCreated, court)
}

func (h *CourtHandler) List(c *gin.Context) {
	tournamentID := c.Query("tournament_id")
	var (
		courts []models.Court
		err    error
	)
	if tournamentID != "" {
		courts, err = h.courtRepo.ListByTournament(tournamentID)
	} else {
		courts, err = h.courtRepo.List()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list courts"})
		return
	}
	if courts == nil {
		courts = []models.Court{}
	}
	c.JSON(http.StatusOK, courts)
}

func (h *CourtHandler) Get(c *gin.Context) {
	court, err := h.courtRepo.FindByID(c.Param("id"))
	if err != nil || court == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "court not found"})
		return
	}
	c.JSON(http.StatusOK, court)
}

func (h *CourtHandler) AssignScorer(c *gin.Context) {
	var req models.AssignScorerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	courtID := c.Param("id")
	if err := h.userRepo.AssignToCourt(req.UserID, courtID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "assignment failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "scorer assigned"})
}
