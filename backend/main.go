package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

const defaultColor = "#4A90D9"

const (
	sessionCookieName = "gantt_session"
	sessionDuration   = 30 * 24 * time.Hour
)

type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Owner       string `json:"owner"`
	StartDate   string `json:"start_date"`
	Color       string `json:"color"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type Task struct {
	ID           string   `json:"id"`
	ProjectID    string   `json:"project_id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Owner        string   `json:"owner"`
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

type ProjectAttachment struct {
	ID           string `json:"id"`
	ProjectID    string `json:"project_id"`
	TaskID       string `json:"task_id"`
	TaskName     string `json:"task_name,omitempty"`
	OriginalName string `json:"original_name"`
	StoredName   string `json:"stored_name"`
	RelativePath string `json:"relative_path"`
	MimeType     string `json:"mime_type"`
	SizeBytes    int64  `json:"size_bytes"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type projectPayload struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Owner       *string `json:"owner"`
	StartDate   *string `json:"start_date"`
	Color       *string `json:"color"`
}

type taskPayload struct {
	ProjectID    string    `json:"project_id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description"`
	Owner        *string   `json:"owner"`
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

type authSetupPayload struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type authLoginPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authUserResponse struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

type authStatusResponse struct {
	SetupComplete bool              `json:"setup_complete"`
	Authenticated bool              `json:"authenticated"`
	User          *authUserResponse `json:"user,omitempty"`
}

type wechatBinding struct {
	OpenID      string
	UnionID     string
	DisplayName string
	AvatarURL   string
	BoundAt     string
	UpdatedAt   string
}

type wechatBindAttempt struct {
	ID               string
	SessionID        string
	BindToken        string
	VerificationCode string
	Status           string
	OpenID           string
	UnionID          string
	DisplayName      string
	AvatarURL        string
	ExpiresAt        string
	ConfirmedAt      string
	CreatedAt        string
	UpdatedAt        string
}

type wechatBindingInfoResponse struct {
	DisplayName  string `json:"display_name"`
	AvatarURL    string `json:"avatar_url"`
	OpenIDMasked string `json:"open_id_masked"`
	BoundAt      string `json:"bound_at"`
}

type wechatBindAttemptResponse struct {
	BindToken        string `json:"bind_token"`
	VerificationCode string `json:"verification_code"`
	Status           string `json:"status"`
	ExpiresAt        string `json:"expires_at"`
	CallbackPath     string `json:"callback_path"`
	InstructionText  string `json:"instruction_text"`
}

type wechatBindingStatusResponse struct {
	Bound          bool                       `json:"bound"`
	Binding        *wechatBindingInfoResponse `json:"binding,omitempty"`
	PendingAttempt *wechatBindAttemptResponse `json:"pending_attempt,omitempty"`
	Message        string                     `json:"message,omitempty"`
}

type wechatBindConfirmPayload struct {
	BindToken        string `json:"bind_token"`
	VerificationCode string `json:"verification_code"`
	OpenID           string `json:"open_id"`
	UnionID          string `json:"union_id"`
	DisplayName      string `json:"display_name"`
	AvatarURL        string `json:"avatar_url"`
}

type projectAttachmentAssignPayload struct {
	TaskID string `json:"task_id"`
}

type authConfig struct {
	SecretHash string
	Salt       string
	CreatedAt  string
	UpdatedAt  string
}

type authSession struct {
	ID        string
	UserID    string
	ExpiresAt string
	CreatedAt string
	UpdatedAt string
}

type user struct {
	ID           string
	Username     string
	PasswordHash string
	DisplayName  string
	IsAdmin      bool
	CreatedAt    string
	UpdatedAt    string
}

type store struct {
	mu         sync.Mutex
	path       string
	legacyPath string
	filesDir   string
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
		filesDir:   filepath.Join(filepath.Dir(dbPath), "uploads"),
		db:         db,
	}

	if err := os.MkdirAll(s.filesDir, 0o755); err != nil {
		_ = db.Close()
		return nil, err
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
			owner TEXT NOT NULL DEFAULT '',
			start_date TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			owner TEXT NOT NULL DEFAULT '',
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
		`CREATE TABLE IF NOT EXISTS auth_config (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			secret_hash TEXT NOT NULL,
			salt TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS auth_sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL DEFAULT '',
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);`,
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			display_name TEXT NOT NULL DEFAULT '',
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`,
		`CREATE TABLE IF NOT EXISTS project_attachments (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL DEFAULT '',
			original_name TEXT NOT NULL,
			stored_name TEXT NOT NULL,
			relative_path TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size_bytes INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
			FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_project_attachments_project_id ON project_attachments(project_id, created_at DESC);`,
		`CREATE TABLE IF NOT EXISTS wechat_binding (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			open_id TEXT NOT NULL,
			union_id TEXT NOT NULL DEFAULT '',
			display_name TEXT NOT NULL DEFAULT '',
			avatar_url TEXT NOT NULL DEFAULT '',
			bound_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS wechat_bind_attempts (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			bind_token TEXT NOT NULL UNIQUE,
			verification_code TEXT NOT NULL,
			status TEXT NOT NULL,
			open_id TEXT NOT NULL DEFAULT '',
			union_id TEXT NOT NULL DEFAULT '',
			display_name TEXT NOT NULL DEFAULT '',
			avatar_url TEXT NOT NULL DEFAULT '',
			expires_at TEXT NOT NULL,
			confirmed_at TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_wechat_bind_attempts_session_id ON wechat_bind_attempts(session_id);`,
		`CREATE INDEX IF NOT EXISTS idx_wechat_bind_attempts_expires_at ON wechat_bind_attempts(expires_at);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("initialize sqlite schema: %w", err)
		}
	}
	if err := s.ensureColumn("projects", "owner", "ALTER TABLE projects ADD COLUMN owner TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("projects", "start_date", "ALTER TABLE projects ADD COLUMN start_date TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("tasks", "owner", "ALTER TABLE tasks ADD COLUMN owner TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("project_attachments", "task_id", "ALTER TABLE project_attachments ADD COLUMN task_id TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	return nil
}

func (s *store) ensureColumn(table string, column string, alterSQL string) error {
	rows, err := s.db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}

	_, err = s.db.Exec(alterSQL)
	return err
}

func (s *store) listProjects() []Project {
	rows, err := s.db.Query(`
		SELECT id, name, description, owner, start_date, color, created_at, updated_at
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
			&project.Owner,
			&project.StartDate,
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
		SELECT id, name, description, owner, start_date, color, created_at, updated_at
		FROM projects
		WHERE id = ?
	`, id).Scan(
		&project.ID,
		&project.Name,
		&project.Description,
		&project.Owner,
		&project.StartDate,
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
		Owner:       stringValue(input.Owner, ""),
		StartDate:   stringValue(input.StartDate, ""),
		Color:       stringValue(input.Color, defaultColor),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT INTO projects (id, name, description, owner, start_date, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, project.ID, project.Name, project.Description, project.Owner, project.StartDate, project.Color, project.CreatedAt, project.UpdatedAt)
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
	if input.Owner != nil {
		project.Owner = *input.Owner
	}
	if input.StartDate != nil {
		project.StartDate = *input.StartDate
	}
	if input.Color != nil {
		project.Color = *input.Color
	}
	project.UpdatedAt = nowISO()

	_, err := s.db.Exec(`
		UPDATE projects
		SET name = ?, description = ?, owner = ?, start_date = ?, color = ?, updated_at = ?
		WHERE id = ?
	`, project.Name, project.Description, project.Owner, project.StartDate, project.Color, project.UpdatedAt, id)
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

func (s *store) listProjectAttachments(projectID string) []ProjectAttachment {
	rows, err := s.db.Query(`
		SELECT a.id, a.project_id, a.task_id, COALESCE(t.name, ''), a.original_name, a.stored_name, a.relative_path, a.mime_type, a.size_bytes, a.created_at, a.updated_at
		FROM project_attachments a
		LEFT JOIN tasks t ON t.id = a.task_id
		WHERE project_id = ?
		ORDER BY a.created_at DESC
	`, projectID)
	if err != nil {
		log.Printf("list project attachments failed: %v", err)
		return []ProjectAttachment{}
	}
	defer rows.Close()

	attachments := []ProjectAttachment{}
	for rows.Next() {
		var attachment ProjectAttachment
		if err := rows.Scan(&attachment.ID, &attachment.ProjectID, &attachment.TaskID, &attachment.TaskName, &attachment.OriginalName, &attachment.StoredName, &attachment.RelativePath, &attachment.MimeType, &attachment.SizeBytes, &attachment.CreatedAt, &attachment.UpdatedAt); err != nil {
			log.Printf("scan attachment failed: %v", err)
			return []ProjectAttachment{}
		}
		attachments = append(attachments, attachment)
	}
	return attachments
}

func (s *store) createProjectAttachments(projectID string, taskID string, headers []*multipart.FileHeader) ([]ProjectAttachment, error) {
	if len(headers) == 0 {
		return []ProjectAttachment{}, errors.New("at least one file is required")
	}

	if _, ok := s.getProject(projectID); !ok {
		return []ProjectAttachment{}, os.ErrNotExist
	}
	trimmedTaskID := strings.TrimSpace(taskID)
	if trimmedTaskID != "" {
		task, ok := s.getTask(trimmedTaskID)
		if !ok || task.ProjectID != projectID {
			return []ProjectAttachment{}, errors.New("task not found in project")
		}
	}

	projectDir := filepath.Join(s.filesDir, projectID)
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		return []ProjectAttachment{}, err
	}

	now := nowISO()
	attachments := make([]ProjectAttachment, 0, len(headers))
	for _, header := range headers {
		if header == nil {
			continue
		}
		attachment, err := s.persistProjectAttachment(projectID, trimmedTaskID, header, now, projectDir)
		if err != nil {
			return []ProjectAttachment{}, err
		}
		attachments = append(attachments, attachment)
	}

	if len(attachments) == 0 {
		return []ProjectAttachment{}, errors.New("no valid files uploaded")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.withTx(func(tx *sql.Tx) error {
		for _, attachment := range attachments {
			_, err := tx.Exec(`
				INSERT INTO project_attachments (id, project_id, task_id, original_name, stored_name, relative_path, mime_type, size_bytes, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, attachment.ID, attachment.ProjectID, attachment.TaskID, attachment.OriginalName, attachment.StoredName, attachment.RelativePath, attachment.MimeType, attachment.SizeBytes, attachment.CreatedAt, attachment.UpdatedAt)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return []ProjectAttachment{}, err
	}

	return attachments, nil
}

