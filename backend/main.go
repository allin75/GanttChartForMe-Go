package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const defaultColor = "#4A90D9"

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type Task struct {
	ID           string   `json:"id"`
	ProjectID    string   `json:"project_id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	StartDate    string   `json:"start_date"`
	EndDate      string   `json:"end_date"`
	Progress     int      `json:"progress"`
	Color        string   `json:"color"`
	ParentID     *string  `json:"parent_id"`
	Dependencies []string `json:"dependencies"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

type TaskView struct {
	Task
	ProjectName  string `json:"project_name,omitempty"`
	ProjectColor string `json:"project_color,omitempty"`
}

type projectPayload struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Color       *string `json:"color"`
}

type taskPayload struct {
	ProjectID    string    `json:"project_id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description"`
	StartDate    string    `json:"start_date"`
	EndDate      string    `json:"end_date"`
	Progress     *int      `json:"progress"`
	Color        *string   `json:"color"`
	ParentID     **string  `json:"parent_id"`
	Dependencies *[]string `json:"dependencies"`
}

type dataFile struct {
	Projects []Project `json:"projects"`
	Tasks    []Task    `json:"tasks"`
}

type store struct {
	mu         sync.Mutex
	path       string
	legacyPath string
	db         *sql.DB
}

func newStore(path string) (*store, error) {
	dbPath, legacyPath := resolveDataPaths(path)

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	s := &store{
		path:       dbPath,
		legacyPath: legacyPath,
		db:         db,
	}

	if err := s.initSchema(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := s.importLegacyJSONIfNeeded(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *store) initSchema() error {
	statements := []string{
		`PRAGMA foreign_keys = ON;`,
		`PRAGMA journal_mode = WAL;`,
		`CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			start_date TEXT NOT NULL,
			end_date TEXT NOT NULL,
			progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
			color TEXT NOT NULL,
			parent_id TEXT,
			dependencies TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(start_date, created_at);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("initialize sqlite schema: %w", err)
		}
	}
	return nil
}

func (s *store) listProjects() []Project {
	rows, err := s.db.Query(`
		SELECT id, name, description, color, created_at, updated_at
		FROM projects
		ORDER BY created_at DESC
	`)
	if err != nil {
		log.Printf("list projects failed: %v", err)
		return []Project{}
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var project Project
		if err := rows.Scan(
			&project.ID,
			&project.Name,
			&project.Description,
			&project.Color,
			&project.CreatedAt,
			&project.UpdatedAt,
		); err != nil {
			log.Printf("scan project failed: %v", err)
			return []Project{}
		}
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		log.Printf("iterate projects failed: %v", err)
		return []Project{}
	}
	return projects
}

func (s *store) getProject(id string) (Project, bool) {
	var project Project
	err := s.db.QueryRow(`
		SELECT id, name, description, color, created_at, updated_at
		FROM projects
		WHERE id = ?
	`, id).Scan(
		&project.ID,
		&project.Name,
		&project.Description,
		&project.Color,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		return Project{}, false
	}
	return project, true
}

func (s *store) createProject(input projectPayload) (Project, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return Project{}, errors.New("name is required")
	}

	now := nowISO()
	project := Project{
		ID:          newUUID(),
		Name:        name,
		Description: stringValue(input.Description, ""),
		Color:       stringValue(input.Color, defaultColor),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT INTO projects (id, name, description, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, project.ID, project.Name, project.Description, project.Color, project.CreatedAt, project.UpdatedAt)
	if err != nil {
		return Project{}, err
	}
	return project, nil
}

func (s *store) updateProject(id string, input projectPayload) (Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	project, ok := s.getProject(id)
	if !ok {
		return Project{}, os.ErrNotExist
	}

	if trimmed := strings.TrimSpace(input.Name); trimmed != "" {
		project.Name = trimmed
	}
	if input.Description != nil {
		project.Description = *input.Description
	}
	if input.Color != nil {
		project.Color = *input.Color
	}
	project.UpdatedAt = nowISO()

	_, err := s.db.Exec(`
		UPDATE projects
		SET name = ?, description = ?, color = ?, updated_at = ?
		WHERE id = ?
	`, project.Name, project.Description, project.Color, project.UpdatedAt, id)
	if err != nil {
		return Project{}, err
	}
	return project, nil
}

func (s *store) deleteProject(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	result, err := s.db.Exec(`DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return os.ErrNotExist
	}
	return nil
}

func (s *store) listTasks() []TaskView {
	return s.queryTaskViews("")
}

func (s *store) listTasksByProject(projectID string) []TaskView {
	return s.queryTaskViews(projectID)
}

func (s *store) getTask(id string) (Task, bool) {
	task, err := s.queryTask(id)
	if err != nil {
		return Task{}, false
	}
	return task, true
}

func (s *store) createTask(input taskPayload) (Task, error) {
	if err := validateTaskPayload(input); err != nil {
		return Task{}, err
	}

	name := strings.TrimSpace(input.Name)
	if input.ProjectID == "" || name == "" || input.StartDate == "" || input.EndDate == "" {
		return Task{}, errors.New("project_id, name, start_date and end_date are required")
	}

	now := nowISO()
	task := Task{
		ID:           newUUID(),
		ProjectID:    input.ProjectID,
		Name:         name,
		Description:  stringValue(input.Description, ""),
		StartDate:    input.StartDate,
		EndDate:      input.EndDate,
		Progress:     intValue(input.Progress, 0),
		Color:        stringValue(input.Color, defaultColor),
		ParentID:     parentValue(input.ParentID),
		Dependencies: sliceValue(input.Dependencies),
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.withTx(func(tx *sql.Tx) error {
		exists, err := projectExistsTx(tx, task.ProjectID)
		if err != nil {
			return err
		}
		if !exists {
			return errors.New("project not found")
		}

		dependenciesJSON, err := encodeDependencies(task.Dependencies)
		if err != nil {
			return err
		}

		_, err = tx.Exec(`
			INSERT INTO tasks (
				id, project_id, name, description, start_date, end_date,
				progress, color, parent_id, dependencies, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, task.ID, task.ProjectID, task.Name, task.Description, task.StartDate, task.EndDate,
			task.Progress, task.Color, task.ParentID, dependenciesJSON, task.CreatedAt, task.UpdatedAt)
		return err
	}); err != nil {
		return Task{}, err
	}

	return normalizeTask(task), nil
}

func (s *store) updateTask(id string, input taskPayload) (Task, error) {
	if err := validateTaskPayload(input); err != nil {
		return Task{}, err
	}

	task, err := s.queryTask(id)
	if err != nil {
		return Task{}, os.ErrNotExist
	}

	if trimmed := strings.TrimSpace(input.Name); trimmed != "" {
		task.Name = trimmed
	}
	if input.Description != nil {
		task.Description = *input.Description
	}
	if input.StartDate != "" {
		task.StartDate = input.StartDate
	}
	if input.EndDate != "" {
		task.EndDate = input.EndDate
	}
	if input.Progress != nil {
		task.Progress = *input.Progress
	}
	if input.Color != nil {
		task.Color = *input.Color
	}
	if input.ParentID != nil {
		task.ParentID = parentValue(input.ParentID)
	}
	if input.Dependencies != nil {
		task.Dependencies = sliceValue(input.Dependencies)
	}
	if task.StartDate > task.EndDate {
		return Task{}, errors.New("start_date cannot be later than end_date")
	}
	if task.Progress < 0 || task.Progress > 100 {
		return Task{}, errors.New("progress must be between 0 and 100")
	}

	task.UpdatedAt = nowISO()
	dependenciesJSON, err := encodeDependencies(task.Dependencies)
	if err != nil {
		return Task{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err = s.db.Exec(`
		UPDATE tasks
		SET name = ?, description = ?, start_date = ?, end_date = ?, progress = ?,
			color = ?, parent_id = ?, dependencies = ?, updated_at = ?
		WHERE id = ?
	`, task.Name, task.Description, task.StartDate, task.EndDate, task.Progress,
		task.Color, task.ParentID, dependenciesJSON, task.UpdatedAt, id)
	if err != nil {
		return Task{}, err
	}

	return normalizeTask(task), nil
}

func (s *store) deleteTask(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	result, err := s.db.Exec(`DELETE FROM tasks WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return os.ErrNotExist
	}
	return nil
}

type server struct {
	store       *store
	frontendDir string
}

func main() {
	port := envOr("PORT", "3001")
	dataPath := envOr("DATA_PATH", envOr("DB_PATH", filepath.Join(".", "data", "gantt.db")))
	frontendDir := envOr("FRONTEND_DIR", filepath.Join(".", "frontend"))

	store, err := newStore(dataPath)
	if err != nil {
		log.Fatalf("failed to initialize data store: %v", err)
	}

	s := &server{
		store:       store,
		frontendDir: frontendDir,
	}

	log.Printf("starting go backend on :%s", port)
	log.Printf("sqlite file: %s", store.path)
	if err := http.ListenAndServe(":"+port, s.routes()); err != nil {
		log.Fatal(err)
	}
}

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/projects", s.handleProjects)
	mux.HandleFunc("/api/projects/", s.handleProjectByID)
	mux.HandleFunc("/api/tasks/all", s.handleAllTasks)
	mux.HandleFunc("/api/tasks/project/", s.handleTasksByProject)
	mux.HandleFunc("/api/tasks", s.handleTasks)
	mux.HandleFunc("/api/tasks/", s.handleTaskByID)

	fileServer := http.FileServer(http.Dir(s.frontendDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setCORSHeaders(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if strings.HasPrefix(r.URL.Path, "/api/") {
			mux.ServeHTTP(w, r)
			return
		}

		indexPath := filepath.Join(s.frontendDir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			if r.URL.Path == "/" {
				http.ServeFile(w, r, indexPath)
				return
			}

			target := filepath.Join(s.frontendDir, filepath.Clean(strings.TrimPrefix(r.URL.Path, "/")))
			if info, err := os.Stat(target); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}

			http.ServeFile(w, r, indexPath)
			return
		}

		http.NotFound(w, r)
	})
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status":    "ok",
		"timestamp": nowISO(),
	})
}

func (s *server) handleProjects(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, s.store.listProjects())
	case http.MethodPost:
		var payload projectPayload
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		project, err := s.store.createProject(payload)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, project)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *server) handleProjectByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/projects/")
	if id == "" {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		project, ok := s.store.getProject(id)
		if !ok {
			writeError(w, http.StatusNotFound, "project not found")
			return
		}
		writeJSON(w, http.StatusOK, project)
	case http.MethodPut:
		var payload projectPayload
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		project, err := s.store.updateProject(id, payload)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeError(w, http.StatusNotFound, "project not found")
				return
			}
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, project)
	case http.MethodDelete:
		if err := s.store.deleteProject(id); err != nil {
			writeError(w, http.StatusNotFound, "project not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *server) handleAllTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}

	writeJSON(w, http.StatusOK, s.store.listTasks())
}

func (s *server) handleTasksByProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}

	projectID := strings.TrimPrefix(r.URL.Path, "/api/tasks/project/")
	if projectID == "" {
		http.NotFound(w, r)
		return
	}

	writeJSON(w, http.StatusOK, s.store.listTasksByProject(projectID))
}

