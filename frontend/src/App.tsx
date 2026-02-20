import React, { useState, useEffect } from 'react';
import { Project, Task } from './types';
import { tasksApi, projectsApi } from './api';
import ProjectList from './components/ProjectList';
import GanttChart from './components/GanttChart';
import TaskModal from './components/TaskModal';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const App: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showAllTasks) {
      loadAllTasks();
    } else if (selectedProject) {
      loadTasks(selectedProject.id);
    } else {
      setTasks([]);
    }
  }, [selectedProject, showAllTasks]);

  const loadProjects = async () => {
    try {
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadTasks = async (projectId: string) => {
    try {
      const data = await tasksApi.getByProject(projectId);
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  const loadAllTasks = async () => {
    try {
      const data = await tasksApi.getAll();
      setTasks(data);
    } catch (error) {
      console.error('Failed to load all tasks:', error);
    }
  };

  const handleSelectProject = (project: Project | null) => {
    setSelectedProject(project);
    setShowAllTasks(false);
  };

  const handleSelectAllTasks = () => {
    setShowAllTasks(true);
    setSelectedProject(null);
  };

  const handleRefresh = () => {
    if (showAllTasks) {
      loadAllTasks();
    } else if (selectedProject) {
      loadTasks(selectedProject.id);
    }
    loadProjects();
  };

  const handleTaskUpdate = async (id: string, data: { start_date?: string; end_date?: string }) => {
    try {
      await tasksApi.update(id, data);
      handleRefresh();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleCreateTask = () => {
    if (!selectedProject && !showAllTasks) return;
    setEditingTask(null);
    setShowTaskModal(true);
  };

  const handleTaskModalClose = () => {
    setShowTaskModal(false);
    setEditingTask(null);
  };

  const handleTaskModalSave = () => {
    handleRefresh();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">📊 甘特图 - 项目进度管理</h1>
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
          </div>
        )}
      </header>
      
      <div className="app-body">
        <aside className="app-sidebar">
          <ProjectList 
            selectedProjectId={selectedProject?.id || null}
            showAllTasks={showAllTasks}
            onSelectProject={handleSelectProject}
            onSelectAllTasks={handleSelectAllTasks}
            onRefresh={handleRefresh}
          />
        </aside>
        
        <main className="app-main">
          {(selectedProject || showAllTasks) ? (
            tasks.length > 0 ? (
              <GanttChart 
                tasks={tasks} 
                onTaskUpdate={handleTaskUpdate}
                onTaskClick={handleTaskClick}
                showProjectName={showAllTasks}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>暂无任务</h3>
                {!showAllTasks && (
                  <>
                    <p>点击上方"新建任务"按钮创建第一个任务</p>
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
              <p>从左侧列表选择一个项目查看甘特图，或选择"全部任务"</p>
            </div>
          )}
        </main>
      </div>

      {showTaskModal && (selectedProject || editingTask) && (
        <TaskModal 
          task={editingTask}
          project={selectedProject || projects.find(p => p.id === editingTask?.project_id) || projects[0]}
          onClose={handleTaskModalClose}
          onSave={handleTaskModalSave}
        />
      )}
    </div>
  );
};

export default App;