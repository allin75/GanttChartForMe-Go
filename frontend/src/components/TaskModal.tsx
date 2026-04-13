import React, { useEffect, useRef, useState } from 'react';
import { format, addDays } from 'date-fns';
import { CreateTaskDto, Project, ProjectAttachment, Task, UpdateTaskDto } from '../types';
import { projectAttachmentsApi, tasksApi } from '../api';

interface TaskModalProps {
  task: Task | null;
  project: Project;
  projectTasks?: Task[];
  onClose: () => void;
  onSave: () => Promise<void>;
}

const TASK_COLORS = ['#4A90D9', '#5CB85C', '#F0AD4E', '#D9534F', '#9B59B6', '#1ABC9C', '#34495E', '#E74C3C'];

const buildDefaultTaskForm = (project: Project): CreateTaskDto => ({
  project_id: project.id,
  name: '',
  description: '',
  owner: '',
  start_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
  progress: 0,
  color: project.color,
  parent_id: undefined,
  dependencies: [],
});

const TaskModal: React.FC<TaskModalProps> = ({ task, project, projectTasks = [], onClose, onSave }) => {
  const [formData, setFormData] = useState<CreateTaskDto | UpdateTaskDto>(buildDefaultTaskForm(project));
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        description: task.description,
        owner: task.owner,
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

  useEffect(() => {
    const loadAttachments = async () => {
      if (!task) {
        setAttachments([]);
        return;
      }

      try {
        setAttachmentsLoading(true);
        const data = await projectAttachmentsApi.listByTask(project.id, task.id);
        setAttachments(data);
      } finally {
        setAttachmentsLoading(false);
      }
    };

    loadAttachments();
  }, [project.id, task]);

  const handleSubmit = async (keepOpenForNext = false) => {
    try {
      setErrorMessage('');
      if (task) {
        await tasksApi.update(task.id, formData);
      } else {
        await tasksApi.create(formData as CreateTaskDto);
      }

      await onSave();

      if (keepOpenForNext) {
        setFormData(buildDefaultTaskForm(project));
        setAttachments([]);
        return;
      }

      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      setErrorMessage(error instanceof Error ? error.message : '保存任务失败');
    }
  };

  const handleDuplicateTask = async () => {
    if (!task) {
      return;
    }

    try {
      setErrorMessage('');
      const duplicated: CreateTaskDto = {
        project_id: project.id,
        name: `${formData.name || task.name}（副本）`,
        description: formData.description || task.description,
        owner: formData.owner || task.owner,
        start_date: formData.start_date || task.start_date,
        end_date: formData.end_date || task.end_date,
        progress: formData.progress || task.progress,
        color: formData.color || task.color,
        parent_id: formData.parent_id,
        dependencies: formData.dependencies || task.dependencies,
      };
      await tasksApi.create(duplicated);
      await onSave();
      onClose();
    } catch (error) {
      console.error('Failed to duplicate task:', error);
      setErrorMessage(error instanceof Error ? error.message : '复制任务失败');
    }
  };

  const handleSaveAndCreateNext = async () => {
    if (task) {
      return;
    }

    await handleSubmit(true);
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

  const handleFileChange = async (files: FileList | null) => {
    if (!task || !files || files.length === 0) {
      return;
    }

    try {
      setErrorMessage('');
      setAttachmentUploading(true);
      await projectAttachmentsApi.upload(project.id, Array.from(files), task.id);
      const data = await projectAttachmentsApi.listByTask(project.id, task.id);
      setAttachments(data);
    } catch (error) {
      console.error('Failed to upload task attachments:', error);
      setErrorMessage(error instanceof Error ? error.message : '上传文件失败');
    } finally {
      setAttachmentUploading(false);
    }
  };

  const handleAssignAttachment = async (attachmentId: string, taskId: string) => {
    try {
      setErrorMessage('');
      await projectAttachmentsApi.assignTask(project.id, attachmentId, taskId || undefined);
      const data = task ? await projectAttachmentsApi.listByTask(project.id, task.id) : [];
      setAttachments(data);
    } catch (error) {
      console.error('Failed to update attachment task relation:', error);
      setErrorMessage(error instanceof Error ? error.message : '更新文件关联失败');
    }
  };

  const isInvalidDateRange =
    Boolean(formData.start_date) &&
    Boolean(formData.end_date) &&
    (formData.start_date as string) > (formData.end_date as string);
  const availableTaskOptions = projectTasks.filter((projectTask) => projectTask.id !== task?.id);

  return (
    <div className="modal show d-block app-modal-backdrop">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content app-modal-content">
          <div className="modal-header app-modal-header">
            <h5 className="modal-title">{task ? '编辑任务' : '新建任务'}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body app-modal-body">
            <div className="task-modal-topbar">
              <div className="task-modal-project-badge" style={{ backgroundColor: project.color }}>
                {project.name}
              </div>
              {task && <div className="task-modal-secondary-text">ID: {task.id.slice(0, 8)}</div>}
            </div>
            <div className="task-modal-grid task-modal-grid-primary mb-3">
              <div>
                <label className="form-label">任务名称 *</label>
                <input
                  type="text"
                  className="form-control app-form-control"
                  value={formData.name || ''}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                />
              </div>
              <div>
                <label className="form-label">负责人</label>
                <input
                  type="text"
                  className="form-control app-form-control"
                  value={formData.owner || ''}
                  onChange={(event) => setFormData({ ...formData, owner: event.target.value })}
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label">描述</label>
              <textarea
                className="form-control app-form-control"
                rows={2}
                value={formData.description || ''}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
              />
            </div>
            <div className="row mb-3 task-modal-grid-secondary">
              <div className="col">
                <label className="form-label">开始日期 *</label>
                <input
                  type="date"
                  className="form-control app-form-control"
                  value={formData.start_date || ''}
                  onChange={(event) => setFormData({ ...formData, start_date: event.target.value })}
                />
              </div>
              <div className="col">
                <label className="form-label">结束日期 *</label>
                <input
                  type="date"
                  className="form-control app-form-control"
                  value={formData.end_date || ''}
                  onChange={(event) => setFormData({ ...formData, end_date: event.target.value })}
                />
              </div>
            </div>
            {isInvalidDateRange && (
              <div className="alert alert-warning py-2 task-modal-warning">
                结束日期不能早于开始日期。
              </div>
            )}
            {errorMessage && (
              <div className="alert alert-danger py-2 task-modal-warning">
                {errorMessage}
              </div>
            )}
            <div className="mb-3">
              <div className="task-modal-inline-label">
                <label className="form-label mb-0">进度</label>
                <span>{formData.progress || 0}%</span>
              </div>
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
              <div className="task-modal-inline-label">
                <label className="form-label mb-0">颜色</label>
              </div>
              <div className="color-picker">
                {TASK_COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={`color-option ${formData.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>

            <div className="task-modal-grid task-modal-grid-primary mb-3">
              <div>
                <label className="form-label">父任务</label>
                <select
                  className="form-select app-form-control"
                  value={formData.parent_id || ''}
                  onChange={(event) => setFormData({
                    ...formData,
                    parent_id: event.target.value || undefined,
                  })}
                >
                  <option value="">无</option>
                  {availableTaskOptions.map((projectTask) => (
                    <option key={projectTask.id} value={projectTask.id}>{projectTask.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">依赖任务</label>
                <select
                  multiple
                  className="form-select app-form-control task-modal-multi-select"
                  value={formData.dependencies || []}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                    setFormData({ ...formData, dependencies: values });
                  }}
                >
                  {availableTaskOptions.map((projectTask) => (
                    <option key={projectTask.id} value={projectTask.id}>{projectTask.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {task && (
              <div className="task-modal-files-panel mt-4">
                <div className="d-flex justify-content-between align-items-center mb-2 gap-3">
                  <label className="form-label mb-0">任务文件</label>
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => handleFileChange(event.target.files)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {attachmentUploading ? '上传中...' : '+ 上传文件'}
                    </button>
                  </>
                </div>

                {attachmentsLoading ? (
                  <div className="text-muted small">正在加载文件...</div>
                ) : attachments.length > 0 ? (
                  <div className="attachment-list">
                    {attachments.map((attachment) => (
                      <article key={attachment.id} className="attachment-item">
                        <div className="attachment-main">
                          <strong>{attachment.original_name}</strong>
                          <span>{attachment.mime_type} · {Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</span>
                        </div>
                        <div className="attachment-actions">
                          <select
                            className="form-select form-select-sm app-attachment-task-select"
                            value={attachment.task_id || ''}
                            onChange={(event) => handleAssignAttachment(attachment.id, event.target.value)}
                          >
                            <option value="">不关联任务</option>
                            {projectTasks.map((projectTask) => (
                              <option key={projectTask.id} value={projectTask.id}>{projectTask.name}</option>
                            ))}
                          </select>
                          <a
                            className="btn btn-outline-secondary btn-sm"
                            href={projectAttachmentsApi.downloadUrl(project.id, attachment.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            下载
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted small">暂无文件</div>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer app-modal-footer">
            {task && (
              <button type="button" className="btn btn-danger me-auto" onClick={handleDelete}>
                删除
              </button>
            )}
            {task && (
              <button type="button" className="btn btn-outline-secondary" onClick={handleDuplicateTask}>
                复制任务
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            {!task && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={handleSaveAndCreateNext}
                disabled={!formData.name?.trim() || !formData.start_date || !formData.end_date || isInvalidDateRange}
              >
                保存并继续
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleSubmit(false)}
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