func (s *store) deleteProjectAttachment(projectID string, attachmentID string) error {
	attachment, ok, err := s.getProjectAttachment(projectID, attachmentID)
	if err != nil {
		return err
	}
	if !ok {
		return os.ErrNotExist
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.db.Exec(`DELETE FROM project_attachments WHERE id = ? AND project_id = ?`, attachmentID, projectID); err != nil {
		return err
	}

	_ = os.Remove(filepath.Join(filepath.Dir(s.path), attachment.RelativePath))
	return nil
}

func (s *store) getProjectAttachment(projectID string, attachmentID string) (ProjectAttachment, bool, error) {
	var attachment ProjectAttachment
	err := s.db.QueryRow(`
		SELECT id, project_id, task_id, original_name, stored_name, relative_path, mime_type, size_bytes, created_at, updated_at
		FROM project_attachments
		WHERE project_id = ? AND id = ?
	`, projectID, attachmentID).Scan(&attachment.ID, &attachment.ProjectID, &attachment.TaskID, &attachment.OriginalName, &attachment.StoredName, &attachment.RelativePath, &attachment.MimeType, &attachment.SizeBytes, &attachment.CreatedAt, &attachment.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ProjectAttachment{}, false, nil
		}
		return ProjectAttachment{}, false, err
	}
	return attachment, true, nil
}

