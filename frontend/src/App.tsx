import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthLoginPayload, AuthSetupPayload, CreateProjectDto, Project, ProjectAttachment, Task, UpdateProjectDto, WeChatBindingStatus } from './types';
import { ApiError, authApi, projectAttachmentsApi, tasksApi, projectsApi, wechatApi } from './api';
import ProjectList from './components/ProjectList';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import AuthScreen from './components/AuthScreen';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

type TaskViewMode = 'project' | 'all' | 'idle';
type AuthViewState = 'checking' | 'setup' | 'login' | 'authenticated';
type AppModule = 'project-center' | 'task-management' | 'gantt';
type TaskQuickFilter = 'overdue' | 'this-week' | 'unassigned' | 'mine' | 'with-files';
type TaskSortMode = 'risk' | 'due' | 'updated' | 'progress';

interface AppModuleDefinition {
  id: AppModule;
  label: string;
  kicker: string;
  title: string;
  icon: string;
}

const APP_MODULES: AppModuleDefinition[] = [
  {
    id: 'project-center',
    label: '项目',
    kicker: 'project center',
    title: '项目中心',
    icon: '◎',
  },
  {
    id: 'task-management',
    label: '任务',
    kicker: 'task queue',
    title: '任务管理',
    icon: '▣',
  },
  {
    id: 'gantt',
    label: '甘特图',
    kicker: 'timeline',
    title: '甘特排期',
    icon: '◭',
  },
];

