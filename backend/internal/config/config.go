package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerPort  string
	DatabaseURL string
	JWTSecret   string
	Environment string
	CORSOrigins string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		ServerPort:  getEnv("SERVER_PORT", "8080"),
		JWTSecret:   mustEnv("JWT_SECRET"),
		Environment: getEnv("ENVIRONMENT", "development"),
		CORSOrigins: getEnv("CORS_ORIGINS", "*"),
	}

	cfg.DatabaseURL = buildDatabaseURL()
	return cfg, nil
}

func buildDatabaseURL() string {
	if url := os.Getenv("DATABASE_URL"); url != "" {
		return url
	}
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	user := getEnv("DB_USER", "scoreboard")
	pass := getEnv("DB_PASSWORD", "scoreboard")
	name := getEnv("DB_NAME", "scoreboard")
	sslMode := getEnv("DB_SSLMODE", "disable")
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		host, port, user, pass, name, sslMode)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		v = "supersecretjwtkey_changeme_in_production"
	}
	return v
}
