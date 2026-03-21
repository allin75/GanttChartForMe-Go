import {
  Project,
  Task,
  ProjectAttachment,
  CreateProjectDto,
  UpdateProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
  AuthSetupPayload,
  AuthLoginPayload,
  AuthStatus,
  WeChatBindingStatus,
  WeChatBindConfirmPayload,
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

async function fetchFormData<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    credentials: 'include',
    ...options,
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
  setup: (data: AuthSetupPayload) => fetchApi<AuthStatus>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  login: (data: AuthLoginPayload) => fetchApi<AuthStatus>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  logout: () => fetchApi<{ authenticated: boolean }>('/api/auth/logout', {
    method: 'POST',
  }),
};

export const wechatApi = {
  getBindingStatus: () => fetchApi<WeChatBindingStatus>('/api/account/bindings/wechat'),
  startBinding: () => fetchApi<WeChatBindingStatus>('/api/account/bindings/wechat/start', {
    method: 'POST',
  }),
  confirmBinding: (data: WeChatBindConfirmPayload) => fetchApi<{ status: string }>('/api/wechat/bind/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  removeBinding: () => fetchApi<WeChatBindingStatus>('/api/account/bindings/wechat', {
    method: 'DELETE',
  }),
};

export const projectAttachmentsApi = {
  list: (projectId: string) => fetchApi<ProjectAttachment[]>(`/api/project-attachments/${projectId}/list`),
  upload: (projectId: string, files: File[], taskId?: string) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (taskId) {
      formData.append('task_id', taskId);
    }

    return fetchFormData<ProjectAttachment[]>(`/api/project-attachments/${projectId}/upload`, {
      method: 'POST',
      body: formData,
    });
  },
  downloadUrl: (projectId: string, attachmentId: string) => `${API_BASE}/api/project-attachments/${projectId}/download/${attachmentId}`,
  assignTask: (projectId: string, attachmentId: string, taskId?: string) => fetchApi<ProjectAttachment>(`/api/project-attachments/${projectId}/assign/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ task_id: taskId || '' }),
  }),
  remove: (projectId: string, attachmentId: string) => fetchApi<void>(`/api/project-attachments/${projectId}/delete/${attachmentId}`, {
    method: 'DELETE',
  }),
};
