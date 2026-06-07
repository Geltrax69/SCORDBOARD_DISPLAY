package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	ContextUserID     = "userID"
	ContextEmail      = "email"
	ContextRole       = "role"
	ContextMatchID    = "matchID"    // set for device tokens
	ContextDeviceName = "deviceName" // set for device tokens
)

func Middleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		claims, err := ValidateToken(token, secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextEmail, claims.Email)
		c.Set(ContextRole, claims.Role)
		c.Set(ContextMatchID, claims.MatchID)
		c.Set(ContextDeviceName, claims.DeviceName)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
	}
}

func extractToken(c *gin.Context) string {
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if t := c.Query("token"); t != "" {
		return t
	}
	return ""
}

func GetUserID(c *gin.Context) string     { v, _ := c.Get(ContextUserID); s, _ := v.(string); return s }
func GetRole(c *gin.Context) string       { v, _ := c.Get(ContextRole); s, _ := v.(string); return s }
func GetMatchID(c *gin.Context) string    { v, _ := c.Get(ContextMatchID); s, _ := v.(string); return s }
func GetDeviceName(c *gin.Context) string { v, _ := c.Get(ContextDeviceName); s, _ := v.(string); return s }