func (s *server) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var payload taskPayload
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		task, err := s.store.createTask(payload)
		if err != nil {
			status := http.StatusBadRequest
			writeError(w, status, err.Error())
			return
		}

		writeJSON(w, http.StatusCreated, task)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *server) handleTaskByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
	if id == "" {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		task, ok := s.store.getTask(id)
		if !ok {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		writeJSON(w, http.StatusOK, task)
	case http.MethodPut:
		var payload taskPayload
		if err := decodeJSON(r, &payload); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		task, err := s.store.updateTask(id, payload)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeError(w, http.StatusNotFound, "task not found")
				return
			}
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, task)
	case http.MethodDelete:
		if err := s.store.deleteTask(id); err != nil {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeMethodNotAllowed(w)
	}
}

func validateTaskPayload(input taskPayload) error {
	if input.StartDate != "" && input.EndDate != "" && input.StartDate > input.EndDate {
		return errors.New("start_date cannot be later than end_date")
	}
	if input.Progress != nil && (*input.Progress < 0 || *input.Progress > 100) {
		return errors.New("progress must be between 0 and 100")
	}
	return nil
}

func normalizeTask(task Task) Task {
	if task.Dependencies == nil {
		task.Dependencies = []string{}
	}
	return task
}

func (s *store) queryTaskViews(projectID string) []TaskView {
	query := `
		SELECT
			t.id, t.project_id, t.name, t.description, t.start_date, t.end_date,
			t.progress, t.color, t.parent_id, t.dependencies, t.created_at, t.updated_at,
			p.name, p.color
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
	`
	args := []any{}
	if projectID != "" {
		query += ` WHERE t.project_id = ?`
		args = append(args, projectID)
	}
	query += ` ORDER BY t.start_date ASC, t.created_at ASC`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("list tasks failed: %v", err)
		return []TaskView{}
	}
	defer rows.Close()

	tasks := []TaskView{}
	for rows.Next() {
		task, err := scanTaskView(rows)
		if err != nil {
			log.Printf("scan task view failed: %v", err)
			return []TaskView{}
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		log.Printf("iterate tasks failed: %v", err)
		return []TaskView{}
	}
	return tasks
}