func (s *store) persistProjectAttachment(projectID string, taskID string, header *multipart.FileHeader, now string, projectDir string) (ProjectAttachment, error) {
	file, err := header.Open()
	if err != nil {
		return ProjectAttachment{}, err
	}
	defer file.Close()

	attachmentID := newUUID()
	storedName := attachmentID + filepath.Ext(header.Filename)
	absPath := filepath.Join(projectDir, storedName)
	output, err := os.Create(absPath)
	if err != nil {
		return ProjectAttachment{}, err
	}
	defer output.Close()

	size, err := io.Copy(output, file)
	if err != nil {
		return ProjectAttachment{}, err
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	return ProjectAttachment{
		ID:           attachmentID,
		ProjectID:    projectID,
		TaskID:       taskID,
		OriginalName: header.Filename,
		StoredName:   storedName,
		RelativePath: filepath.ToSlash(filepath.Join("uploads", projectID, storedName)),
		MimeType:     mimeType,
		SizeBytes:    size,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
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

func (s *store) getAuthConfig() (authConfig, bool, error) {
	var config authConfig
	err := s.db.QueryRow(`
		SELECT secret_hash, salt, created_at, updated_at
		FROM auth_config
		WHERE id = 1
	`).Scan(&config.SecretHash, &config.Salt, &config.CreatedAt, &config.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return authConfig{}, false, nil
		}
		return authConfig{}, false, err
	}
	return config, true, nil
}

func (s *store) getUserByID(id string) (user, bool, error) {
	var account user
	err := s.db.QueryRow(`
		SELECT id, username, password_hash, display_name, is_admin, created_at, updated_at
		FROM users
		WHERE id = ?
	`, id).Scan(&account.ID, &account.Username, &account.PasswordHash, &account.DisplayName, &account.IsAdmin, &account.CreatedAt, &account.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return user{}, false, nil
		}
		return user{}, false, err
	}
	return account, true, nil
}

func (s *store) getUserByUsername(username string) (user, bool, error) {
	var account user
	err := s.db.QueryRow(`
		SELECT id, username, password_hash, display_name, is_admin, created_at, updated_at
		FROM users
		WHERE username = ?
	`, strings.TrimSpace(strings.ToLower(username))).Scan(&account.ID, &account.Username, &account.PasswordHash, &account.DisplayName, &account.IsAdmin, &account.CreatedAt, &account.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return user{}, false, nil
		}
		return user{}, false, err
	}
	return account, true, nil
}

