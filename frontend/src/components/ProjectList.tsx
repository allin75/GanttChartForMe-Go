import React, { useState, useEffect } from 'react';
import { Project, CreateProjectDto, UpdateProjectDto } from '../types';
import { projectsApi } from '../api';

interface ProjectListProps {
  selectedProjectId: string | null;
  showAllTasks: boolean;
  onSelectProject: (project: Project | null) => void;
  onSelectAllTasks: () => void;
  onRefresh: () => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ selectedProjectId, showAllTasks, onSelectProject, onSelectAllTasks, onRefresh }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<CreateProjectDto>({ name: '', description: '', color: '#4A90D9' });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await projectsApi.create(formData);
      setShowModal(false);
      setFormData({ name: '', description: '', color: '#4A90D9' });
      loadProjects();
      onRefresh();
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editingProject) return;
    try {
      await projectsApi.update(editingProject.id, formData);
      setEditingProject(null);
      setFormData({ name: '', description: '', color: '#4A90D9' });
      loadProjects();
      onRefresh();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个项目吗？所有相关任务也会被删除。')) return;
    try {
      await projectsApi.delete(id);
      loadProjects();
      onRefresh();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const openCreateModal = () => {
    setFormData({ name: '', description: '', color: '#4A90D9' });
    setEditingProject(null);
    setShowModal(true);
  };

  const openEditModal = (project: Project) => {
    setFormData({ name: project.name, description: project.description, color: project.color });
    setEditingProject(project);
    setShowModal(true);
  };

  const colors = ['#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F', '#9B59B6', '#1ABC9C', '#34495E', '#E74C3C'];

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
          暂无项目，点击上方按钮创建
        </div>
      ) : (
        <div className="project-items">
          {/* 全部任务选项 */}
          <div 
            className={`project-item all-tasks ${showAllTasks ? 'active' : ''}`}
            onClick={onSelectAllTasks}
          >
            <div className="project-color" style={{ backgroundColor: '#6c757d' }}>📊</div>
            <div className="project-info">
              <div className="project-name">全部任务</div>
              <div className="project-desc">查看所有项目任务</div>
            </div>
          </div>
          
          {projects.map(project => (
            <div 
              key={project.id}
              className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
              onClick={() => onSelectProject(project)}
            >
              <div className="project-color" style={{ backgroundColor: project.color }} />
              <div className="project-info">
                <div className="project-name">{project.name}</div>
                {project.description && (
                  <div className="project-desc">{project.description}</div>
                )}
              </div>
              <div className="project-actions">
                <button 
                  className="btn btn-sm btn-link text-secondary"
                  onClick={(e) => { e.stopPropagation(); openEditModal(project); }}
                >
                  ✎
                </button>
                <button 
                  className="btn btn-sm btn-link text-danger"
                  onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingProject ? '编辑项目' : '新建项目'}</h5>
                <button type="button" className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">项目名称 *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">描述</label>
                  <textarea 
                    className="form-control" 
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">颜色</label>
                  <div className="color-picker">
                    {colors.map(color => (
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={editingProject ? handleUpdate : handleCreate}
                  disabled={!formData.name}
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