const STORAGE_KEYS = {
  activeModule: 'gantt.activeModule',
  selectedProjectId: 'gantt.selectedProjectId',
  showAllTasks: 'gantt.showAllTasks',
  activeTaskFilters: 'gantt.activeTaskFilters',
  taskSortMode: 'gantt.taskSortMode',
} as const;

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
  const [currentUsername, setCurrentUsername] = useState('');
  const [activeModule, setActiveModule] = useState<AppModule>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEYS.activeModule) as AppModule | null;
    return stored || 'project-center';
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(() => window.localStorage.getItem(STORAGE_KEYS.showAllTasks) === 'true');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [wechatBindingStatus, setWechatBindingStatus] = useState<WeChatBindingStatus | null>(null);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [projectAttachments, setProjectAttachments] = useState<ProjectAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTaskFilters, setActiveTaskFilters] = useState<TaskQuickFilter[]>(() => {
    const raw = window.localStorage.getItem(STORAGE_KEYS.activeTaskFilters);
    return raw ? JSON.parse(raw) : [];
  });
  const [taskSortMode, setTaskSortMode] = useState<TaskSortMode>(() => {
    return (window.localStorage.getItem(STORAGE_KEYS.taskSortMode) as TaskSortMode | null) || 'risk';
  });
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
    setActiveModule('project-center');
    setSelectedProject(null);
    setShowAllTasks(false);
    setTasks([]);
    setProjects([]);
    setShowTaskModal(false);
    setEditingTask(null);
    setCurrentUsername('');
    setActiveTaskFilters([]);
    setTaskSortMode('risk');
    setProjectAttachments([]);
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

      setCurrentUsername(status.user?.username || '');
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

  const loadProjectAttachments = useCallback(async (projectId: string) => {
    try {
      setAttachmentsLoading(true);
      const data = await projectAttachmentsApi.list(projectId);
      setProjectAttachments(data);
    } catch (error) {
      const message = resolveApiError(error, 'Failed to load attachments');
      if (!(error instanceof ApiError && error.status === 401)) {
        setAuthError(message);
      }
    } finally {
      setAttachmentsLoading(false);
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
    window.localStorage.setItem(STORAGE_KEYS.activeModule, activeModule);
  }, [activeModule]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.showAllTasks, String(showAllTasks));
  }, [showAllTasks]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.activeTaskFilters, JSON.stringify(activeTaskFilters));
  }, [activeTaskFilters]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.taskSortMode, taskSortMode);
  }, [taskSortMode]);

  useEffect(() => {
    if (selectedProject?.id) {
      window.localStorage.setItem(STORAGE_KEYS.selectedProjectId, selectedProject.id);
      return;
    }
    window.localStorage.removeItem(STORAGE_KEYS.selectedProjectId);
  }, [selectedProject]);

  useEffect(() => {
    if (!projects.length || selectedProject || showAllTasks) {
      return;
    }
    const storedProjectId = window.localStorage.getItem(STORAGE_KEYS.selectedProjectId);
    if (!storedProjectId) {
      return;
    }
    const matchedProject = projects.find((project) => project.id === storedProjectId);
    if (matchedProject) {
      setSelectedProject(matchedProject);
    }
  }, [projects, selectedProject, showAllTasks]);

  useEffect(() => {
    if (showAllTasks) {
      window.localStorage.removeItem(STORAGE_KEYS.selectedProjectId);
    }
  }, [showAllTasks]);

  useEffect(() => {
    if (authView !== 'authenticated') {
      setTasks([]);
      setProjectAttachments([]);
      return;
    }

    refreshTasks();
  }, [authView, refreshTasks]);

  useEffect(() => {
    if (authView !== 'authenticated' || !selectedProject || showAllTasks) {
      setProjectAttachments([]);
      return;
    }

    loadProjectAttachments(selectedProject.id);
  }, [authView, loadProjectAttachments, selectedProject, showAllTasks]);

  const handleAuthSubmit = useCallback(async (payload: AuthSetupPayload | AuthLoginPayload) => {
    try {
      setAuthLoading(true);
      setAuthError(null);

      if (authView === 'setup') {
	        const result = await authApi.setup(payload as AuthSetupPayload);
	        setCurrentUsername(result.user?.username || (payload as AuthSetupPayload).username || '');
      } else {
	        const result = await authApi.login(payload as AuthLoginPayload);
	        setCurrentUsername(result.user?.username || (payload as AuthLoginPayload).username || '');
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

  const handleProjectFilesChange = useCallback(async (files: FileList | null) => {
    if (!selectedProject || !files || files.length === 0) {
      return;
    }

    try {
      setAttachmentUploading(true);
      setAuthError(null);
      await projectAttachmentsApi.upload(selectedProject.id, Array.from(files));
      await loadProjectAttachments(selectedProject.id);
    } catch (error) {
      setAuthError(resolveApiError(error, '文件上传失败。'));
    } finally {
      setAttachmentUploading(false);
    }
  }, [loadProjectAttachments, resolveApiError, selectedProject]);

  const handleDeleteAttachment = useCallback(async (attachmentId: string) => {
    if (!selectedProject) {
      return;
    }
    try {
      await projectAttachmentsApi.remove(selectedProject.id, attachmentId);
      await loadProjectAttachments(selectedProject.id);
    } catch (error) {
      setAuthError(resolveApiError(error, '删除文件失败。'));
    }
  }, [loadProjectAttachments, resolveApiError, selectedProject]);

  const handleLogoutWithConfirm = useCallback(() => {
    const confirmed = window.confirm('确认退出登录吗？');
    if (!confirmed) {
      return;
    }
    handleLogout();
  }, [handleLogout]);

  const handleAssignAttachmentTask = useCallback(async (attachmentId: string, taskId: string) => {
    if (!selectedProject) {
      return;
    }
    try {
      await projectAttachmentsApi.assignTask(selectedProject.id, attachmentId, taskId || undefined);
      await loadProjectAttachments(selectedProject.id);
    } catch (error) {
      setAuthError(resolveApiError(error, '更新文件关联失败。'));
    }
  }, [loadProjectAttachments, resolveApiError, selectedProject]);

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
  const attachmentCountByTask = useMemo(() => {
    const map = new Map<string, number>();
    projectAttachments.forEach((attachment) => {
      if (!attachment.task_id) {
        return;
      }
      map.set(attachment.task_id, (map.get(attachment.task_id) || 0) + 1);
    });
    return map;
  }, [projectAttachments]);
  const isTaskFilteredIn = useCallback((task: Task) => {
    if (activeTaskFilters.length === 0) {
      return true;
    }

    const today = new Date();
    const endDate = new Date(task.end_date);
    const startOfThisWeek = new Date(today);
    const day = startOfThisWeek.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    startOfThisWeek.setDate(startOfThisWeek.getDate() + mondayOffset);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const endOfThisWeek = new Date(startOfThisWeek);
    endOfThisWeek.setDate(endOfThisWeek.getDate() + 6);
    endOfThisWeek.setHours(23, 59, 59, 999);

    return activeTaskFilters.every((filter) => {
      switch (filter) {
        case 'overdue':
          return task.progress < 100 && endDate.getTime() < today.getTime();
        case 'this-week':
          return endDate >= startOfThisWeek && endDate <= endOfThisWeek;
        case 'unassigned':
          return !task.owner?.trim();
        case 'mine':
          return Boolean(currentUsername) && task.owner?.trim().toLowerCase() === currentUsername.toLowerCase();
        case 'with-files':
          return (attachmentCountByTask.get(task.id) || 0) > 0;
        default:
          return true;
      }
    });
  }, [activeTaskFilters, attachmentCountByTask, currentUsername]);
  const selectedProjectTasks = selectedProject
    ? tasks.filter((task) => task.project_id === selectedProject.id)
    : [];
  const filteredTasks = useMemo(() => tasks.filter(isTaskFilteredIn), [isTaskFilteredIn, tasks]);
  const filteredSelectedProjectTasks = useMemo(() => selectedProjectTasks.filter(isTaskFilteredIn), [isTaskFilteredIn, selectedProjectTasks]);
  const sortTasks = useCallback((items: Task[]) => {
    const sorted = [...items];
    sorted.sort((left, right) => {
      switch (taskSortMode) {
        case 'due':
          return new Date(left.end_date).getTime() - new Date(right.end_date).getTime();
        case 'updated':
          return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        case 'progress':
          return right.progress - left.progress;
        case 'risk':
        default: {
          const leftRisk = (left.progress < 100 && new Date(left.end_date).getTime() < Date.now()) ? 1 : 0;
          const rightRisk = (right.progress < 100 && new Date(right.end_date).getTime() < Date.now()) ? 1 : 0;
          if (leftRisk !== rightRisk) {
            return rightRisk - leftRisk;
          }
          return new Date(left.end_date).getTime() - new Date(right.end_date).getTime();
        }
      }
    });
    return sorted;
  }, [taskSortMode]);
  const sortedProjectTasks = [...filteredSelectedProjectTasks].sort((left, right) => {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
  const recentProjectTasks = sortedProjectTasks.slice(0, 5);
  const upcomingProjectTasks = [...filteredSelectedProjectTasks]
    .filter((task) => task.progress < 100)
    .sort((left, right) => new Date(left.end_date).getTime() - new Date(right.end_date).getTime())
    .slice(0, 4);
  const riskProjectTasks = filteredSelectedProjectTasks
    .filter((task) => task.progress < 100 && new Date(task.end_date).getTime() < Date.now())
    .slice(0, 4);
  const toggleTaskFilter = useCallback((filter: TaskQuickFilter) => {
    setActiveTaskFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  }, []);
  const ganttReady = Boolean(selectedProject || showAllTasks);
  const orderedFilteredTasks = useMemo(() => sortTasks(filteredTasks), [filteredTasks, sortTasks]);
  const actionableAlerts = useMemo(() => {
    const today = new Date();
    const overdueTasks = filteredTasks.filter((task) => task.progress < 100 && new Date(task.end_date).getTime() < today.getTime());
    const soonDueTasks = filteredTasks.filter((task) => {
      const dueDate = new Date(task.end_date);
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return task.progress < 60 && diffDays >= 0 && diffDays <= 3;
    });
    const unassignedTasks = filteredTasks.filter((task) => !task.owner?.trim());

    return { overdueTasks, soonDueTasks, unassignedTasks };
  }, [filteredTasks]);
  const recentProjectIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedProject?.id) {
      ids.push(selectedProject.id);
    }
    recentProjects.forEach((project) => {
      if (!ids.includes(project.id)) {
        ids.push(project.id);
      }
    });
    return ids.slice(0, 5);
  }, [recentProjects, selectedProject]);
  const projectTaskStats = useMemo(() => {
    const stats = new Map<string, { taskCount: number; riskCount: number }>();
    projects.forEach((project) => {
      const projectTasks = tasks.filter((task) => task.project_id === project.id);
      stats.set(project.id, {
        taskCount: projectTasks.length,
        riskCount: projectTasks.filter((task) => task.progress < 100 && new Date(task.end_date).getTime() < Date.now()).length,
      });
    });
    return stats;
  }, [projects, tasks]);

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
      <section className="app-hero-card app-platform-hero app-dashboard-secondary-shell">
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

      <section className="module-card app-dashboard-secondary-shell">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Module Navigation</span>
            <h3 className="module-card-title">工作台入口</h3>
          </div>
        </div>
        <div className="module-launch-grid app-dashboard-secondary-shell">
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

      <div className="module-two-column-grid app-dashboard-secondary-shell">
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
            {filteredTasks.slice(0, 6).length > 0 ? (
              <div className="task-overview-list">
              {filteredTasks.slice(0, 6).map((task) => (
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
          recentProjectIds={recentProjectIds}
          projectTaskStats={projectTaskStats}
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
              <div className="project-focus-topline">
                <div className="project-detail-label-row">
                  <span className="project-detail-swatch" style={{ backgroundColor: selectedProject.color }} />
                  <span className="project-detail-label">已选项目</span>
                </div>
                <div className="project-focus-description">
                  {selectedProject.owner ? `负责人：${selectedProject.owner}` : '负责人：-'}
                  {selectedProject.start_date ? ` · 开始：${selectedProject.start_date}` : ''}
                </div>
              </div>

              <div className="project-detail-metrics project-detail-metrics-extended">
                <div>
                  <span>项目任务</span>
                  <strong>{filteredSelectedProjectTasks.length}</strong>
                </div>
                <div>
                  <span>完成率</span>
                  <strong>
                    {filteredSelectedProjectTasks.length > 0
                      ? `${Math.round(filteredSelectedProjectTasks.reduce((sum, task) => sum + task.progress, 0) / filteredSelectedProjectTasks.length)}%`
                      : '0%'}
                  </strong>
                </div>
                <div>
                  <span>风险任务</span>
                  <strong>{riskProjectTasks.length}</strong>
                </div>
                <div>
                  <span>最近文件</span>
                  <strong>{projectAttachments.length}</strong>
                </div>
              </div>

              <div className="project-focus-grid">
                <article className="project-detail-panel project-detail-panel-primary">
                  <div className="project-detail-panel-header">
                    <strong>最近任务动态</strong>
                    <span>{recentProjectTasks.length} 条</span>
                  </div>
                  {recentProjectTasks.length > 0 ? (
                    <div className="dense-task-list">
                      {recentProjectTasks.map((task) => (
                        <button key={task.id} type="button" className="dense-task-item" onClick={() => handleTaskClick(task)}>
                          <span className="dense-task-dot" style={{ backgroundColor: task.color }} />
                          <span className="dense-task-copy">
                            <strong>{task.name}</strong>
                            <span>
                              {task.owner ? `${task.owner} · ` : ''}
                              {task.start_date} - {task.end_date} · {task.progress}%
                            </span>
                            <span className="dense-task-meta-row">
                              <em>附件 {attachmentCountByTask.get(task.id) || 0}</em>
                              <em>{task.progress >= 100 ? '已完成' : task.progress > 0 ? '进行中' : '待启动'}</em>
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="project-summary-empty">暂无任务</div>
                  )}
                </article>

                <div className="project-focus-side-stack">
                  <article className="project-detail-panel">
                    <div className="project-detail-panel-header">
                      <strong>最近排期</strong>
                      <span>{upcomingProjectTasks.length} 项</span>
                    </div>
                    {upcomingProjectTasks.length > 0 ? (
                      <div className="dense-task-list compact">
                        {upcomingProjectTasks.map((task) => (
                          <button key={task.id} type="button" className="dense-task-item compact" onClick={() => handleTaskClick(task)}>
                            <span className="dense-task-copy">
                              <strong>{task.name}</strong>
                              <span>{task.owner ? `${task.owner} · ` : ''}截止 {task.end_date}</span>
                              <span className="dense-task-meta-row">
                                <em>附件 {attachmentCountByTask.get(task.id) || 0}</em>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="project-summary-empty">暂无排期</div>
                    )}
                  </article>

                  <article className="project-detail-panel risk-panel">
                    <div className="project-detail-panel-header">
                      <strong>风险任务</strong>
                      <span>{riskProjectTasks.length} 项</span>
                    </div>
                    {riskProjectTasks.length > 0 ? (
                      <div className="dense-task-list compact">
                        {riskProjectTasks.map((task) => (
                          <button key={task.id} type="button" className="dense-task-item compact risk" onClick={() => handleTaskClick(task)}>
                            <span className="dense-task-copy">
                              <strong>{task.name}</strong>
                              <span>{task.owner ? `${task.owner} · ` : ''}已超过 {task.end_date}</span>
                              <span className="dense-task-meta-row">
                                <em>进度 {task.progress}%</em>
                                <em>附件 {attachmentCountByTask.get(task.id) || 0}</em>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="project-summary-empty">暂无风险任务</div>
                    )}
                  </article>
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
              <span className="app-section-kicker">Project Files</span>
              <h3 className="module-card-title">项目文件</h3>
            </div>
            {selectedProject && (
              <>
                <input
                  ref={projectFileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => handleProjectFilesChange(event.target.files)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm app-action-button mb-0"
                  onClick={() => projectFileInputRef.current?.click()}
                >
                  {attachmentUploading ? '上传中...' : '+ 上传文件'}
                </button>
              </>
            )}
          </div>
          {selectedProject ? (
            attachmentsLoading ? (
              <div className="empty-state">
                <div className="spinner-border text-primary" role="status" />
                <p className="mt-3 mb-0">正在加载文件...</p>
              </div>
            ) : projectAttachments.length > 0 ? (
              <div className="attachment-list">
                {projectAttachments.map((attachment) => (
                  <article key={attachment.id} className="attachment-item">
                    <div className="attachment-main">
                      <strong>{attachment.original_name}</strong>
                      <span>
                        {attachment.task_name ? `任务：${attachment.task_name} · ` : ''}
                        {attachment.mime_type} · {Math.max(1, Math.round(attachment.size_bytes / 1024))} KB
                      </span>
                    </div>
                    <div className="attachment-actions">
                      <select
                        className="form-select form-select-sm app-attachment-task-select"
                        value={attachment.task_id || ''}
                        onChange={(event) => handleAssignAttachmentTask(attachment.id, event.target.value)}
                      >
                        <option value="">不关联任务</option>
                        {selectedProjectTasks.map((task) => (
                          <option key={task.id} value={task.id}>{task.name}</option>
                        ))}
                      </select>
                      <a
                        className="btn btn-outline-secondary btn-sm app-action-button"
                        href={projectAttachmentsApi.downloadUrl(selectedProject.id, attachment.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        下载
                      </a>
                      <button type="button" className="btn btn-outline-danger btn-sm app-action-button" onClick={() => handleDeleteAttachment(attachment.id)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="project-summary-empty">暂无文件</div>
            )
          ) : (
            renderContextEmpty('📎', '请选择一个项目')
          )}
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
              <strong>{filteredTasks.filter((task) => task.progress >= 100).length}</strong>
            </div>
            <div>
              <span>进行中</span>
              <strong>{filteredTasks.filter((task) => task.progress > 0 && task.progress < 100).length}</strong>
            </div>
            <div>
              <span>待启动</span>
              <strong>{filteredTasks.filter((task) => task.progress === 0).length}</strong>
            </div>
          </div>
          <div className="task-filter-bar">
            {[
              ['overdue', '逾期'],
              ['this-week', '本周'],
              ['unassigned', '无负责人'],
              ['mine', '我负责'],
              ['with-files', '有附件'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`task-filter-chip ${activeTaskFilters.includes(key as TaskQuickFilter) ? 'active' : ''}`}
                onClick={() => toggleTaskFilter(key as TaskQuickFilter)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="task-sort-bar">
            {[
              ['risk', '风险优先'],
              ['due', '按截止'],
              ['updated', '按更新'],
              ['progress', '按进度'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`task-sort-chip ${taskSortMode === key ? 'active' : ''}`}
                onClick={() => setTaskSortMode(key as TaskSortMode)}
              >
                {label}
              </button>
            ))}
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
        ) : orderedFilteredTasks.length > 0 ? (
          <div className="task-board-list">
            {orderedFilteredTasks.map((task) => (
              <article key={task.id} className="task-board-item">
                <div className="task-board-accent" style={{ backgroundColor: task.color }} />
                <div className="task-board-main">
                  <div className="task-board-header">
                    <div>
                      <h4>{task.name}</h4>
                      <div className="task-markdown-preview">
                        {task.description ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {task.description}
                          </ReactMarkdown>
                        ) : (
                          <p>-</p>
                        )}
                      </div>
                    </div>
                    <button className="btn btn-outline-secondary btn-sm app-action-button" onClick={() => handleTaskClick(task)}>
                      编辑
                    </button>
                  </div>
                  <div className="task-board-meta">
                    <span>负责人：{task.owner || '-'}</span>
                    <span>{showAllTasks && task.project_name ? `项目：${task.project_name}` : `项目：${selectedProject?.name || '当前项目'}`}</span>
                    <span>日期：{task.start_date} - {task.end_date}</span>
                    <span>进度：{task.progress}%</span>
                    <span>附件：{attachmentCountByTask.get(task.id) || 0}</span>
                    <span>{task.progress < 100 && new Date(task.end_date).getTime() < Date.now() ? '风险：逾期' : '风险：正常'}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          renderContextEmpty('▣', activeTaskFilters.length > 0 ? '当前筛选下没有任务' : '当前没有任务', canCreateTask ? '+ 新建任务' : undefined, canCreateTask ? handleCreateTask : undefined)
        )}
      </section>

      <section className="module-card alert-panel-card">
        <div className="module-card-header">
          <div>
            <span className="app-section-kicker">Action Alerts</span>
            <h3 className="module-card-title">当前提醒</h3>
          </div>
        </div>
        <div className="alert-grid">
          <article className="alert-card danger">
            <span className="alert-card-label">逾期</span>
            <strong>{actionableAlerts.overdueTasks.length}</strong>
            <p>{actionableAlerts.overdueTasks[0]?.name || '暂无'}</p>
          </article>
          <article className="alert-card warning">
            <span className="alert-card-label">临期低进度</span>
            <strong>{actionableAlerts.soonDueTasks.length}</strong>
            <p>{actionableAlerts.soonDueTasks[0]?.name || '暂无'}</p>
          </article>
          <article className="alert-card neutral">
            <span className="alert-card-label">无负责人</span>
            <strong>{actionableAlerts.unassignedTasks.length}</strong>
            <p>{actionableAlerts.unassignedTasks[0]?.name || '暂无'}</p>
          </article>
        </div>
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
              tasks={filteredTasks}
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

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'project-center':
        return renderProjectCenterModule();
      case 'task-management':
        return renderTaskManagementModule();
      case 'gantt':
        return renderGanttModule();
      default:
        return renderProjectCenterModule();
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
            <span className="app-brand-kicker">workspace</span>
            <h1 className="app-title">项目管理</h1>
          </div>
        </div>

        <div className="sidebar-summary-card app-sidebar-summary-card compact-sidebar-summary">
          <div className="sidebar-summary-metrics compact">
            <div>
              <span>模块</span>
              <strong>{currentModule.label}</strong>
            </div>
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

        <div className="app-sidebar-user-panel">
          <span className="app-sidebar-user-name">admin</span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm app-sidebar-user-icon"
            onClick={handleLogoutWithConfirm}
            aria-label="退出登录"
            title="退出登录"
          >
            ⎋
          </button>
        </div>
      </aside>

      <div className="app-main-shell">
        <header className="app-topbar">
          <div className="app-topbar-copy app-topbar-copy-extended">
            <h2 className="app-topbar-title">{currentModule.title}</h2>
          </div>
          <div className="app-topbar-actions-shell">
            <div className="header-actions app-topbar-actions-row">
              <button className="btn btn-outline-secondary app-action-button" onClick={handleRefresh}>
                刷新
              </button>
              {canCreateTask && (
                <button className="btn btn-success app-action-button" onClick={handleCreateTask}>
                  + 新建任务
                </button>
              )}
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
          projectTasks={selectedProject ? tasks.filter((item) => item.project_id === modalProject.id) : []}
          onClose={handleTaskModalClose}
          onSave={handleTaskModalSave}
        />
      )}
    </div>
  );
};

export default App;
