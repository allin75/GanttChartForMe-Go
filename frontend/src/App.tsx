import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthLoginPayload, AuthSetupPayload, CreateProjectDto, Project, Task, UpdateProjectDto, WeChatBindingStatus } from './types';
import { ApiError, authApi, tasksApi, projectsApi, wechatApi } from './api';
import ProjectList from './components/ProjectList';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import AuthScreen from './components/AuthScreen';
import WeChatBindingCard from './components/WeChatBindingCard';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

type TaskViewMode = 'project' | 'all' | 'idle';
type AuthViewState = 'checking' | 'setup' | 'login' | 'authenticated';
type AppModule = 'dashboard' | 'project-center' | 'task-management' | 'gantt' | 'team-collaboration' | 'integrations' | 'settings';

interface AppModuleDefinition {
  id: AppModule;
  label: string;
  kicker: string;
  title: string;
  icon: string;
}

const APP_MODULES: AppModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    kicker: 'overview hub',
    title: '运营总览',
    icon: '◫',
  },
  {
    id: 'project-center',
    label: 'Project Center',
    kicker: 'portfolio control',
    title: '项目中心',
    icon: '◎',
  },
  {
    id: 'task-management',
    label: 'Task Management',
    kicker: 'delivery queue',
    title: '任务管理',
    icon: '▣',
  },
  {
    id: 'gantt',
    label: 'Gantt',
    kicker: 'timeline studio',
    title: '甘特排期',
    icon: '◭',
  },
  {
    id: 'team-collaboration',
    label: 'Team Collaboration',
    kicker: 'alignment space',
    title: '团队协作',
    icon: '◌',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    kicker: 'connected systems',
    title: '集成中心',
    icon: '⬡',
  },
  {
    id: 'settings',
    label: 'Settings',
    kicker: 'workspace config',
    title: '系统设置',
    icon: '✦',
  },
];

const formatTaskDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
};

