import { Project, Task, CreateProjectDto, UpdateProjectDto, CreateTaskDto, UpdateTaskDto } from './types';

const API_BASE = process.env.REACT_APP_API_URL || '';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
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
