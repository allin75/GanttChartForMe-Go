import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreateProjectDto, Project, Task, UpdateProjectDto } from './types';
import { ApiError, authApi, tasksApi, projectsApi } from './api';
import ProjectList from './components/ProjectList';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import AuthScreen from './components/AuthScreen';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

type TaskViewMode = 'project' | 'all' | 'idle';
type AuthViewState = 'checking' | 'setup' | 'login' | 'authenticated';

const App: React.FC = () => {
  const [authView, setAuthView] = useState<AuthViewState>('checking');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const currentView = useMemo<TaskViewMode>(() => {
    if (showAllTasks) {
      return 'all';
    }

    if (selectedProject) {
      return 'project';
    }

    return 'idle';
  }, [selectedProject, showAllTasks]);

  const handleUnauthorized = useCallback(() => {
    setAuthView('login');
    setAuthError('登录状态已失效，请重新输入密钥。');
    setSelectedProject(null);
    setShowAllTasks(false);
    setTasks([]);
    setProjects([]);
    setShowTaskModal(false);
    setEditingTask(null);
  }, []);

  const resolveApiError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        handleUnauthorized();
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return fallback;
  }, [handleUnauthorized]);

  const checkAuthStatus = useCallback(async () => {
    try {
      setAuthError(null);
      setAuthView('checking');
      const status = await authApi.getStatus();

      if (!status.setup_complete) {
        setAuthView('setup');
        return;
      }

      setAuthView(status.authenticated ? 'authenticated' : 'login');
    } catch (error) {
      setAuthError(resolveApiError(error, '无法检查登录状态，请稍后再试。'));
      setAuthView('login');
    }
  }, [resolveApiError]);

  const loadProjects = useCallback(async () => {
    try {
      setProjectsLoading(true);
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
      const message = resolveApiError(error, 'Failed to load projects');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    } finally {
      setProjectsLoading(false);
    }
  }, [resolveApiError]);

  const loadTasksByProject = useCallback(async (projectId: string) => {
    try {
      setTasksLoading(true);
      const data = await tasksApi.getByProject(projectId);
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      const message = resolveApiError(error, 'Failed to load tasks');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    } finally {
      setTasksLoading(false);
    }
  }, [resolveApiError]);

  const loadAllTasks = useCallback(async () => {
    try {
      setTasksLoading(true);
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load all tasks:', error);
      const message = resolveApiError(error, 'Failed to load all tasks');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    } finally {
      setTasksLoading(false);
    }
  }, [resolveApiError]);

  const refreshTasks = useCallback(async () => {
    if (currentView === 'all') {
      await loadAllTasks();
      return;
    }

    if (currentView === 'project' && selectedProject) {
      await loadTasksByProject(selectedProject.id);
      return;
    }

    setTasks([]);
  }, [currentView, loadAllTasks, loadTasksByProject, selectedProject]);

  const refreshAllData = useCallback(async () => {
    await Promise.all([loadProjects(), refreshTasks()]);
  }, [loadProjects, refreshTasks]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (authView !== 'authenticated') {
      return;
    }

    loadProjects();
  }, [authView, loadProjects]);

  useEffect(() => {
    if (authView !== 'authenticated') {
      setTasks([]);
      return;
    }

    refreshTasks();
  }, [authView, refreshTasks]);

  const handleAuthSubmit = useCallback(async (secret: string) => {
    try {
      setAuthLoading(true);
      setAuthError(null);

      if (authView === 'setup') {
        await authApi.setup({ secret });
      } else {
        await authApi.login({ secret });
      }

      setAuthView('authenticated');
    } catch (error) {
      setAuthError(resolveApiError(error, authView === 'setup' ? '密钥保存失败。' : '登录失败。'));
    } finally {
      setAuthLoading(false);
    }
  }, [authView, resolveApiError]);

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      handleUnauthorized();
      setAuthError(null);
    }
  }, [handleUnauthorized]);

  const handleSelectProject = (project: Project | null) => {
    setSelectedProject(project);
    setShowAllTasks(false);
  };

  const handleSelectAllTasks = () => {
    setShowAllTasks(true);
    setSelectedProject(null);
  };

  const handleRefresh = async () => {
    await refreshAllData();
  };

  const handleTaskUpdate = async (id: string, data: { start_date?: string; end_date?: string }) => {
    try {
      await tasksApi.update(id, data);
      await refreshTasks();
    } catch (error) {
      console.error('Failed to update task:', error);
      const message = resolveApiError(error, 'Failed to update task');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    }
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleCreateTask = () => {
    if (!selectedProject && !showAllTasks) {
      return;
    }

    setEditingTask(null);
    setShowTaskModal(true);
  };

  const handleTaskModalClose = () => {
    setShowTaskModal(false);
    setEditingTask(null);
  };

  const handleTaskModalSave = async () => {
    await refreshTasks();
  };

  const handleCreateProject = async (data: CreateProjectDto) => {
    try {
      await projectsApi.create(data);
      await loadProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
      const message = resolveApiError(error, 'Failed to create project');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    }
  };

  const handleUpdateProject = async (projectId: string, data: UpdateProjectDto) => {
    try {
      await projectsApi.update(projectId, data);
      await loadProjects();

      if (selectedProject?.id === projectId) {
        setSelectedProject((current) => current ? { ...current, ...data } : current);
      }
    } catch (error) {
      console.error('Failed to update project:', error);
      const message = resolveApiError(error, 'Failed to update project');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await projectsApi.delete(projectId);

      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setShowAllTasks(false);
        setTasks([]);
      } else if (showAllTasks) {
        await refreshTasks();
      }

      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      const message = resolveApiError(error, 'Failed to delete project');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    }
  };

  const modalProject =
    selectedProject ||
    projects.find((project) => project.id === editingTask?.project_id) ||
    projects[0] ||
    null;

  if (authView === 'checking') {
    return (
      <div className="auth-shell">
        <div className="auth-card card shadow-sm border-0">
          <div className="card-body p-5 text-center">
            <div className="spinner-border text-primary" role="status" />
            <p className="mt-3 mb-0 text-muted">正在检查访问状态...</p>
          </div>
        </div>
      </div>
    );
  }

  if (authView === 'setup' || authView === 'login') {
    return (
      <AuthScreen
        mode={authView === 'setup' ? 'setup' : 'login'}
        loading={authLoading}
        error={authError}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">甘特图 · 项目进度管理</h1>
        {(selectedProject || showAllTasks) && (
          <div className="header-actions">
            <span className="badge bg-primary">
              {showAllTasks ? '全部任务' : selectedProject?.name}
            </span>
            {!showAllTasks && (
              <button className="btn btn-sm btn-success" onClick={handleCreateTask}>
                + 新建任务
              </button>
            )}
            <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        )}
        {!(selectedProject || showAllTasks) && (
          <div className="header-actions">
            <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        )}
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <ProjectList
            projects={projects}
            loading={projectsLoading}
            selectedProjectId={selectedProject?.id || null}
            showAllTasks={showAllTasks}
            onSelectProject={handleSelectProject}
            onSelectAllTasks={handleSelectAllTasks}
            onRefresh={handleRefresh}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
          />
        </aside>

        <main className="app-main">
          {authError && (
            <div className="alert alert-warning m-3 mb-0" role="alert">
              {authError}
            </div>
          )}
          {(selectedProject || showAllTasks) ? (
            tasksLoading ? (
              <div className="empty-state">
                <div className="spinner-border text-primary" role="status" />
                <p className="mt-3 mb-0">正在加载任务...</p>
              </div>
            ) : tasks.length > 0 ? (
              <GanttChart
                tasks={tasks}
                onTaskUpdate={handleTaskUpdate}
                onTaskClick={handleTaskClick}
                showProjectName={showAllTasks}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>暂无任务</h3>
                {!showAllTasks && (
                  <>
                    <p>点击上方“新建任务”按钮，创建第一个任务。</p>
                    <button className="btn btn-primary" onClick={handleCreateTask}>
                      + 新建任务
                    </button>
                  </>
                )}
              </div>
            )
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <h3>请选择一个项目</h3>
              <p>从左侧列表选择项目查看甘特图，或切换到“全部任务”。</p>
            </div>
          )}
        </main>
      </div>

      {showTaskModal && modalProject && (
        <TaskModal
          task={editingTask}
          project={modalProject}
          onClose={handleTaskModalClose}
          onSave={handleTaskModalSave}
        />
      )}
    </div>
  );
};

export default App;
