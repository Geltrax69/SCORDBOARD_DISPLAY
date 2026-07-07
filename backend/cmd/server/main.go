package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/scoreboard/backend/internal/auth"
	"github.com/scoreboard/backend/internal/config"
	"github.com/scoreboard/backend/internal/db"
	"github.com/scoreboard/backend/internal/handlers"
	"github.com/scoreboard/backend/internal/models"
	"github.com/scoreboard/backend/internal/repository"
	"github.com/scoreboard/backend/internal/services"
	"github.com/scoreboard/backend/internal/ws"
)

const uploadDir = "./uploads"

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("migration: %v", err)
	}

	// Ensure upload directories
	os.MkdirAll(uploadDir+"/players", 0755)

	// Repositories
	userRepo       := repository.NewUserRepo(database)
	tournamentRepo := repository.NewTournamentRepo(database)
	courtRepo      := repository.NewCourtRepo(database)
	matchRepo      := repository.NewMatchRepo(database)
	eventRepo      := repository.NewEventRepo(database)
	playerRepo     := repository.NewPlayerRepo(database)
	assetRepo      := repository.NewDisplayAssetRepo(database)

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Server info
	localIP := getLocalIP()
	frontendPort := "3000" // what the browser opens
	serverInfo := &models.ServerInfo{
		LocalIP:    localIP,
		Port:       cfg.ServerPort,
		ConnectURL: fmt.Sprintf("http://%s:%s/connect", localIP, frontendPort),
		DisplayURL: fmt.Sprintf("http://%s:%s/display", localIP, frontendPort),
	}
	log.Printf("[network] Local IP    : %s", localIP)
	log.Printf("[network] Connect URL : %s", serverInfo.ConnectURL)
	log.Printf("[network] Display URL : %s", serverInfo.DisplayURL)

	// Services & handlers
	matchSvc  := services.NewMatchService(matchRepo, eventRepo, userRepo, hub)
	authH     := handlers.NewAuthHandler(userRepo, cfg.JWTSecret)
	tourH     := handlers.NewTournamentHandler(tournamentRepo)
	courtH    := handlers.NewCourtHandler(courtRepo, userRepo)
	matchH    := handlers.NewMatchHandler(matchRepo, playerRepo, matchSvc)
	eventH    := handlers.NewEventHandler(eventRepo, matchRepo, userRepo, matchSvc)
	wsH       := handlers.NewWebSocketHandler(hub, matchRepo)
	deviceH   := handlers.NewDeviceHandler(hub, matchRepo, cfg.JWTSecret, serverInfo, database)
	uploadH   := handlers.NewUploadHandler(uploadDir, "/uploads")
	assetH    := handlers.NewAssetHandler(assetRepo, hub)

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOrigins:  []string{"*"},
		AllowMethods:  []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:  []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders: []string{"Content-Length"},
		MaxAge:        12 * time.Hour,
	}))

	// Static file serving for uploads
	r.Static("/uploads", uploadDir)

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "connected": hub.ConnectedCount()})
	})

	// Public endpoints (no auth)
	r.POST("/api/connect", deviceH.Connect)
	r.POST("/api/refresh-token", deviceH.RefreshToken)
	r.GET("/api/display/layout", deviceH.GetLayout)
	r.GET("/api/display/background", deviceH.GetBackground)

	api := r.Group("/api")
	{
		api.POST("/auth/login", authH.Login)

		secured := api.Group("", auth.Middleware(cfg.JWTSecret))
		{
			secured.GET("/auth/me", authH.Me)
			secured.GET("/server-info", deviceH.GetServerInfo)
			secured.GET("/devices", deviceH.ListDevices)

			// File upload (all authenticated users)
			secured.POST("/upload/player-photo", uploadH.UploadPlayerPhoto)
			secured.POST("/upload/team-logo", uploadH.UploadTeamLogo)
			secured.POST("/upload/media", uploadH.UploadMedia)

			// Owner only — user management (create/list/edit/delete accounts)
			owner := secured.Group("", auth.RequireRole("owner"))
			{
				owner.POST("/users", authH.CreateUser)
				owner.GET("/users", authH.ListUsers)
				owner.PUT("/users/:id", authH.UpdateUser)
				owner.DELETE("/users/:id", authH.DeleteUser)
			}

			// Super admin (and owner) — runs tournaments/matches/display
			admin := secured.Group("", auth.RequireRole("super_admin"))
			{
				admin.POST("/tournaments", tourH.Create)
				admin.PATCH("/tournaments/:id/status", tourH.UpdateStatus)

				admin.POST("/courts", courtH.Create)
				admin.POST("/courts/:id/scorers", courtH.AssignScorer)

				admin.POST("/matches", matchH.Create)
				admin.PUT("/matches/:id/players", matchH.SetPlayers)
				admin.PATCH("/matches/:id/status", matchH.UpdateStatus)
				admin.DELETE("/matches/:id", matchH.Delete)

				admin.POST("/announce", eventH.Announce)
				admin.POST("/display/layout", deviceH.SetLayout)
				admin.POST("/display/background", deviceH.SetBackground)

				// Sponsor / announcement library — build once, push with one click
				admin.POST("/display-assets", assetH.Create)
				admin.DELETE("/display-assets/:id", assetH.Delete)
				admin.POST("/display-assets/:id/show", assetH.Show)
			}

			// All authenticated
			secured.GET("/tournaments", tourH.List)
			secured.GET("/tournaments/:id", tourH.Get)
			secured.GET("/courts", courtH.List)
			secured.GET("/courts/:id", courtH.Get)
			secured.GET("/matches", matchH.List)
			secured.GET("/matches/:id", matchH.Get)
			secured.GET("/matches/:id/events", eventH.List)
			secured.GET("/matches/:id/players", matchH.GetPlayers)
			secured.GET("/display-assets", assetH.List)

			secured.POST("/matches/:id/events",
				auth.RequireRole("super_admin", "scorer"),
				eventH.Create,
			)
			secured.POST("/events/:eventId/undo", auth.RequireRole("super_admin"), eventH.Undo)
			secured.POST("/events/:eventId/redo", auth.RequireRole("super_admin"), eventH.Redo)
		}
	}

	// WebSocket
	wsGroup := r.Group("/ws", auth.Middleware(cfg.JWTSecret))
	{
		wsGroup.GET("/match/:id", wsH.Connect)
		wsGroup.GET("/global", wsH.Connect)
	}

	log.Printf("[server] starting on :%s  env=%s", cfg.ServerPort, cfg.Environment)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func getLocalIP() string {
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil && !ip.IsLoopback() {
				if ipv4 := ip.To4(); ipv4 != nil {
					return ipv4.String()
				}
			}
		}
	}
	return "localhost"
}