func (s *store) queryTask(id string) (Task, error) {
	row := s.db.QueryRow(`
		SELECT
			id, project_id, name, description, start_date, end_date,
			progress, color, parent_id, dependencies, created_at, updated_at
		FROM tasks
		WHERE id = ?
	`, id)
	return scanTask(row)
}

func (s *store) withTx(fn func(tx *sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (s *store) importLegacyJSONIfNeeded() error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM projects`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	raw, err := os.ReadFile(s.legacyPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}

	if len(strings.TrimSpace(string(raw))) == 0 {
		return nil
	}

	var payload dataFile
	if err := json.Unmarshal(raw, &payload); err != nil {
		return fmt.Errorf("parse legacy json data: %w", err)
	}

	return s.withTx(func(tx *sql.Tx) error {
		for _, project := range payload.Projects {
			if _, err := tx.Exec(`
				INSERT INTO projects (id, name, description, color, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`, project.ID, project.Name, project.Description, project.Color, project.CreatedAt, project.UpdatedAt); err != nil {
				return err
			}
		}

		sort.SliceStable(payload.Tasks, func(i, j int) bool {
			return payload.Tasks[i].CreatedAt < payload.Tasks[j].CreatedAt
		})
		for _, task := range payload.Tasks {
			dependenciesJSON, err := encodeDependencies(task.Dependencies)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(`
				INSERT INTO tasks (
					id, project_id, name, description, start_date, end_date,
					progress, color, parent_id, dependencies, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, task.ID, task.ProjectID, task.Name, task.Description, task.StartDate, task.EndDate,
				task.Progress, task.Color, task.ParentID, dependenciesJSON, task.CreatedAt, task.UpdatedAt); err != nil {
				return err
			}
		}
		return nil
	})
}

