package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
)

type TournamentHandler struct {
	repo *repository.TournamentRepo
}

func NewTournamentHandler(repo *repository.TournamentRepo) *TournamentHandler {
	return &TournamentHandler{repo: repo}
}

func (h *TournamentHandler) Create(c *gin.Context) {
	var req models.CreateTournamentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Sport == "" {
		req.Sport = "general"
	}
	t := &models.Tournament{
		Name:      req.Name,
		Sport:     req.Sport,
		CreatedBy: auth.GetUserID(c),
	}
	if err := h.repo.Create(t); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create tournament"})
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *TournamentHandler) List(c *gin.Context) {
	ts, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list tournaments"})
		return
	}
	if ts == nil {
		ts = []models.Tournament{}
	}
	c.JSON(http.StatusOK, ts)
}

func (h *TournamentHandler) Get(c *gin.Context) {
	t, err := h.repo.FindByID(c.Param("id"))
	if err != nil || t == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tournament not found"})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *TournamentHandler) UpdateStatus(c *gin.Context) {
	var body struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.UpdateStatus(c.Param("id"), body.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": body.Status})
}
