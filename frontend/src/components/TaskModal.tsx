import React, { useState, useEffect } from 'react';
import { Task, Project, CreateTaskDto, UpdateTaskDto } from '../types';
import { tasksApi } from '../api';
import { format, addDays } from 'date-fns';

interface TaskModalProps {
  task: Task | null;
  project: Project;
  onClose: () => void;
  onSave: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, project, onClose, onSave }) => {
  const [formData, setFormData] = useState<CreateTaskDto | UpdateTaskDto>({
    project_id: project.id,
    name: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
    progress: 0,
    color: project.color,
    parent_id: undefined,
    dependencies: [],
  });

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        description: task.description,
        start_date: task.start_date,
        end_date: task.end_date,
        progress: task.progress,
        color: task.color,
        parent_id: task.parent_id || undefined,
        dependencies: task.dependencies,
      });
    } else {
      setFormData({
        project_id: project.id,
        name: '',
        description: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        progress: 0,
        color: project.color,
        parent_id: undefined,
        dependencies: [],
      });
    }
  }, [task, project]);

  const handleSubmit = async () => {
    try {
      if (task) {
        await tasksApi.update(task.id, formData);
      } else {
        await tasksApi.create(formData as CreateTaskDto);
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!window.confirm('确定要删除这个任务吗？')) return;
    try {
      await tasksApi.delete(task.id);
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const colors = ['#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F', '#9B59B6', '#1ABC9C', '#34495E', '#E74C3C'];

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{task ? '编辑任务' : '新建任务'}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label">任务名称 *</label>
              <input 
                type="text" 
                className="form-control" 
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">描述</label>
              <textarea 
                className="form-control" 
                rows={2}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="row mb-3">
              <div className="col">
                <label className="form-label">开始日期 *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.start_date || ''}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="col">
                <label className="form-label">结束日期 *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">进度: {formData.progress || 0}%</label>
              <input 
                type="range" 
                className="form-range" 
                min={0}
                max={100}
                value={formData.progress || 0}
                onChange={(e) => setFormData({ ...formData, progress: parseInt(e.target.value) })}
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
            {task && (
              <button type="button" className="btn btn-danger me-auto" onClick={handleDelete}>
                删除
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!formData.name || !formData.start_date || !formData.end_date}
            >
              {task ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
