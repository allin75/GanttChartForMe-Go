export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  progress: number;
  color: string;
  parent_id: string | null;
  dependencies: string[];
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_color?: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  color?: string;
}

export interface CreateTaskDto {
  project_id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  progress?: number;
  color?: string;
  parent_id?: string;
  dependencies?: string[];
}

export interface UpdateTaskDto {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  progress?: number;
  color?: string;
  parent_id?: string;
  dependencies?: string[];
}

export interface AuthStatus {
  setup_complete: boolean;
  authenticated: boolean;
}

export interface AuthPayload {
  secret: string;
}
