import React, { useState } from 'react';
import { CreateProjectDto, Project, UpdateProjectDto } from '../types';

interface ProjectListProps {
  projects: Project[];
  loading: boolean;
  selectedProjectId: string | null;
  showAllTasks: boolean;
  onSelectProject: (project: Project | null) => void;
  onSelectAllTasks: () => void;
  onRefresh: () => Promise<void>;
  onCreateProject: (data: CreateProjectDto) => Promise<void>;
  onUpdateProject: (projectId: string, data: UpdateProjectDto) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

const DEFAULT_PROJECT_FORM: CreateProjectDto = {
  name: '',
  description: '',
  color: '#4A90D9',
};

const PROJECT_COLORS = ['#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F', '#9B59B6', '#1ABC9C', '#34495E', '#E74C3C'];

const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  loading,
  selectedProjectId,
  showAllTasks,
  onSelectProject,
  onSelectAllTasks,
  onRefresh,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<CreateProjectDto>(DEFAULT_PROJECT_FORM);

  const resetForm = () => {
    setFormData(DEFAULT_PROJECT_FORM);
    setEditingProject(null);
    setShowModal(false);
  };

  const handleCreate = async () => {
    try {
      await onCreateProject(formData);
      resetForm();
      await onRefresh();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editingProject) {
      return;
    }

    try {
      await onUpdateProject(editingProject.id, formData);
      resetForm();
      await onRefresh();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!window.confirm('确定要删除这个项目吗？相关任务也会一并删除。')) {
      return;
    }

    try {
      await onDeleteProject(projectId);
      await onRefresh();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const openCreateModal = () => {
    setFormData(DEFAULT_PROJECT_FORM);
    setEditingProject(null);
    setShowModal(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description,
      color: project.color,
    });
    setShowModal(true);
  };

  return (
    <div className="project-list">
      <div className="project-list-header">
        <h5 className="mb-0">项目列表</h5>
        <button className="btn btn-sm btn-primary" onClick={openCreateModal}>
          + 新建
        </button>
      </div>

      {loading ? (
        <div className="text-center p-3">
          <div className="spinner-border spinner-border-sm" role="status" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center text-muted p-3">
          暂无项目，点击上方按钮创建。
        </div>
      ) : (
        <div className="project-items">
          <div
            className={`project-item all-tasks ${showAllTasks ? 'active' : ''}`}
            onClick={onSelectAllTasks}
          >
            <div className="project-color" style={{ backgroundColor: '#6c757d' }}>📋</div>
            <div className="project-info">
              <div className="project-name">全部任务</div>
              <div className="project-desc">查看所有项目中的任务</div>
            </div>
          </div>

          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project)}
            >
              <div className="project-color" style={{ backgroundColor: project.color }} />
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                {project.description && <div className="project-desc">{project.description}</div>}
              </div>
              <div className="project-actions">
                <button
                  className="btn btn-sm btn-link text-secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditModal(project);
                  }}
                >
                  编辑
                </button>
                <button
                  className="btn btn-sm btn-link text-danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(project.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingProject ? '编辑项目' : '新建项目'}</h5>
                <button type="button" className="btn-close" onClick={resetForm} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">项目名称 *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">描述</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={formData.description}
                    onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">颜色</label>
                  <div className="color-picker">
                    {PROJECT_COLORS.map((color) => (
                      <div
                        key={color}
                        className={`color-option ${formData.color === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>取消</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={editingProject ? handleUpdate : handleCreate}
                  disabled={!formData.name.trim()}
                >
                  {editingProject ? '保存' : '创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