const App: React.FC = () => {
  const [authView, setAuthView] = useState<AuthViewState>('checking');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<AppModule>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [wechatBindingStatus, setWechatBindingStatus] = useState<WeChatBindingStatus | null>(null);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatForm, setWechatForm] = useState({
    openId: '',
    displayName: '',
    avatarUrl: '',
  });

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
    setAuthError('登录状态已失效，请重新登录。');
    setActiveModule('dashboard');
    setSelectedProject(null);
    setShowAllTasks(false);
    setTasks([]);
    setProjects([]);
    setShowTaskModal(false);
    setEditingTask(null);
    setWechatBindingStatus(null);
    setWechatForm({ openId: '', displayName: '', avatarUrl: '' });
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

  const loadWeChatBindingStatus = useCallback(async () => {
    try {
      setWechatLoading(true);
      const data = await wechatApi.getBindingStatus();
      setWechatBindingStatus(data);
    } catch (error) {
      const message = resolveApiError(error, 'Failed to load WeChat binding');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    } finally {
      setWechatLoading(false);
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
    loadWeChatBindingStatus();
  }, [authView, loadProjects, loadWeChatBindingStatus]);

  useEffect(() => {
    if (authView !== 'authenticated') {
      setTasks([]);
      return;
    }

    refreshTasks();
  }, [authView, refreshTasks]);

  const handleAuthSubmit = useCallback(async (payload: AuthSetupPayload | AuthLoginPayload) => {
    try {
      setAuthLoading(true);
      setAuthError(null);

      if (authView === 'setup') {
	        await authApi.setup(payload as AuthSetupPayload);
      } else {
	        await authApi.login(payload as AuthLoginPayload);
      }

      setAuthView('authenticated');
    } catch (error) {
	      setAuthError(resolveApiError(error, authView === 'setup' ? '创建账号失败。' : '登录失败。'));
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

  const handleStartWeChatBinding = useCallback(async () => {
    try {
      setWechatLoading(true);
      setAuthError(null);
      const data = await wechatApi.startBinding();
      setWechatBindingStatus(data);
      setWechatForm({ openId: '', displayName: '', avatarUrl: '' });
    } catch (error) {
      setAuthError(resolveApiError(error, '无法发起微信绑定。'));
    } finally {
      setWechatLoading(false);
    }
  }, [resolveApiError]);

  const handleConfirmWeChatBinding = useCallback(async () => {
    const pendingAttempt = wechatBindingStatus?.pending_attempt;
    if (!pendingAttempt) {
      return;
    }

    try {
      setWechatLoading(true);
      setAuthError(null);
      await wechatApi.confirmBinding({
        bind_token: pendingAttempt.bind_token,
        verification_code: pendingAttempt.verification_code,
        open_id: wechatForm.openId.trim(),
        display_name: wechatForm.displayName.trim() || undefined,
        avatar_url: wechatForm.avatarUrl.trim() || undefined,
      });
      await loadWeChatBindingStatus();
      setWechatForm({ openId: '', displayName: '', avatarUrl: '' });
    } catch (error) {
      setAuthError(resolveApiError(error, '无法确认微信绑定。'));
    } finally {
      setWechatLoading(false);
    }
  }, [loadWeChatBindingStatus, resolveApiError, wechatBindingStatus?.pending_attempt, wechatForm.avatarUrl, wechatForm.displayName, wechatForm.openId]);

  const handleRemoveWeChatBinding = useCallback(async () => {
    try {
      setWechatLoading(true);
      setAuthError(null);
      const data = await wechatApi.removeBinding();
      setWechatBindingStatus(data);
    } catch (error) {
      setAuthError(resolveApiError(error, '无法解除微信绑定。'));
    } finally {
      setWechatLoading(false);
    }
  }, [resolveApiError]);

  const modalProject =
    selectedProject ||
    projects.find((project) => project.id === editingTask?.project_id) ||
    projects[0] ||
    null;

  const currentContextLabel = showAllTasks ? '全部任务' : selectedProject?.name || '未选择项目';
  const wechatStatusText = wechatBindingStatus?.bound
    ? '已绑定'
    : wechatBindingStatus?.pending_attempt
      ? '绑定中'
      : '未绑定';
  const currentModule = APP_MODULES.find((module) => module.id === activeModule) || APP_MODULES[0];
  const completedTaskCount = tasks.filter((task) => task.progress >= 100).length;
  const inFlightTaskCount = tasks.filter((task) => task.progress > 0 && task.progress < 100).length;
  const idleTaskCount = tasks.filter((task) => task.progress === 0).length;
  const recentProjects = projects.slice(0, 4);
  const visibleTasks = tasks.slice(0, 6);
  const canCreateTask = Boolean(selectedProject && !showAllTasks);
  const selectedProjectTasks = selectedProject
    ? tasks.filter((task) => task.project_id === selectedProject.id)
    : [];
  const ganttReady = Boolean(selectedProject || showAllTasks);

  const renderContextEmpty = (icon: string, title: string, actionLabel?: string, onAction?: () => void) => (
    <div className="module-empty-state">
      <div className="module-empty-icon">{icon}</div>
      <h3>{title}</h3>
      {actionLabel && onAction && (
        <button className="btn btn-primary app-action-button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );

  const renderDashboardModule = () => (
    <div className="module-stack">
      <section className="app-hero-card app-platform-hero">
        <div className="app-platform-hero-copy">
          <span className="app-section-kicker">Program Shell</span>
          <h3 className="app-hero-title">项目管理工作台</h3>
          <div className="app-hero-actions">
            <button className="btn btn-primary app-action-button" onClick={() => setActiveModule('project-center')}>
              打开项目中心
            </button>
            <button className="btn btn-outline-secondary app-action-button" onClick={() => setActiveModule('gantt')}>
              进入甘特模块
            </button>
          </div>
        </div>

        <div className="app-hero-stats app-platform-stats">
          <div className="hero-stat-card">
            <span>当前模块</span>
            <strong>{currentModule.label}</strong>
          </div>
          <div className="hero-stat-card">
            <span>项目总数</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="hero-stat-card">
            <span>当前上下文任务</span>
            <strong>{tasks.length}</strong>
          </div>
          <div className="hero-stat-card">
            <span>已完成</span>
            <strong>{completedTaskCount}</strong>
          </div>
        </div>
      </section>

      <section className="module-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Module Navigation</span>
            <h3 className="module-card-title">工作台入口</h3>
          </div>
        </div>
        <div className="module-launch-grid">
          {APP_MODULES.map((module) => (
            <button
              key={module.id}
              type="button"
              className={`module-launch-card ${activeModule === module.id ? 'active' : ''}`}
              onClick={() => setActiveModule(module.id)}
            >
              <span className="module-launch-icon">{module.icon}</span>
              <span className="module-launch-copy">
                <strong>{module.label}</strong>
                <span>{module.kicker}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="module-two-column-grid">
        <section className="module-card">
          <div className="module-card-header">
            <div>
              <span className="app-section-kicker">Portfolio Snapshot</span>
              <h3 className="module-card-title">项目聚焦</h3>
            </div>
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => setActiveModule('project-center')}>
              进入项目中心
            </button>
          </div>
          <div className="project-summary-list">
            {recentProjects.length > 0 ? recentProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`project-summary-item ${selectedProject?.id === project.id ? 'active' : ''}`}
                onClick={() => {
                  handleSelectProject(project);
                  setActiveModule('project-center');
                }}
              >
                <span className="project-summary-swatch" style={{ backgroundColor: project.color }} />
                <span className="project-summary-copy">
                  <strong>{project.name}</strong>
                  <span>{project.description || '-'}</span>
                </span>
              </button>
            )) : (
              <div className="project-summary-empty">暂无项目</div>
            )}
          </div>
        </section>

        <section className="module-card">
          <div className="module-card-header">
            <div>
              <span className="app-section-kicker">Task Feed</span>
              <h3 className="module-card-title">任务脉冲</h3>
            </div>
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => setActiveModule('task-management')}>
              打开任务管理
            </button>
          </div>
          {visibleTasks.length > 0 ? (
            <div className="task-overview-list">
              {visibleTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="task-overview-item"
                  onClick={() => handleTaskClick(task)}
                >
                  <span className="task-overview-bar" style={{ backgroundColor: task.color }} />
                  <span className="task-overview-copy">
                    <strong>{task.name}</strong>
                    <span>
                      {showAllTasks && task.project_name ? `${task.project_name} · ` : ''}
                      {formatTaskDate(task.start_date)} - {formatTaskDate(task.end_date)} · {task.progress}%
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="project-summary-empty">暂无任务</div>
          )}
        </section>
      </div>
    </div>
  );

  const renderProjectCenterModule = () => (
    <div className="project-center-layout">
      <section className="app-content-card project-center-sidebar-card">
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
      </section>

      <div className="module-stack project-center-detail-stack">
        <section className="module-card project-detail-hero">
          <div className="module-card-header">
            <div>
              <span className="app-section-kicker">Project Focus</span>
              <h3 className="module-card-title">{showAllTasks ? '全部任务视图' : selectedProject?.name || '请选择一个项目'}</h3>
            </div>
            <div className="module-header-actions">
              <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={handleRefresh}>
                刷新数据
              </button>
              {canCreateTask && (
                <button className="btn btn-primary btn-sm app-action-button" onClick={handleCreateTask}>
                  + 新建任务
                </button>
              )}
            </div>
          </div>

          {showAllTasks ? (
            <div className="project-detail-copy">
              <div className="project-detail-metrics">
                <div>
                  <span>可见任务</span>
                  <strong>{tasks.length}</strong>
                </div>
                <div>
                  <span>进行中</span>
                  <strong>{inFlightTaskCount}</strong>
                </div>
                <div>
                  <span>待启动</span>
                  <strong>{idleTaskCount}</strong>
                </div>
              </div>
            </div>
          ) : selectedProject ? (
            <div className="project-detail-copy">
              <div className="project-detail-label-row">
                <span className="project-detail-swatch" style={{ backgroundColor: selectedProject.color }} />
                <span className="project-detail-label">已选项目</span>
              </div>
              <div className="project-detail-metrics">
                <div>
                  <span>项目任务</span>
                  <strong>{selectedProjectTasks.length}</strong>
                </div>
                <div>
                  <span>完成率</span>
                  <strong>
                    {selectedProjectTasks.length > 0
                      ? `${Math.round(selectedProjectTasks.reduce((sum, task) => sum + task.progress, 0) / selectedProjectTasks.length)}%`
                      : '0%'}
                  </strong>
                </div>
                <div>
                  <span>时间线</span>
                  <strong>甘特</strong>
                </div>
              </div>
            </div>
          ) : (
            renderContextEmpty('◎', '请选择一个项目')
          )}
        </section>

        <section className="module-card">
          <div className="module-card-header">
            <div>
              <span className="app-section-kicker">Project Actions</span>
              <h3 className="module-card-title">模块联动</h3>
            </div>
          </div>
          <div className="module-link-grid">
            <button type="button" className="module-link-card" onClick={() => setActiveModule('task-management')}>
              <strong>切到任务管理</strong>
            </button>
            <button type="button" className="module-link-card" onClick={() => setActiveModule('gantt')}>
              <strong>切到甘特模块</strong>
            </button>
            <button type="button" className="module-link-card" onClick={() => setActiveModule('dashboard')}>
              <strong>返回总览</strong>
            </button>
          </div>
        </section>
      </div>
    </div>
  );

  const renderTaskManagementModule = () => (
    <div className="module-stack">
      <section className="module-card task-management-hero">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Execution Queue</span>
            <h3 className="module-card-title">任务执行面板</h3>
          </div>
          <div className="module-header-actions">
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={handleSelectAllTasks}>
              切换为全部任务
            </button>
            {canCreateTask && (
              <button className="btn btn-primary btn-sm app-action-button" onClick={handleCreateTask}>
                + 新建任务
              </button>
            )}
          </div>
        </div>
        <div className="task-management-summary">
          <div>
            <span>当前上下文</span>
            <strong>{currentContextLabel}</strong>
          </div>
          <div>
            <span>已完成</span>
            <strong>{completedTaskCount}</strong>
          </div>
          <div>
            <span>进行中</span>
            <strong>{inFlightTaskCount}</strong>
          </div>
          <div>
            <span>待启动</span>
            <strong>{idleTaskCount}</strong>
          </div>
        </div>
      </section>

      <section className="module-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Task Collection</span>
            <h3 className="module-card-title">当前任务列表</h3>
          </div>
        </div>

        {!ganttReady ? (
          renderContextEmpty('▣', '请选择任务上下文', '前往项目中心', () => setActiveModule('project-center'))
        ) : tasksLoading ? (
          <div className="empty-state">
            <div className="spinner-border text-primary" role="status" />
            <p className="mt-3 mb-0">正在加载任务...</p>
          </div>
        ) : tasks.length > 0 ? (
          <div className="task-board-list">
            {tasks.map((task) => (
              <article key={task.id} className="task-board-item">
                <div className="task-board-accent" style={{ backgroundColor: task.color }} />
                <div className="task-board-main">
                  <div className="task-board-header">
                    <div>
                      <h4>{task.name}</h4>
                      <p>{task.description || '-'}</p>
                    </div>
                    <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => handleTaskClick(task)}>
                      编辑
                    </button>
                  </div>
                  <div className="task-board-meta">
                    <span>{showAllTasks && task.project_name ? `项目：${task.project_name}` : `项目：${selectedProject?.name || '当前项目'}`}</span>
                    <span>日期：{task.start_date} - {task.end_date}</span>
                    <span>进度：{task.progress}%</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          renderContextEmpty('▣', '当前没有任务', canCreateTask ? '+ 新建任务' : undefined, canCreateTask ? handleCreateTask : undefined)
        )}
      </section>
    </div>
  );

  const renderGanttModule = () => (
    <div className="module-stack">
      <section className="module-card gantt-module-hero">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Timeline Studio</span>
            <h3 className="module-card-title">独立甘特模块</h3>
          </div>
          <div className="module-header-actions">
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => setActiveModule('task-management')}>
              任务管理
            </button>
            {canCreateTask && (
              <button className="btn btn-primary btn-sm app-action-button" onClick={handleCreateTask}>
                + 新建任务
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="app-content-card gantt-module-card">
        {ganttReady ? (
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
            renderContextEmpty('◭', '时间线中还没有任务', canCreateTask ? '+ 新建任务' : undefined, canCreateTask ? handleCreateTask : undefined)
          )
        ) : (
          renderContextEmpty('◭', '请选择一个项目', '打开项目中心', () => setActiveModule('project-center'))
        )}
      </section>
    </div>
  );

  const renderTeamModule = () => (
    <div className="module-stack">
      <section className="module-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Collaboration Layer</span>
            <h3 className="module-card-title">团队协作舱</h3>
          </div>
        </div>
        <div className="placeholder-grid">
          <article className="placeholder-card">
            <span className="placeholder-label">Daily Sync</span>
            <strong>{selectedProject?.name || '全局项目组合'}</strong>
          </article>
          <article className="placeholder-card">
            <span className="placeholder-label">Review Queue</span>
            <strong>{inFlightTaskCount} 个进行中项</strong>
          </article>
          <article className="placeholder-card">
            <span className="placeholder-label">Stakeholder Notes</span>
            <strong>微信接入已{wechatStatusText}</strong>
          </article>
        </div>
      </section>

      <section className="module-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Coordination Checklist</span>
            <h3 className="module-card-title">当前协作建议</h3>
          </div>
        </div>
        <div className="collaboration-list">
          <div className="collaboration-item">
            <strong>项目上下文</strong>
            <span>{currentContextLabel}</span>
          </div>
          <div className="collaboration-item">
            <strong>任务状态</strong>
            <span>{completedTaskCount} 已完成 / {inFlightTaskCount} 推进中 / {idleTaskCount} 待启动</span>
          </div>
          <div className="collaboration-item">
            <strong>建议动作</strong>
            <span>甘特 / 任务 / 集成</span>
          </div>
        </div>
      </section>
    </div>
  );

  const renderIntegrationsModule = () => (
    <div className="module-stack">
      <section className="module-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Connected Systems</span>
            <h3 className="module-card-title">集成总览</h3>
          </div>
        </div>
        <div className="placeholder-grid integrations-grid">
          <article className="placeholder-card">
            <span className="placeholder-label">Messaging</span>
            <strong>微信绑定</strong>
          </article>
          <article className="placeholder-card">
            <span className="placeholder-label">Automation</span>
            <strong>通知自动化</strong>
          </article>
          <article className="placeholder-card">
            <span className="placeholder-label">Data Sync</span>
            <strong>外部系统</strong>
          </article>
        </div>
      </section>

      <WeChatBindingCard
        accountLabel="当前浏览器会话"
        statusText={wechatStatusText}
        binding={wechatBindingStatus?.binding}
        pendingAttempt={wechatBindingStatus?.pending_attempt}
        message={wechatBindingStatus?.message}
        loading={wechatLoading}
        bindOpenId={wechatForm.openId}
        bindDisplayName={wechatForm.displayName}
        bindAvatarUrl={wechatForm.avatarUrl}
        onBindOpenIdChange={(value) => setWechatForm((current) => ({ ...current, openId: value }))}
        onBindDisplayNameChange={(value) => setWechatForm((current) => ({ ...current, displayName: value }))}
        onBindAvatarUrlChange={(value) => setWechatForm((current) => ({ ...current, avatarUrl: value }))}
        onStartBinding={handleStartWeChatBinding}
        onConfirmBinding={handleConfirmWeChatBinding}
        onRemoveBinding={handleRemoveWeChatBinding}
      />
    </div>
  );

  const renderSettingsModule = () => (
    <div className="module-stack">
      <section className="module-card settings-grid-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Workspace Settings</span>
            <h3 className="module-card-title">系统设置面板</h3>
          </div>
        </div>
        <div className="settings-grid">
          <article className="settings-card">
            <span className="placeholder-label">Session</span>
            <strong>访问控制已启用</strong>
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={handleLogout}>
              退出登录
            </button>
          </article>
          <article className="settings-card">
            <span className="placeholder-label">Workspace</span>
            <strong>项目数 {projects.length}</strong>
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => setActiveModule('project-center')}>
              打开项目中心
            </button>
          </article>
          <article className="settings-card">
            <span className="placeholder-label">Integration Status</span>
            <strong>微信状态 {wechatStatusText}</strong>
            <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => setActiveModule('integrations')}>
              查看集成中心
            </button>
          </article>
        </div>
      </section>
    </div>
  );

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return renderDashboardModule();
      case 'project-center':
        return renderProjectCenterModule();
      case 'task-management':
        return renderTaskManagementModule();
      case 'gantt':
        return renderGanttModule();
      case 'team-collaboration':
        return renderTeamModule();
      case 'integrations':
        return renderIntegrationsModule();
      case 'settings':
        return renderSettingsModule();
      default:
        return renderDashboardModule();
    }
  };

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
    <div className="app-shell">
      <aside className="app-sidebar-shell">
        <div className="app-sidebar-top">
          <div className="app-brand-mark">◈</div>
          <div>
            <span className="app-brand-kicker">project operations platform</span>
            <h1 className="app-title">项目管理控制台</h1>
          </div>
        </div>

        <div className="sidebar-summary-card app-sidebar-summary-card">
          <span className="sidebar-summary-label">当前模块</span>
          <strong className="sidebar-summary-value">{currentModule.label}</strong>
          <div className="sidebar-summary-metrics">
            <div>
              <span>项目</span>
              <strong>{projects.length}</strong>
            </div>
            <div>
              <span>任务</span>
              <strong>{tasks.length}</strong>
            </div>
          </div>
        </div>

        <nav className="app-sidebar-panel app-nav-panel">
          <div className="app-nav-header">
            <span className="sidebar-kicker">Workspace Modules</span>
            <strong>导航</strong>
          </div>
          <div className="app-nav-list">
            {APP_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                className={`app-nav-item ${activeModule === module.id ? 'active' : ''}`}
                onClick={() => setActiveModule(module.id)}
              >
                <span className="app-nav-icon">{module.icon}</span>
                <span className="app-nav-copy">
                  <strong>{module.label}</strong>
                  <span>{module.kicker}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-summary-card app-sidebar-context-card">
          <span className="sidebar-summary-label">工作上下文</span>
          <strong className="sidebar-summary-value">{currentContextLabel}</strong>
          <div className="app-sidebar-context-actions">
            <button className="btn btn-light btn-sm app-sidebar-context-button" onClick={handleSelectAllTasks}>
              全部任务
            </button>
            <button className="btn btn-light btn-sm app-sidebar-context-button" onClick={() => setActiveModule('project-center')}>
              选项目
            </button>
          </div>
          {selectedProject && !showAllTasks && (
            <div className="app-sidebar-selected-project">
              <span className="app-sidebar-selected-swatch" style={{ backgroundColor: selectedProject.color }} />
              <div>
                <strong>{selectedProject.name}</strong>
                <span>{selectedProject.description || '-'}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="app-main-shell">
        <header className="app-topbar">
          <div className="app-topbar-copy app-topbar-copy-extended">
            <span className="app-topbar-kicker">{currentModule.kicker}</span>
            <h2 className="app-topbar-title">{currentModule.title}</h2>
          </div>
          <div className="app-topbar-actions-shell">
            <div className="header-actions app-topbar-statuses">
              <span className="context-pill">{currentContextLabel}</span>
              <span className="binding-status-pill">微信 {wechatStatusText}</span>
            </div>
            <div className="header-actions app-topbar-actions-row">
              <button className="btn btn-outline-secondary app-action-button" onClick={handleRefresh}>
                刷新
              </button>
              {canCreateTask && (
                <button className="btn btn-success app-action-button" onClick={handleCreateTask}>
                  + 新建任务
                </button>
              )}
              <button className="btn btn-outline-secondary app-action-button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          </div>
        </header>

        <main className="app-main">
          {authError && (
            <div className="alert alert-warning app-inline-alert" role="alert">
              {authError}
            </div>
          )}
          {renderActiveModule()}
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
