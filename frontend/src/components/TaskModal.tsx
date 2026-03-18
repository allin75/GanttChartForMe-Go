import React, { useEffect, useState } from 'react';
import { format, addDays } from 'date-fns';
import { CreateTaskDto, Project, Task, UpdateTaskDto } from '../types';
import { tasksApi } from '../api';

interface TaskModalProps {
  task: Task | null;
  project: Project;
  onClose: () => void;
  onSave: () => Promise<void>;
}

const TASK_COLORS = ['#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F', '#9B59B6', '#1ABC9C', '#34495E', '#E74C3C'];

const buildDefaultTaskForm = (project: Project): CreateTaskDto => ({
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

const TaskModal: React.FC<TaskModalProps> = ({ task, project, onClose, onSave }) => {
  const [formData, setFormData] = useState<CreateTaskDto | UpdateTaskDto>(buildDefaultTaskForm(project));

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
      return;
    }

    setFormData(buildDefaultTaskForm(project));
  }, [project, task]);

  const handleSubmit = async () => {
    try {
      if (task) {
        await tasksApi.update(task.id, formData);
      } else {
        await tasksApi.create(formData as CreateTaskDto);
      }

      await onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDelete = async () => {
    if (!task) {
      return;
    }

    if (!window.confirm('确定要删除这个任务吗？')) {
      return;
    }

    try {
      await tasksApi.delete(task.id);
      await onSave();
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const isInvalidDateRange =
    Boolean(formData.start_date) &&
    Boolean(formData.end_date) &&
    (formData.start_date as string) > (formData.end_date as string);

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
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">描述</label>
              <textarea
                className="form-control"
                rows={2}
                value={formData.description || ''}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              />
            </div>
            <div className="row mb-3">
              <div className="col">
                <label className="form-label">开始日期 *</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.start_date || ''}
                  onChange={(event) => setFormData({ ...formData, start_date: event.target.value })}
                />
              </div>
              <div className="col">
                <label className="form-label">结束日期 *</label>
                <input
                  type="date"
                  className="form-control"
                  value={formData.end_date || ''}
                  onChange={(event) => setFormData({ ...formData, end_date: event.target.value })}
                />
              </div>
            </div>
            {isInvalidDateRange && (
              <div className="alert alert-warning py-2">
                结束日期不能早于开始日期。
              </div>
            )}
            <div className="mb-3">
              <label className="form-label">进度: {formData.progress || 0}%</label>
              <input
                type="range"
                className="form-range"
                min={0}
                max={100}
                value={formData.progress || 0}
                onChange={(event) => setFormData({ ...formData, progress: parseInt(event.target.value, 10) })}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">颜色</label>
              <div className="color-picker">
                {TASK_COLORS.map((color) => (
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
              disabled={!formData.name?.trim() || !formData.start_date || !formData.end_date || isInvalidDateRange}
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
