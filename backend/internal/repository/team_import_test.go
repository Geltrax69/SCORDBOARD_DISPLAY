package repository

import (
	"errors"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/scoreboard/backend/internal/models"
)

func importRequest(name string, jersey int) models.TeamImportRequest {
	return models.TeamImportRequest{Teams: []models.TeamImportInput{{
		Name: "District One", Color: "#6366F1",
		Players: []models.PlayerInput{{Name: name, Gender: "Female", JerseyNumber: jersey, Status: "playing"}},
	}}}
}

func TestTeamRepoImportCreatesAtomically(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtext('scorecast_team_import'))")).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT id::text FROM teams").WithArgs("District One").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("INSERT INTO teams").WithArgs("District One", "#6366F1", "owner-id").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("team-id"))
	mock.ExpectQuery("SELECT LOWER\\(TRIM\\(name\\)\\), jersey_number, sort_order").WithArgs("team-id").WillReturnRows(sqlmock.NewRows([]string{"name", "jersey_number", "sort_order"}))
	mock.ExpectExec("INSERT INTO team_players").WithArgs("team-id", "Alice", "Female", 7, 0).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	result, err := NewTeamRepo(db).Import(importRequest("Alice", 7), "owner-id")
	if err != nil {
		t.Fatalf("import failed: %v", err)
	}
	if result.TeamsCreated != 1 || result.TeamsUpdated != 0 || result.PlayersAdded != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTeamRepoImportConflictRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtext('scorecast_team_import'))")).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT id::text FROM teams").WithArgs("District One").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("team-id"))
	mock.ExpectQuery("SELECT LOWER\\(TRIM\\(name\\)\\), jersey_number, sort_order").WithArgs("team-id").WillReturnRows(
		sqlmock.NewRows([]string{"name", "jersey_number", "sort_order"}).AddRow("alice", 7, 0),
	)
	mock.ExpectRollback()

	_, err = NewTeamRepo(db).Import(importRequest("Alice", 8), "owner-id")
	if !errors.Is(err, ErrTeamImportConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTeamRepoImportJerseyConflictRollsBack(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtext('scorecast_team_import'))")).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("SELECT id::text FROM teams").WithArgs("District One").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("team-id"))
	mock.ExpectQuery("SELECT LOWER\\(TRIM\\(name\\)\\), jersey_number, sort_order").WithArgs("team-id").WillReturnRows(
		sqlmock.NewRows([]string{"name", "jersey_number", "sort_order"}).AddRow("bob", 7, 0),
	)
	mock.ExpectRollback()

	_, err = NewTeamRepo(db).Import(importRequest("Alice", 7), "owner-id")
	if !errors.Is(err, ErrTeamImportConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestTeamRepoImportRollsBackEarlierTeamsWhenLaterTeamConflicts(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("SELECT pg_advisory_xact_lock(hashtext('scorecast_team_import'))")).WillReturnResult(sqlmock.NewResult(0, 1))
	// The first district and player are inserted successfully.
	mock.ExpectQuery("SELECT id::text FROM teams").WithArgs("District One").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("INSERT INTO teams").WithArgs("District One", "#6366F1", "owner-id").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("team-one"))
	mock.ExpectQuery("SELECT LOWER\\(TRIM\\(name\\)\\), jersey_number, sort_order").WithArgs("team-one").WillReturnRows(sqlmock.NewRows([]string{"name", "jersey_number", "sort_order"}))
	mock.ExpectExec("INSERT INTO team_players").WithArgs("team-one", "Alice", "Female", 7, 0).WillReturnResult(sqlmock.NewResult(1, 1))
	// A conflict in the second district must roll the entire transaction back.
	mock.ExpectQuery("SELECT id::text FROM teams").WithArgs("District Two").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("team-two"))
	mock.ExpectQuery("SELECT LOWER\\(TRIM\\(name\\)\\), jersey_number, sort_order").WithArgs("team-two").WillReturnRows(
		sqlmock.NewRows([]string{"name", "jersey_number", "sort_order"}).AddRow("bob", 12, 0),
	)
	mock.ExpectRollback()

	req := models.TeamImportRequest{Teams: []models.TeamImportInput{
		importRequest("Alice", 7).Teams[0],
		{Name: "District Two", Color: "#EF4444", Players: []models.PlayerInput{{Name: "Bob", Gender: "Male", JerseyNumber: 13, Status: "playing"}}},
	}}
	_, err = NewTeamRepo(db).Import(req, "owner-id")
	if !errors.Is(err, ErrTeamImportConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