func (s *store) isAuthConfigured() (bool, error) {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *store) createInitialUser(payload authSetupPayload) (user, error) {
	username := normalizeUsername(payload.Username)
	password := strings.TrimSpace(payload.Password)
	if username == "" {
		return user{}, errors.New("username is required")
	}
	if len(password) < 6 {
		return user{}, errors.New("password must be at least 6 characters")
	}

	passwordHash, err := hashPassword(password)
	if err != nil {
		return user{}, err
	}

	now := nowISO()
	account := user{
		ID:           newUUID(),
		Username:     username,
		PasswordHash: passwordHash,
		DisplayName:  strings.TrimSpace(payload.DisplayName),
		IsAdmin:      true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if account.DisplayName == "" {
		account.DisplayName = username
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err = s.withTx(func(tx *sql.Tx) error {
		var count int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return errors.New("account already configured")
		}

		_, err := tx.Exec(`
			INSERT INTO users (id, username, password_hash, display_name, is_admin, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, account.ID, account.Username, account.PasswordHash, account.DisplayName, account.IsAdmin, account.CreatedAt, account.UpdatedAt)
		return err
	})
	if err != nil {
		return user{}, err
	}

	return account, nil
}

func (s *store) verifyUserCredentials(username string, password string) (user, bool, error) {
	account, ok, err := s.getUserByUsername(username)
	if err != nil {
		return user{}, false, err
	}
	if !ok {
		return user{}, false, nil
	}
	if err := bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(password)); err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return user{}, false, nil
		}
		return user{}, false, err
	}
	return account, true, nil
}

func (s *store) createSession(userID string) (authSession, error) {
	sessionID, err := randomHex(32)
	if err != nil {
		return authSession{}, err
	}
	trimmedUserID := strings.TrimSpace(userID)
	if trimmedUserID == "" {
		return authSession{}, errors.New("user_id is required")
	}
	now := time.Now().UTC()
	session := authSession{
		ID:        sessionID,
		UserID:    trimmedUserID,
		ExpiresAt: now.Add(sessionDuration).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
		UpdatedAt: now.Format(time.RFC3339),
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err = s.db.Exec(`
		INSERT INTO auth_sessions (id, user_id, expires_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, session.ID, session.UserID, session.ExpiresAt, session.CreatedAt, session.UpdatedAt)
	if err != nil {
		return authSession{}, err
	}

	return session, nil
}

func (s *store) getSession(id string) (authSession, bool, error) {
	var session authSession
	err := s.db.QueryRow(`
		SELECT id, user_id, expires_at, created_at, updated_at
		FROM auth_sessions
		WHERE id = ?
	`, id).Scan(&session.ID, &session.UserID, &session.ExpiresAt, &session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return authSession{}, false, nil
		}
		return authSession{}, false, err
	}
	return session, true, nil
}

func (s *store) touchSession(id string, expiresAt string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		UPDATE auth_sessions
		SET expires_at = ?, updated_at = ?
		WHERE id = ?
	`, expiresAt, nowISO(), id)
	return err
}

func (s *store) deleteSession(id string) error {
	if strings.TrimSpace(id) == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM auth_sessions WHERE id = ?`, id)
	return err
}

func (s *store) deleteExpiredSessions() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM auth_sessions WHERE expires_at <= ?`, nowISO())
	return err
}

func (s *store) getWeChatBinding() (wechatBinding, bool, error) {
	var binding wechatBinding
	err := s.db.QueryRow(`
		SELECT open_id, union_id, display_name, avatar_url, bound_at, updated_at
		FROM wechat_binding
		WHERE id = 1
	`).Scan(&binding.OpenID, &binding.UnionID, &binding.DisplayName, &binding.AvatarURL, &binding.BoundAt, &binding.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return wechatBinding{}, false, nil
		}
		return wechatBinding{}, false, err
	}
	return binding, true, nil
}

func (s *store) getActiveWeChatBindAttempt(sessionID string) (wechatBindAttempt, bool, error) {
	if strings.TrimSpace(sessionID) == "" {
		return wechatBindAttempt{}, false, nil
	}

	var attempt wechatBindAttempt
	err := s.db.QueryRow(`
		SELECT id, session_id, bind_token, verification_code, status, open_id, union_id, display_name, avatar_url, expires_at, confirmed_at, created_at, updated_at
		FROM wechat_bind_attempts
		WHERE session_id = ? AND status = 'pending' AND expires_at > ?
		ORDER BY created_at DESC
		LIMIT 1
	`, sessionID, nowISO()).Scan(
		&attempt.ID,
		&attempt.SessionID,
		&attempt.BindToken,
		&attempt.VerificationCode,
		&attempt.Status,
		&attempt.OpenID,
		&attempt.UnionID,
		&attempt.DisplayName,
		&attempt.AvatarURL,
		&attempt.ExpiresAt,
		&attempt.ConfirmedAt,
		&attempt.CreatedAt,
		&attempt.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return wechatBindAttempt{}, false, nil
		}
		return wechatBindAttempt{}, false, err
	}
	return attempt, true, nil
}

func (s *store) createWeChatBindAttempt(sessionID string) (wechatBindAttempt, error) {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return wechatBindAttempt{}, errors.New("session is required")
	}

	bindToken, err := randomHex(16)
	if err != nil {
		return wechatBindAttempt{}, err
	}
	verificationCode, err := randomDigits(6)
	if err != nil {
		return wechatBindAttempt{}, err
	}

	now := nowISO()
	attempt := wechatBindAttempt{
		ID:               newUUID(),
		SessionID:        trimmed,
		BindToken:        bindToken,
		VerificationCode: verificationCode,
		Status:           "pending",
		ExpiresAt:        time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339),
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err = s.withTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`DELETE FROM wechat_bind_attempts WHERE session_id = ?`, attempt.SessionID); err != nil {
			return err
		}

		_, err := tx.Exec(`
			INSERT INTO wechat_bind_attempts (
				id, session_id, bind_token, verification_code, status,
				open_id, union_id, display_name, avatar_url,
				expires_at, confirmed_at, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, '', '', '', '', ?, '', ?, ?)
		`, attempt.ID, attempt.SessionID, attempt.BindToken, attempt.VerificationCode, attempt.Status, attempt.ExpiresAt, attempt.CreatedAt, attempt.UpdatedAt)
		return err
	})
	if err != nil {
		return wechatBindAttempt{}, err
	}

	return attempt, nil
}

func (s *store) cleanupExpiredWeChatBindAttempts() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM wechat_bind_attempts WHERE expires_at <= ?`, nowISO())
	return err
}

