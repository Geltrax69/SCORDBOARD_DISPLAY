package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
)

type TeamHandler struct {
	repo *repository.TeamRepo
}

func NewTeamHandler(repo *repository.TeamRepo) *TeamHandler {
	return &TeamHandler{repo: repo}
}

func (h *TeamHandler) List(c *gin.Context) {
	teams, err := h.repo.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list teams"})
		return
	}
	c.JSON(http.StatusOK, teams)
}

func (h *TeamHandler) Create(c *gin.Context) {
	req, ok := bindTeam(c)
	if !ok {
		return
	}
	t := &models.Team{
		Name:      req.Name,
		Color:     req.Color,
		LogoURL:   req.LogoURL,
		CreatedBy: auth.GetUserID(c),
	}
	if err := h.repo.Create(t, req.Players); err != nil {
		if isDuplicateName(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "a team with that name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create team"})
		return
	}
	c.JSON(http.StatusCreated, t)
}

func (h *TeamHandler) Update(c *gin.Context) {
	req, ok := bindTeam(c)
	if !ok {
		return
	}
	t := &models.Team{
		ID:      c.Param("id"),
		Name:    req.Name,
		Color:   req.Color,
		LogoURL: req.LogoURL,
	}
	if err := h.repo.Update(t, req.Players); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
			return
		}
		if isDuplicateName(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "a team with that name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update team"})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *TeamHandler) Delete(c *gin.Context) {
	if err := h.repo.Delete(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete team"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (h *TeamHandler) Import(c *gin.Context) {
	var req models.TeamImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid import payload: " + err.Error()})
		return
	}
	if err := req.NormalizeAndValidate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.repo.Import(req, auth.GetUserID(c))
	if err != nil {
		if errors.Is(err, repository.ErrTeamImportConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "player import failed; no changes were saved"})
		return
	}
	c.JSON(http.StatusCreated, result)
}

func bindTeam(c *gin.Context) (*models.TeamRequest, bool) {
	var req models.TeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return nil, false
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team name is required"})
		return nil, false
	}
	if req.Color == "" {
		req.Color = "#3B82F6"
	}
	return &req, true
}

func isDuplicateName(err error) bool {
	return err != nil && strings.Contains(err.Error(), "duplicate key")
}