func legacyJSONPath(dbPath string) string {
	ext := filepath.Ext(dbPath)
	base := strings.TrimSuffix(dbPath, ext)
	if strings.EqualFold(ext, ".json") {
		return dbPath
	}

	candidates := []string{
		base + ".json",
		filepath.Join(filepath.Dir(dbPath), "gantt.json"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return candidates[0]
}

func resolveDataPaths(configuredPath string) (string, string) {
	if strings.EqualFold(filepath.Ext(configuredPath), ".json") {
		base := strings.TrimSuffix(configuredPath, filepath.Ext(configuredPath))
		return base + ".db", configuredPath
	}
	return configuredPath, legacyJSONPath(configuredPath)
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(scanner rowScanner) (Task, error) {
	var (
		task             Task
		parentID         sql.NullString
		dependenciesJSON string
	)

	err := scanner.Scan(
		&task.ID,
		&task.ProjectID,
		&task.Name,
		&task.Description,
		&task.StartDate,
		&task.EndDate,
		&task.Progress,
		&task.Color,
		&parentID,
		&dependenciesJSON,
		&task.CreatedAt,
		&task.UpdatedAt,
	)
	if err != nil {
		return Task{}, err
	}

	if parentID.Valid {
		task.ParentID = &parentID.String
	}
	task.Dependencies = decodeDependencies(dependenciesJSON)
	return normalizeTask(task), nil
}

func scanTaskView(scanner rowScanner) (TaskView, error) {
	var (
		task             Task
		parentID         sql.NullString
		dependenciesJSON string
		projectName      string
		projectColor     string
	)

	err := scanner.Scan(
		&task.ID,
		&task.ProjectID,
		&task.Name,
		&task.Description,
		&task.StartDate,
		&task.EndDate,
		&task.Progress,
		&task.Color,
		&parentID,
		&dependenciesJSON,
		&task.CreatedAt,
		&task.UpdatedAt,
		&projectName,
		&projectColor,
	)
	if err != nil {
		return TaskView{}, err
	}

	if parentID.Valid {
		task.ParentID = &parentID.String
	}
	task.Dependencies = decodeDependencies(dependenciesJSON)

	return TaskView{
		Task:         normalizeTask(task),
		ProjectName:  projectName,
		ProjectColor: projectColor,
	}, nil
}

func projectExistsTx(tx *sql.Tx, id string) (bool, error) {
	var count int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM projects WHERE id = ?`, id).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func encodeDependencies(value []string) (string, error) {
	if value == nil {
		value = []string{}
	}
	body, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func decodeDependencies(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var value []string
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return []string{}
	}
	if value == nil {
		return []string{}
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeMethodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("invalid JSON body")
	}
	return nil
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func stringValue(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	return *value
}

func intValue(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func sliceValue(value *[]string) []string {
	if value == nil {
		return []string{}
	}
	return append([]string{}, (*value)...)
}

func parentValue(value **string) *string {
	if value == nil {
		return nil
	}
	if *value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(**value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func newUUID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80

	buf := make([]byte, 36)
	hex.Encode(buf[0:8], bytes[0:4])
	buf[8] = '-'
	hex.Encode(buf[9:13], bytes[4:6])
	buf[13] = '-'
	hex.Encode(buf[14:18], bytes[6:8])
	buf[18] = '-'
	hex.Encode(buf[19:23], bytes[8:10])
	buf[23] = '-'
	hex.Encode(buf[24:36], bytes[10:16])
	return string(buf)
}
