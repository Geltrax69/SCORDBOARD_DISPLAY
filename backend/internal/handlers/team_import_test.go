package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/repository"
)

func TestTeamImportRejectsInvalidTransferBeforeDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewTeamHandler(&repository.TeamRepo{})
	router.POST("/teams/import", handler.Import)

	body := `{"teams":[{"name":"District One","players":[
		{"name":"Alice","gender":"Female","jersey_number":7},
		{"name":"Bob","gender":"Male","jersey_number":7}
	]}]}`
	req := httptest.NewRequest(http.MethodPost, "/teams/import", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "duplicate jersey") {
		t.Fatalf("expected duplicate jersey error, got %s", response.Body.String())
	}
}

func TestTeamImportRejectsMalformedJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewTeamHandler(&repository.TeamRepo{})
	router.POST("/teams/import", handler.Import)

	req := httptest.NewRequest(http.MethodPost, "/teams/import", strings.NewReader(`{"teams":`))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", response.Code)
	}
}
