-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name        VARCHAR(255) NOT NULL DEFAULT '',
    role        VARCHAR(50) NOT NULL DEFAULT 'scorer' CHECK (role IN ('super_admin', 'scorer', 'display')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    sport       VARCHAR(100) NOT NULL DEFAULT 'general',
    status      VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Courts
CREATE TABLE IF NOT EXISTS courts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Court scorer assignments
CREATE TABLE IF NOT EXISTS court_scorers (
    court_id    UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (court_id, user_id)
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id        UUID NOT NULL REFERENCES courts(id),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id),
    team_a          VARCHAR(255) NOT NULL,
    team_b          VARCHAR(255) NOT NULL,
    team_a_color    VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    team_b_color    VARCHAR(7) NOT NULL DEFAULT '#EF4444',
    status          VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'timeout', 'completed')),
    timer_seconds   INTEGER NOT NULL DEFAULT 0,
    timer_running   BOOLEAN NOT NULL DEFAULT FALSE,
    timer_started_at TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events (event store — source of truth for all match state)
CREATE TABLE IF NOT EXISTS events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    type        VARCHAR(100) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}',
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    undone      BOOLEAN NOT NULL DEFAULT FALSE,
    undone_at   TIMESTAMPTZ,
    undone_by   UUID REFERENCES users(id),
    sequence    BIGSERIAL
);

-- Display layouts
CREATE TABLE IF NOT EXISTS display_layouts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    mode        INTEGER NOT NULL DEFAULT 1 CHECK (mode BETWEEN 1 AND 5),
    match_ids   UUID[] NOT NULL DEFAULT '{}',
    config      JSONB NOT NULL DEFAULT '{}',
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_match_id ON events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_court_id ON matches(court_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_courts_tournament_id ON courts(tournament_id);

-- Default super admin (password: Admin@1234)
INSERT INTO users (email, password_hash, name, role)
VALUES (
    'admin@scoreboard.local',
    '$2a$10$0T8clvmJji5rfPJ2IsjdN.MzOcfiMT69M1wMKuF17Mv53vBmb/oz6',
    'Super Admin',
    'super_admin'
) ON CONFLICT (email) DO NOTHING;
