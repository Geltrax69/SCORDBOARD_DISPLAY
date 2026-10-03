package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/repository"
	ws_pkg "github.com/scoreboard/backend/internal/ws"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Court A":                 "court-a",
		"  Court A — TV 1 ":       "court-a-tv-1",
		"LOBBY":                   "lobby",
		"***":                     "",
		strings.Repeat("ab ", 30): "ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-ab-a",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

// These requests are all rejected before the database is touched.
func TestScreenHandlerRejectsInvalidRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewScreenHandler(&repository.DisplayScreenRepo{}, ws_pkg.NewHub(), nil)
	r := gin.New()
	r.POST("/screens", h.Create)
	r.PUT("/screens/:slug", h.Rename)
	r.DELETE("/screens/:slug", h.Delete)
	r.POST("/screens/:slug/layout", h.SetLayout)

	cases := []struct {
		method, path, body, wantErr string
	}{
		{http.MethodPost, "/screens", `{"name":"  "}`, "name is required"},
		{http.MethodPost, "/screens", `{"name":"***"}`, "lowercase letters"},
		{http.MethodPost, "/screens", `{"name":"Court A","slug":"Court A"}`, "lowercase letters"},
		{http.MethodPut, "/screens/court-a", `{"name":""}`, "name is required"},
		{http.MethodDelete, "/screens/main", ``, "cannot be deleted"},
		{http.MethodPost, "/screens/court-a/layout", `{"mode":0}`, "mode must be"},
		{http.MethodPost, "/screens/court-a/layout", `{"mode":9}`, "mode must be"},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), tc.wantErr) {
			t.Errorf("%s %s %s: got %d %s, want 400 containing %q", tc.method, tc.path, tc.body, w.Code, w.Body.String(), tc.wantErr)
		}
	}
}
