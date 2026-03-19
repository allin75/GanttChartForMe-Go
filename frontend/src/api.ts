import {
  Project,
  Task,
  CreateProjectDto,
  UpdateProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
  AuthPayload,
  AuthStatus,
} from './types';

const API_BASE = process.env.REACT_APP_API_URL || '';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Projects API
export const projectsApi = {
  getAll: () => fetchApi<Project[]>('/api/projects'),
  getById: (id: string) => fetchApi<Project>(`/api/projects/${id}`),
  create: (data: CreateProjectDto) => fetchApi<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: UpdateProjectDto) => fetchApi<Project>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => fetchApi<void>(`/api/projects/${id}`, {
    method: 'DELETE',
  }),
};

// Tasks API
export const tasksApi = {
  getAll: () => fetchApi<Task[]>('/api/tasks/all'),
  getByProject: (projectId: string) => fetchApi<Task[]>(`/api/tasks/project/${projectId}`),
  getById: (id: string) => fetchApi<Task>(`/api/tasks/${id}`),
  create: (data: CreateTaskDto) => fetchApi<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  update: (id: string, data: UpdateTaskDto) => fetchApi<Task>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (id: string) => fetchApi<void>(`/api/tasks/${id}`, {
    method: 'DELETE',
  }),
};

export const authApi = {
  getStatus: () => fetchApi<AuthStatus>('/api/auth/status'),
  setup: (data: AuthPayload) => fetchApi<AuthStatus>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  login: (data: AuthPayload) => fetchApi<AuthStatus>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  logout: () => fetchApi<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
  }),
};