func (s *store) confirmWeChatBind(payload wechatBindConfirmPayload) error {
	bindToken := strings.TrimSpace(payload.BindToken)
	verificationCode := strings.TrimSpace(payload.VerificationCode)
	openID := strings.TrimSpace(payload.OpenID)
	if bindToken == "" || verificationCode == "" || openID == "" {
		return errors.New("bind_token, verification_code and open_id are required")
	}

	now := nowISO()
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.withTx(func(tx *sql.Tx) error {
		var attempt wechatBindAttempt
		err := tx.QueryRow(`
			SELECT id, session_id, bind_token, verification_code, status, open_id, union_id, display_name, avatar_url, expires_at, confirmed_at, created_at, updated_at
			FROM wechat_bind_attempts
			WHERE bind_token = ?
			LIMIT 1
		`, bindToken).Scan(
			&attempt.ID,
			&attempt.SessionID,
			&attempt.BindToken,
			&attempt.VerificationCode,
			&attempt.Status,
			&attempt.OpenID,
			&attempt.UnionID,
			&attempt.DisplayName,
			&attempt.AvatarURL,
			&attempt.ExpiresAt,
			&attempt.ConfirmedAt,
			&attempt.CreatedAt,
			&attempt.UpdatedAt,
		)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return os.ErrNotExist
			}
			return err
		}

		if attempt.Status != "pending" {
			return errors.New("bind attempt is not pending")
		}

		expiresAt, err := time.Parse(time.RFC3339, attempt.ExpiresAt)
		if err != nil || time.Now().UTC().After(expiresAt) {
			return errors.New("bind attempt expired")
		}

		if subtle.ConstantTimeCompare([]byte(attempt.VerificationCode), []byte(verificationCode)) != 1 {
			return errors.New("invalid verification code")
		}

		displayName := strings.TrimSpace(payload.DisplayName)
		if displayName == "" {
			displayName = "微信用户"
		}

		if _, err := tx.Exec(`
			INSERT INTO wechat_binding (id, open_id, union_id, display_name, avatar_url, bound_at, updated_at)
			VALUES (1, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				open_id = excluded.open_id,
				union_id = excluded.union_id,
				display_name = excluded.display_name,
				avatar_url = excluded.avatar_url,
				bound_at = excluded.bound_at,
				updated_at = excluded.updated_at
		`, openID, strings.TrimSpace(payload.UnionID), displayName, strings.TrimSpace(payload.AvatarURL), now, now); err != nil {
			return err
		}

		if _, err := tx.Exec(`
			UPDATE wechat_bind_attempts
			SET status = 'confirmed', open_id = ?, union_id = ?, display_name = ?, avatar_url = ?, confirmed_at = ?, updated_at = ?
			WHERE id = ?
		`, openID, strings.TrimSpace(payload.UnionID), displayName, strings.TrimSpace(payload.AvatarURL), now, now, attempt.ID); err != nil {
			return err
		}

		if _, err := tx.Exec(`DELETE FROM wechat_bind_attempts WHERE session_id = ?`, attempt.SessionID); err != nil {
			return err
		}

		return nil
	})
}

