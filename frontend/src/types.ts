export interface Project {
  id: string;
  name: string;
  description: string;
  owner: string;
  start_date: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  name: string;
  description: string;
  owner: string;
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

export interface ProjectAttachment {
  id: string;
  project_id: string;
  task_id: string;
  task_name?: string;
  original_name: string;
  stored_name: string;
  relative_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  owner?: string;
  start_date?: string;
  color?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  owner?: string;
  start_date?: string;
  color?: string;
}

export interface CreateTaskDto {
  project_id: string;
  name: string;
  description?: string;
  owner?: string;
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
  owner?: string;
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
  user?: AuthUser;
}

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  is_admin: boolean;
}

export interface AuthSetupPayload {
  username: string;
  password: string;
  display_name?: string;
}

export interface AuthLoginPayload {
  username: string;
  password: string;
}

export interface WeChatBindingInfo {
  display_name: string;
  avatar_url: string;
  open_id_masked: string;
  bound_at: string;
}

export interface WeChatBindAttempt {
  bind_token: string;
  verification_code: string;
  status: string;
  expires_at: string;
  callback_path: string;
  instruction_text: string;
}

export interface WeChatBindingStatus {
  bound: boolean;
  binding?: WeChatBindingInfo;
  pending_attempt?: WeChatBindAttempt;
  message?: string;
}

export interface WeChatBindConfirmPayload {
  bind_token: string;
  verification_code: string;
  open_id: string;
  union_id?: string;
  display_name?: string;
  avatar_url?: string;
}
