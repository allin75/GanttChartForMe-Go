import React, { useEffect, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import rehypeSanitize from 'rehype-sanitize';
import { CreateTaskDto, Project, ProjectAttachment, Task, TaskTimelineEvent, UpdateTaskDto } from '../types';
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
  timeline_events: [],
});

const createTimelineEventId = () => `timeline-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const sortTimelineEvents = (events: TaskTimelineEvent[]) =>
  [...events].sort((left, right) => {
    if (left.time === right.time) return left.id.localeCompare(right.id);
    if (!left.time) return 1;
    if (!right.time) return -1;
    return left.time.localeCompare(right.time);
  });

const normalizeTimelineEvent = (event: TaskTimelineEvent): TaskTimelineEvent => ({
  id: event.id || createTimelineEventId(),
  title: event.title.trim() || '未命名节点',
  time: event.time.trim(),
  detail: event.detail.trim(),
});

const normalizeTimelineEvents = (events?: TaskTimelineEvent[]) => sortTimelineEvents((events || []).map(normalizeTimelineEvent));

const formatDateTimeLabel = (value: string, fallback = '未设置') => {
  if (!value) return fallback;
  const parsed = parseISO(value);
  if (!isValid(parsed)) return value;
  return format(parsed, 'yyyy/MM/dd HH:mm');
};

const toDateTimeLocalValue = (value: string) => {
  if (!value) return '';
  const parsed = parseISO(value);
  if (!isValid(parsed)) return value;
  return format(parsed, "yyyy-MM-dd'T'HH:mm");
};

const createDraftTimelineEvent = (overrides: Partial<TaskTimelineEvent> = {}): TaskTimelineEvent => ({
  id: createTimelineEventId(),
  title: '新节点',
  time: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  detail: '',
  ...overrides,
});

const TaskModal: React.FC<TaskModalProps> = ({ task, project, projectTasks = [], onClose, onSave }) => {
  const [formData, setFormData] = useState<CreateTaskDto | UpdateTaskDto>(buildDefaultTaskForm(project));
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [descriptionUploading, setDescriptionUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [editingTimelineEventId, setEditingTimelineEventId] = useState<string | null>(null);
  const [timelineDraft, setTimelineDraft] = useState<TaskTimelineEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownImageInputRef = useRef<HTMLInputElement | null>(null);

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
        timeline_events: normalizeTimelineEvents(task.timeline_events),
      });
      setEditingTimelineEventId(null);
      setTimelineDraft(null);
      return;
    }
    setFormData(buildDefaultTaskForm(project));
    setEditingTimelineEventId(null);
    setTimelineDraft(null);
  }, [project, task]);

  useEffect(() => {
    const loadAttachments = async () => {
      if (!task) {
        setAttachments([]);
        return;
      }
      try {
        setAttachmentsLoading(true);
        setAttachments(await projectAttachmentsApi.listByTask(project.id, task.id));
      } finally {
        setAttachmentsLoading(false);
      }
    };
    loadAttachments();
  }, [project.id, task]);

  const todayValue = format(new Date(), 'yyyy-MM-dd');
  const startDateValue = formData.start_date || todayValue;
  const rawEndDateValue = formData.end_date || startDateValue;
  const endDateValue = rawEndDateValue < startDateValue ? startDateValue : rawEndDateValue;
  const progressValue = formData.progress || 0;
  const taskDurationDays = differenceInCalendarDays(parseISO(endDateValue), parseISO(startDateValue)) + 1;
  const timelineEvents = normalizeTimelineEvents(formData.timeline_events);
  const isInvalidDateRange =
    Boolean(formData.start_date) &&
    Boolean(formData.end_date) &&
    (formData.start_date as string) > (formData.end_date as string);
  const availableTaskOptions = projectTasks.filter((projectTask) => projectTask.id !== task?.id);

  const updateTimelineEvents = (updater: (events: TaskTimelineEvent[]) => TaskTimelineEvent[]) => {
    setFormData((current) => ({
      ...current,
      timeline_events: normalizeTimelineEvents(updater(normalizeTimelineEvents(current.timeline_events))),
    }));
  };

  const startEditingTimelineEvent = (eventItem: TaskTimelineEvent) => {
    setEditingTimelineEventId(eventItem.id);
    setTimelineDraft({ ...eventItem, time: toDateTimeLocalValue(eventItem.time) });
  };

  const handleAddTimelineEvent = (preset?: Partial<TaskTimelineEvent>) => {
    const nextEvent = createDraftTimelineEvent(preset);
    updateTimelineEvents((events) => [...events, nextEvent]);
    startEditingTimelineEvent(nextEvent);
  };

  const handleDeleteTimelineEvent = (eventId: string) => {
    updateTimelineEvents((events) => events.filter((eventItem) => eventItem.id !== eventId));
    if (editingTimelineEventId === eventId) {
      setEditingTimelineEventId(null);
      setTimelineDraft(null);
    }
  };

  const handleSaveTimelineEvent = () => {
    if (!editingTimelineEventId || !timelineDraft) return;
    const nextEvent = normalizeTimelineEvent({ ...timelineDraft, id: editingTimelineEventId });
    updateTimelineEvents((events) => events.map((eventItem) => (eventItem.id === editingTimelineEventId ? nextEvent : eventItem)));
    setEditingTimelineEventId(null);
    setTimelineDraft(null);
  };

  const insertDescriptionText = (text: string, selection?: { start: number; end: number }) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('.task-modal-markdown-shell textarea');
    const currentValue = formData.description || '';
    if (!textarea) {
      setFormData((current) => ({ ...current, description: `${current.description || ''}${text}` }));
      return;
    }
    const start = selection?.start ?? textarea.selectionStart ?? 0;
    const end = selection?.end ?? textarea.selectionEnd ?? 0;
    const nextValue = `${currentValue.slice(0, start)}${text}${currentValue.slice(end)}`;
    setFormData((current) => ({ ...current, description: nextValue }));
    window.setTimeout(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const uploadMarkdownImages = async (files: File[], selection?: { start: number; end: number }) => {
    if (!files.length) return;
    try {
      setErrorMessage('');
      setDescriptionUploading(true);
      const uploaded = await projectAttachmentsApi.upload(project.id, files, task?.id);
      const markdown = uploaded.map((attachment) => `![${attachment.original_name.replace(/\.[^.]+$/, '')}](${projectAttachmentsApi.downloadUrl(project.id, attachment.id)})`).join('\n\n');
      insertDescriptionText(`${markdown}\n\n`, selection);
      if (task) setAttachments(await projectAttachmentsApi.listByTask(project.id, task.id));
    } catch (error) {
      console.error('Failed to upload markdown images:', error);
      setErrorMessage(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setDescriptionUploading(false);
      if (markdownImageInputRef.current) markdownImageInputRef.current.value = '';
    }
  };

  const handleDescriptionPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const selection = {
      start: event.currentTarget.selectionStart || 0,
      end: event.currentTarget.selectionEnd || 0,
    };
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    await uploadMarkdownImages(files, selection);
  };

  const handleSubmit = async (keepOpenForNext = false) => {
    try {
      setErrorMessage('');
      const payload = { ...formData, timeline_events: normalizeTimelineEvents(formData.timeline_events) };
      if (task) await tasksApi.update(task.id, payload);
      else await tasksApi.create(payload as CreateTaskDto);
      await onSave();
      if (keepOpenForNext) {
        setFormData(buildDefaultTaskForm(project));
        setAttachments([]);
        setEditingTimelineEventId(null);
        setTimelineDraft(null);
        return;
      }
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
      setErrorMessage(error instanceof Error ? error.message : '保存任务失败');
    }
  };

  const handleDuplicateTask = async () => {
    if (!task) return;
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
        timeline_events: normalizeTimelineEvents(formData.timeline_events || task.timeline_events),
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
    if (!task) await handleSubmit(true);
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!window.confirm('确定要删除这个任务吗？')) return;
    try {
      await tasksApi.delete(task.id);
      await onSave();
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleFileChange = async (files: FileList | null) => {
    if (!task || !files || files.length === 0) return;
    try {
      setErrorMessage('');
      setAttachmentUploading(true);
      await projectAttachmentsApi.upload(project.id, Array.from(files), task.id);
      setAttachments(await projectAttachmentsApi.listByTask(project.id, task.id));
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

  return (
    <div className="modal show d-block app-modal-backdrop">
      <div className="modal-dialog modal-dialog-centered task-modal-dialog">
        <div className="modal-content app-modal-content">
          <div className="modal-header app-modal-header">
            <h5 className="modal-title">{task ? '编辑任务' : '新建任务'}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body app-modal-body task-modal-body">
            <div className="task-modal-topbar">
              <div className="task-modal-project-badge" style={{ backgroundColor: project.color }}>{project.name}</div>
              {task && <div className="task-modal-secondary-text">ID: {task.id.slice(0, 8)}</div>}
            </div>

            <div className="task-modal-layout">
              <div className="task-modal-form-column">
                <section className="task-modal-section">
                  <div className="task-modal-section-head">
                    <div>
                      <h6 className="task-modal-section-title">基础信息</h6>
                      <p className="task-modal-section-copy">描述改为 Markdown，本地编辑与预览都离线可用。</p>
                    </div>
                  </div>
                  <div className="task-modal-grid task-modal-grid-primary">
                    <div>
                      <label className="form-label">任务名称 *</label>
                      <input type="text" className="form-control app-form-control" value={formData.name || ''} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">负责人</label>
                      <input type="text" className="form-control app-form-control" value={formData.owner || ''} onChange={(event) => setFormData({ ...formData, owner: event.target.value })} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="task-modal-inline-label">
                      <label className="form-label mb-0">描述（Markdown）</label>
                      <div className="task-modal-markdown-actions">
                        <input ref={markdownImageInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => uploadMarkdownImages(Array.from(event.target.files || []))} />
                        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => markdownImageInputRef.current?.click()} disabled={descriptionUploading}>
                          {descriptionUploading ? '上传图片中...' : '+ 插入图片'}
                        </button>
                      </div>
                    </div>
                    <div className="task-modal-markdown-hint">支持 Markdown、粘贴图片上传、实时预览。图片会按比例缩小显示，不会撑满编辑区域。</div>
                    <div data-color-mode="light" className="task-modal-markdown-shell">
                      <div className="wmde-markdown-var" />
                      <MDEditor
                        value={formData.description || ''}
                        onChange={(value) => setFormData({ ...formData, description: value || '' })}
                        preview="live"
                        visibleDragbar={false}
                        height={320}
                        textareaProps={{ placeholder: '在这里输入 Markdown 描述，支持直接粘贴图片。', onPaste: handleDescriptionPaste }}
                        previewOptions={{ rehypePlugins: [[rehypeSanitize]], components: { img: ({ node, ...props }) => <img {...props} className="task-markdown-image" alt={props.alt || ''} /> } }}
                      />
                    </div>
                  </div>
                </section>

                <section className="task-modal-section">
                  <div className="task-modal-section-head">
                    <div>
                      <h6 className="task-modal-section-title">排期设置</h6>
                      <p className="task-modal-section-copy">起止日期与进度留在左侧，关键节点时间由右侧单独维护。</p>
                    </div>
                    <div className="task-modal-duration-pill">共 {taskDurationDays} 天</div>
                  </div>
                  <div className="task-modal-grid task-modal-grid-dates">
                    <div>
                      <label className="form-label">开始日期 *</label>
                      <input type="date" className="form-control app-form-control" value={formData.start_date || ''} onChange={(event) => setFormData({ ...formData, start_date: event.target.value })} />
                    </div>
                    <div>
                      <label className="form-label">结束日期 *</label>
                      <input type="date" className="form-control app-form-control" value={formData.end_date || ''} onChange={(event) => setFormData({ ...formData, end_date: event.target.value })} />
                    </div>
                  </div>
                  {isInvalidDateRange && <div className="alert alert-warning py-2 task-modal-warning mt-3">结束日期不能早于开始日期。</div>}
                  {errorMessage && <div className="alert alert-danger py-2 task-modal-warning mt-3">{errorMessage}</div>}
                  <div className="task-modal-grid task-modal-grid-progress mt-3">
                    <div>
                      <div className="task-modal-inline-label"><label className="form-label mb-0">进度</label><span>{progressValue}%</span></div>
                      <input type="range" className="form-range" min={0} max={100} value={progressValue} onChange={(event) => setFormData({ ...formData, progress: parseInt(event.target.value, 10) })} />
                    </div>
                    <div>
                      <div className="task-modal-inline-label"><label className="form-label mb-0">颜色</label></div>
                      <div className="color-picker">
                        {TASK_COLORS.map((color) => (
                          <button type="button" key={color} className={`color-option ${formData.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setFormData({ ...formData, color })} />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="task-modal-section">
                  <div className="task-modal-section-head">
                    <div>
                      <h6 className="task-modal-section-title">任务关系</h6>
                      <p className="task-modal-section-copy">父任务与依赖任务仍然保留在主表单中。</p>
                    </div>
                  </div>
                  <div className="task-modal-grid task-modal-grid-primary">
                    <div>
                      <label className="form-label">父任务</label>
                      <select className="form-select app-form-control" value={formData.parent_id || ''} onChange={(event) => setFormData({ ...formData, parent_id: event.target.value || undefined })}>
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
                </section>
              </div>

              <aside className="task-modal-timeline-column">
                <section className="task-modal-section task-modal-timeline-panel">
                  <div className="task-modal-section-head">
                    <div>
                      <h6 className="task-modal-section-title">关键节点时间线</h6>
                      <p className="task-modal-section-copy">双击节点卡片可直接进入编辑，支持新增、删除和调整时间。</p>
                    </div>
                  </div>
                  <div className="task-modal-timeline-toolbar">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAddTimelineEvent()}>+ 新增节点</button>
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => handleAddTimelineEvent({ title: '计划开始', time: `${startDateValue}T09:00`, detail: '从这里开始推进当前任务。' })}>+ 开始节点</button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => handleAddTimelineEvent({ title: '计划截止', time: `${endDateValue}T18:00`, detail: '在这个时间前完成当前任务。' })}>+ 截止节点</button>
                  </div>

                  {timelineEvents.length > 0 ? (
                    <div className="task-modal-timeline-list">
                      {timelineEvents.map((eventItem, index) => {
                        const isEditing = editingTimelineEventId === eventItem.id && timelineDraft;
                        return (
                          <article key={eventItem.id} className={`task-modal-timeline-item ${index === timelineEvents.length - 1 ? 'last' : ''}`}>
                            <div className="task-modal-timeline-rail">
                              <span className="task-modal-timeline-dot" />
                              {index < timelineEvents.length - 1 && <span className="task-modal-timeline-line" />}
                            </div>
                            <div className={`task-modal-timeline-card ${isEditing ? 'editing' : ''}`} onDoubleClick={() => !isEditing && startEditingTimelineEvent(eventItem)}>
                              {isEditing && timelineDraft ? (
                                <div className="task-modal-timeline-form">
                                  <input type="text" className="form-control app-form-control" value={timelineDraft.title} onChange={(event) => setTimelineDraft((current) => current ? { ...current, title: event.target.value } : current)} placeholder="节点标题" />
                                  <input type="datetime-local" className="form-control app-form-control" value={timelineDraft.time} onChange={(event) => setTimelineDraft((current) => current ? { ...current, time: event.target.value } : current)} />
                                  <textarea className="form-control app-form-control" rows={3} value={timelineDraft.detail} onChange={(event) => setTimelineDraft((current) => current ? { ...current, detail: event.target.value } : current)} placeholder="节点说明" />
                                  <div className="task-modal-timeline-card-actions">
                                    <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveTimelineEvent}>保存节点</button>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setEditingTimelineEventId(null); setTimelineDraft(null); }}>取消</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="task-modal-timeline-meta"><strong>{eventItem.title}</strong><span>{formatDateTimeLabel(eventItem.time)}</span></div>
                                  {eventItem.detail ? <p>{eventItem.detail}</p> : null}
                                  <div className="task-modal-timeline-card-actions">
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => startEditingTimelineEvent(eventItem)}>编辑</button>
                                    <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteTimelineEvent(eventItem.id)}>删除</button>
                                  </div>
                                </>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="task-modal-timeline-empty">
                      <strong>还没有关键节点</strong>
                      <p>点击上方按钮新增节点，或者先添加开始/截止节点。双击任意节点卡片可直接编辑文字。</p>
                    </div>
                  )}

                  <div className="task-modal-timeline-summary-card">
                    <span>当前摘要</span>
                    <strong>{(formData.name || '').trim() || '未命名任务'}</strong>
                    <p>当前已记录 {timelineEvents.length} 个关键节点，计划周期 {taskDurationDays} 天，当前进度 {progressValue}%。</p>
                  </div>
                </section>
              </aside>
            </div>

            {task && (
              <section className="task-modal-section task-modal-files-panel">
                <div className="task-modal-section-head">
                  <div>
                    <h6 className="task-modal-section-title">任务文件</h6>
                    <p className="task-modal-section-copy">附件区域保留在底部，不干扰 Markdown 与节点编辑。</p>
                  </div>
                  <>
                    <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => handleFileChange(event.target.files)} />
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
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
                          <select className="form-select form-select-sm app-attachment-task-select" value={attachment.task_id || ''} onChange={(event) => handleAssignAttachment(attachment.id, event.target.value)}>
                            <option value="">不关联任务</option>
                            {projectTasks.map((projectTask) => (
                              <option key={projectTask.id} value={projectTask.id}>{projectTask.name}</option>
                            ))}
                          </select>
                          <a className="btn btn-outline-secondary btn-sm" href={projectAttachmentsApi.downloadUrl(project.id, attachment.id)} target="_blank" rel="noreferrer">下载</a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted small">暂无文件</div>
                )}
              </section>
            )}
          </div>
          <div className="modal-footer app-modal-footer">
            {task && <button type="button" className="btn btn-danger me-auto" onClick={handleDelete}>删除</button>}
            {task && <button type="button" className="btn btn-outline-secondary" onClick={handleDuplicateTask}>复制任务</button>}
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            {!task && (
              <button type="button" className="btn btn-outline-primary" onClick={handleSaveAndCreateNext} disabled={!formData.name?.trim() || !formData.start_date || !formData.end_date || isInvalidDateRange}>
                保存并继续
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={!formData.name?.trim() || !formData.start_date || !formData.end_date || isInvalidDateRange}>
              {task ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