func (s *store) deleteWeChatBinding() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM wechat_binding WHERE id = 1`)
	return err
}

type server struct {
	store       *store
	frontendDir string
}

func main() {
	port := envOr("PORT", "3001")
	dataPath := resolveDefaultDataPath()
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
	mux.HandleFunc("/api/auth/status", s.handleAuthStatus)
	mux.HandleFunc("/api/auth/setup", s.handleAuthSetup)
	mux.HandleFunc("/api/auth/login", s.handleAuthLogin)
	mux.HandleFunc("/api/auth/logout", s.handleAuthLogout)
	mux.HandleFunc("/api/account/bindings/wechat", s.handleWeChatBinding)
	mux.HandleFunc("/api/account/bindings/wechat/start", s.handleWeChatBindingStart)
	mux.HandleFunc("/api/wechat/bind/confirm", s.handleWeChatBindingConfirm)
	mux.HandleFunc("/api/projects", s.handleProjects)
	mux.HandleFunc("/api/projects/", s.handleProjectByID)
	mux.HandleFunc("/api/project-attachments/", s.handleProjectAttachments)
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
			if s.isProtectedAPIPath(r.URL.Path) {
				authenticated, err := s.requireAuth(w, r)
				if err != nil {
					log.Printf("auth check failed: %v", err)
					writeError(w, http.StatusInternalServerError, "failed to verify session")
					return
				}
				if !authenticated {
					return
				}
			}
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

func (s *server) isProtectedAPIPath(path string) bool {
	if !strings.HasPrefix(path, "/api/") {
		return false
	}

	publicPaths := []string{
		"/api/health",
		"/api/auth/status",
		"/api/auth/setup",
		"/api/auth/login",
		"/api/auth/logout",
		"/api/wechat/bind/confirm",
	}
	for _, publicPath := range publicPaths {
		if path == publicPath {
			return false
		}
	}
	return true
}

func (s *server) requireAuth(w http.ResponseWriter, r *http.Request) (bool, error) {
	if err := s.store.deleteExpiredSessions(); err != nil {
		return false, err
	}

	sessionID := s.sessionIDFromRequest(r)
	if sessionID == "" {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return false, nil
	}

	session, ok, err := s.store.getSession(sessionID)
	if err != nil {
		return false, err
	}
	if !ok {
		s.clearSessionCookie(w)
		writeError(w, http.StatusUnauthorized, "authentication required")
		return false, nil
	}

	expiresAt, err := time.Parse(time.RFC3339, session.ExpiresAt)
	if err != nil {
		_ = s.store.deleteSession(session.ID)
		s.clearSessionCookie(w)
		writeError(w, http.StatusUnauthorized, "authentication required")
		return false, nil
	}
	if time.Now().UTC().After(expiresAt) {
		_ = s.store.deleteSession(session.ID)
		s.clearSessionCookie(w)
		writeError(w, http.StatusUnauthorized, "authentication required")
		return false, nil
	}

	newExpiry := time.Now().UTC().Add(sessionDuration).Format(time.RFC3339)
	if err := s.store.touchSession(session.ID, newExpiry); err != nil {
		return false, err
	}
	s.setSessionCookie(w, session.ID, newExpiry)

	return true, nil
}

func (s *server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}

	configured, err := s.store.isAuthConfigured()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load auth status")
		return
	}

	authenticated := false
	var currentUser *authUserResponse
	if configured {
		if err := s.store.deleteExpiredSessions(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load auth status")
			return
		}

		sessionID := s.sessionIDFromRequest(r)
		if sessionID != "" {
			session, ok, err := s.store.getSession(sessionID)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to load auth status")
				return
			}
			if ok {
				expiresAt, parseErr := time.Parse(time.RFC3339, session.ExpiresAt)
				if parseErr == nil && time.Now().UTC().Before(expiresAt) {
					account, userOK, userErr := s.store.getUserByID(session.UserID)
					if userErr != nil {
						writeError(w, http.StatusInternalServerError, "failed to load auth status")
						return
					}
					if userOK {
						authenticated = true
						currentUser = toAuthUserResponse(account)
					} else {
						_ = s.store.deleteSession(session.ID)
						s.clearSessionCookie(w)
					}
				} else {
					_ = s.store.deleteSession(session.ID)
					s.clearSessionCookie(w)
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, authStatusResponse{
		SetupComplete: configured,
		Authenticated: authenticated,
		User:          currentUser,
	})
}

func (s *server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	configured, err := s.store.isAuthConfigured()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load auth config")
		return
	}
	if configured {
		writeError(w, http.StatusConflict, "account already configured")
		return
	}

	var payload authSetupPayload
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	account, err := s.store.createInitialUser(payload)
	if err != nil {
		status := http.StatusBadRequest
		if err.Error() == "account already configured" {
			status = http.StatusConflict
		}
		writeError(w, status, err.Error())
		return
	}

	session, err := s.store.createSession(account.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	s.setSessionCookie(w, session.ID, session.ExpiresAt)

	writeJSON(w, http.StatusCreated, authStatusResponse{
		SetupComplete: true,
		Authenticated: true,
		User:          toAuthUserResponse(account),
	})
}

func (s *server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	configured, err := s.store.isAuthConfigured()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load auth config")
		return
	}
	if !configured {
		writeError(w, http.StatusConflict, "account is not configured")
		return
	}

	var payload authLoginPayload
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	account, valid, err := s.store.verifyUserCredentials(payload.Username, payload.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !valid {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	session, err := s.store.createSession(account.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	s.setSessionCookie(w, session.ID, session.ExpiresAt)

	writeJSON(w, http.StatusOK, authStatusResponse{
		SetupComplete: true,
		Authenticated: true,
		User:          toAuthUserResponse(account),
	})
}

func (s *server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	if sessionID := s.sessionIDFromRequest(r); sessionID != "" {
		_ = s.store.deleteSession(sessionID)
	}
	s.clearSessionCookie(w)

	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": false})
}

func (s *server) handleWeChatBinding(w http.ResponseWriter, r *http.Request) {
	if err := s.store.cleanupExpiredWeChatBindAttempts(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load wechat binding")
		return
	}

	sessionID := s.sessionIDFromRequest(r)
	if sessionID == "" {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		status, err := s.currentWeChatBindingStatus(sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load wechat binding")
			return
		}
		writeJSON(w, http.StatusOK, status)
	case http.MethodDelete:
		if err := s.store.deleteWeChatBinding(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to unbind wechat")
			return
		}
		status, err := s.currentWeChatBindingStatus(sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load wechat binding")
			return
		}
		status.Message = "微信绑定已解除"
		writeJSON(w, http.StatusOK, status)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *server) handleWeChatBindingStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	if err := s.store.cleanupExpiredWeChatBindAttempts(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start wechat binding")
		return
	}

	sessionID := s.sessionIDFromRequest(r)
	if sessionID == "" {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	attempt, ok, err := s.store.getActiveWeChatBindAttempt(sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start wechat binding")
		return
	}
	if !ok {
		attempt, err = s.store.createWeChatBindAttempt(sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to start wechat binding")
			return
		}
	}

	status, err := s.currentWeChatBindingStatus(sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load wechat binding")
		return
	}
	status.PendingAttempt = buildWeChatBindAttemptResponse(attempt)
	status.Message = "请使用微信接入服务完成确认，系统已生成一次性绑定口令。"
	writeJSON(w, http.StatusCreated, status)
}

func (s *server) handleWeChatBindingConfirm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var payload wechatBindConfirmPayload
	if err := decodeJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.store.confirmWeChatBind(payload); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, os.ErrNotExist) {
			status = http.StatusNotFound
		}
		writeError(w, status, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "confirmed",
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

func (s *server) handleProjectAttachments(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/project-attachments/")
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) < 2 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	projectID := parts[0]
	action := parts[1]

	if action == "list" && r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, s.store.listProjectAttachments(projectID))
		return
	}

	if action == "upload" && r.Method == http.MethodPost {
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse upload form")
			return
		}
		files := r.MultipartForm.File["files"]
		attachments, err := s.store.createProjectAttachments(projectID, r.FormValue("task_id"), files)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeError(w, http.StatusNotFound, "project not found")
				return
			}
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, attachments)
		return
	}

	if action == "download" && len(parts) == 3 && r.Method == http.MethodGet {
		attachment, ok, err := s.store.getProjectAttachment(projectID, parts[2])
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load attachment")
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "attachment not found")
			return
		}
		w.Header().Set("Content-Type", attachment.MimeType)
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", attachment.OriginalName))
		http.ServeFile(w, r, filepath.Join(filepath.Dir(s.store.path), attachment.RelativePath))
		return
	}

	if action == "delete" && len(parts) == 3 && r.Method == http.MethodDelete {
		if err := s.store.deleteProjectAttachment(projectID, parts[2]); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeError(w, http.StatusNotFound, "attachment not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to delete attachment")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	writeMethodNotAllowed(w)
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

func (s *server) currentWeChatBindingStatus(sessionID string) (wechatBindingStatusResponse, error) {
	binding, bound, err := s.store.getWeChatBinding()
	if err != nil {
		return wechatBindingStatusResponse{}, err
	}

	status := wechatBindingStatusResponse{
		Bound:   bound,
		Message: "微信绑定用于扩展扫码身份联动，不影响现有密钥登录。",
	}
	if bound {
		status.Binding = &wechatBindingInfoResponse{
			DisplayName:  binding.DisplayName,
			AvatarURL:    binding.AvatarURL,
			OpenIDMasked: maskIdentifier(binding.OpenID),
			BoundAt:      binding.BoundAt,
		}
	}

	attempt, ok, err := s.store.getActiveWeChatBindAttempt(sessionID)
	if err != nil {
		return wechatBindingStatusResponse{}, err
	}
	if ok {
		status.PendingAttempt = buildWeChatBindAttemptResponse(attempt)
	}

	return status, nil
}

func buildWeChatBindAttemptResponse(attempt wechatBindAttempt) *wechatBindAttemptResponse {
	return &wechatBindAttemptResponse{
		BindToken:        attempt.BindToken,
		VerificationCode: attempt.VerificationCode,
		Status:           attempt.Status,
		ExpiresAt:        attempt.ExpiresAt,
		CallbackPath:     "/api/wechat/bind/confirm",
		InstructionText:  "将绑定口令、验证码和微信 open_id 提交到确认接口，即可把微信身份绑定到当前已登录账号。",
	}
}

func maskIdentifier(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 8 {
		return trimmed[:2] + "****"
	}
	return trimmed[:4] + "****" + trimmed[len(trimmed)-4:]
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
	w.Header().Set("Access-Control-Allow-Origin", envOr("CORS_ALLOW_ORIGIN", "http://localhost:3000"))
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
}

func (s *server) sessionIDFromRequest(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}

func (s *server) setSessionCookie(w http.ResponseWriter, sessionID string, expiresAt string) {
	expires, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		expires = time.Now().UTC().Add(sessionDuration)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
	})
}

func (s *server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
		Expires:  time.Unix(0, 0).UTC(),
		MaxAge:   -1,
	})
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

func resolveDefaultDataPath() string {
	if value := strings.TrimSpace(os.Getenv("DATA_PATH")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("DB_PATH")); value != "" {
		return value
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		return filepath.Join(exeDir, "data", "gantt.db")
	}
	return filepath.Join("backend", "data", "gantt.db")
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

func randomHex(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func randomDigits(size int) (string, error) {
	if size <= 0 {
		return "", errors.New("size must be positive")
	}

	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	result := make([]byte, size)
	for index, value := range bytes {
		result[index] = byte('0' + (value % 10))
	}
	return string(result), nil
}

func normalizeUsername(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func toAuthUserResponse(account user) *authUserResponse {
	return &authUserResponse{
		ID:          account.ID,
		Username:    account.Username,
		DisplayName: account.DisplayName,
		IsAdmin:     account.IsAdmin,
	}
}

func hashSecret(secret string, salt string) string {
	sum := sha256.Sum256([]byte(salt + ":" + secret))
	return hex.EncodeToString(sum[:])
}
