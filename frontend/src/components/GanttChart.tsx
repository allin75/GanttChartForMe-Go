import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDays,
  differenceInDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isWeekend,
  startOfWeek,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Task } from '../types';

interface GanttChartProps {
  tasks: Task[];
  onTaskUpdate: (id: string, data: { start_date?: string; end_date?: string }) => void;
  onTaskClick: (task: Task) => void;
  showProjectName?: boolean;
}

type ViewMode = 'day' | 'week' | 'month';
type DragType = 'move' | 'start' | 'end';

interface DragState {
  taskId: string;
  type: DragType;
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface DragPreview {
  taskId: string;
  type: DragType;
  startDate: Date;
  endDate: Date;
  daysDelta: number;
  left: number;
  width: number;
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  day: '日',
  week: '周',
  month: '月',
};

const GanttChart: React.FC<GanttChartProps> = ({ tasks, onTaskUpdate, onTaskClick, showProjectName = false }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const lastClickTimeRef = useRef<{ taskId: string; time: number } | null>(null);
  const ganttContainerRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);

  const getDateRange = useCallback(() => {
    if (tasks.length === 0) {
      const today = new Date();
      return {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
      };
    }

    const dates = tasks.flatMap((task) => [new Date(task.start_date), new Date(task.end_date)]);
    const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
    const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));

    return {
      start: startOfWeek(addDays(minDate, -7), { weekStartsOn: 1 }),
      end: addDays(maxDate, 14),
    };
  }, [tasks]);

  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const columnWidth = (() => {
    switch (viewMode) {
      case 'day':
        return 60;
      case 'week':
        return 40;
      case 'month':
        return 20;
      default:
        return 40;
    }
  })();

  const rowHeight = 40;
  const taskNameWidth = 220;
  const today = new Date();
  const todayOffset = differenceInDays(today, rangeStart);
  const showTodayLine = todayOffset >= 0 && todayOffset < days.length;

  const scrollToCurrentWeek = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = ganttContainerRef.current;
    if (!container || days.length === 0) {
      return;
    }

    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const currentWeekOffset = differenceInDays(currentWeekStart, rangeStart);
    const safeOffset = Math.max(currentWeekOffset, 0);
    const previewWeeks = 5;
    const previewWidth = previewWeeks * 7 * columnWidth;
    const centeredLeft = taskNameWidth + safeOffset * columnWidth - Math.max((container.clientWidth - taskNameWidth - previewWidth) / 2, 0);

    container.scrollTo({
      left: Math.max(centeredLeft, 0),
      behavior,
    });
  }, [columnWidth, days.length, rangeStart, taskNameWidth, today]);

  useEffect(() => {
    didAutoScrollRef.current = false;
  }, [tasks.length, viewMode, rangeStart.getTime(), rangeEnd.getTime()]);

  useEffect(() => {
    if (!ganttContainerRef.current || days.length === 0 || didAutoScrollRef.current) {
      return;
    }

    scrollToCurrentWeek('auto');
    didAutoScrollRef.current = true;
  }, [days.length, scrollToCurrentWeek]);

  const getTaskPosition = (task: Task) => {
    const startDate = new Date(task.start_date);
    const endDate = new Date(task.end_date);
    const startOffset = differenceInDays(startDate, rangeStart);
    const duration = differenceInDays(endDate, startDate) + 1;

    return {
      left: taskNameWidth + startOffset * columnWidth,
      width: Math.max(duration * columnWidth - 4, 12),
    };
  };

  const handleMouseDown = (event: React.MouseEvent, task: Task, type: DragType) => {
    event.preventDefault();
    event.stopPropagation();

    setDragging({
      taskId: task.id,
      type,
      startX: event.clientX,
      originalStart: new Date(task.start_date),
      originalEnd: new Date(task.end_date),
    });
  };

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!dragging) {
      return;
    }

    const deltaX = event.clientX - dragging.startX;
    const daysDelta = Math.round(deltaX / columnWidth);

    let newStart = dragging.originalStart;
    let newEnd = dragging.originalEnd;

    if (dragging.type === 'move') {
      newStart = addDays(dragging.originalStart, daysDelta);
      newEnd = addDays(dragging.originalEnd, daysDelta);
    } else if (dragging.type === 'start') {
      newStart = addDays(dragging.originalStart, daysDelta);
      if (newStart > newEnd) {
        newStart = newEnd;
      }
    } else {
      newEnd = addDays(dragging.originalEnd, daysDelta);
      if (newEnd < newStart) {
        newEnd = newStart;
      }
    }

    const previewStartOffset = differenceInDays(newStart, rangeStart);
    const previewDuration = differenceInDays(newEnd, newStart) + 1;

    setTooltipPosition({ x: event.clientX, y: event.clientY });
    setDragPreview({
      taskId: dragging.taskId,
      type: dragging.type,
      startDate: newStart,
      endDate: newEnd,
      daysDelta,
      left: taskNameWidth + previewStartOffset * columnWidth,
      width: Math.max(previewDuration * columnWidth - 4, 12),
    });
  }, [columnWidth, dragging, rangeStart]);

  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!dragging) {
      return;
    }

    const deltaX = event.clientX - dragging.startX;
    const daysDelta = Math.round(deltaX / columnWidth);

    if (daysDelta === 0) {
      setDragging(null);
      setDragPreview(null);
      return;
    }

    let newStart = dragging.originalStart;
    let newEnd = dragging.originalEnd;

    if (dragging.type === 'move') {
      newStart = addDays(dragging.originalStart, daysDelta);
      newEnd = addDays(dragging.originalEnd, daysDelta);
    } else if (dragging.type === 'start') {
      newStart = addDays(dragging.originalStart, daysDelta);
      if (newStart > newEnd) {
        newStart = newEnd;
      }
    } else {
      newEnd = addDays(dragging.originalEnd, daysDelta);
      if (newEnd < newStart) {
        newEnd = newStart;
      }
    }

    onTaskUpdate(dragging.taskId, {
      start_date: format(newStart, 'yyyy-MM-dd'),
      end_date: format(newEnd, 'yyyy-MM-dd'),
    });

    setDragging(null);
    setDragPreview(null);
  }, [columnWidth, dragging, onTaskUpdate]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!dragging) {
      setDragPreview(null);
    }
  }, [dragging]);

  const handleTaskBarMouseEnter = (event: React.MouseEvent, task: Task) => {
    if (dragging) {
      return;
    }

    setHoveredTask(task);
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const handleTaskBarMouseMove = (event: React.MouseEvent) => {
    if (dragging) {
      return;
    }

    setTooltipPosition({ x: event.clientX, y: event.clientY });
  };

  const handleTaskBarMouseLeave = () => {
    setHoveredTask(null);
  };

  const handleTaskBarClick = (event: React.MouseEvent, task: Task) => {
    if (dragging) {
      return;
    }

    const now = Date.now();
    const lastClick = lastClickTimeRef.current;

    if (lastClick && lastClick.taskId === task.id && now - lastClick.time < 300) {
      event.preventDefault();
      event.stopPropagation();
      onTaskClick(task);
      lastClickTimeRef.current = null;
      return;
    }

    lastClickTimeRef.current = { taskId: task.id, time: now };
  };

  const renderDateHeader = () => {
    const weeks: { start: Date; end: Date }[] = [];
    let currentWeekStart = startOfWeek(rangeStart, { weekStartsOn: 1 });

    while (currentWeekStart <= rangeEnd) {
      weeks.push({
        start: currentWeekStart,
        end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }),
      });
      currentWeekStart = addDays(currentWeekStart, 7);
    }

    return (
      <>
        <div className="gantt-header-row gantt-months">
          <div className="gantt-header-cell gantt-header-cell-label" style={{ width: taskNameWidth }}>任务名称</div>
          {weeks.map((week) => (
            <div
              key={week.start.toISOString()}
              className="gantt-header-cell"
              style={{ width: 7 * columnWidth }}
            >
              {format(week.start, 'yyyy年M月', { locale: zhCN })}
            </div>
          ))}
        </div>
        <div className="gantt-header-row gantt-weeks">
          <div className="gantt-header-cell gantt-header-cell-label" style={{ width: taskNameWidth }}>周次</div>
          {weeks.map((week) => (
            <div
              key={`${week.start.toISOString()}-week`}
              className="gantt-header-cell"
              style={{ width: 7 * columnWidth }}
            >
              W{format(week.start, 'II')}
            </div>
          ))}
        </div>
        <div className="gantt-header-row gantt-days">
          <div className="gantt-header-cell gantt-header-cell-label" style={{ width: taskNameWidth }}>日期</div>
          <div className="gantt-days-container">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={`gantt-header-cell ${isWeekend(day) ? 'weekend' : ''} ${isSameDay(day, today) ? 'today' : ''}`}
                style={{ width: columnWidth }}
              >
                {format(day, 'd')}
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="gantt-chart">
      <div className="gantt-toolbar">
        <div className="gantt-toolbar-copy">
          <span className="gantt-toolbar-kicker">Timeline View</span>
          <h3 className="gantt-toolbar-title">任务排期面板</h3>
        </div>
        <div className="gantt-toolbar-actions">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary gantt-focus-button"
            onClick={() => scrollToCurrentWeek()}
          >
            回到当前周
          </button>

          <div className="gantt-view-modes">
          {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`btn btn-sm ${viewMode === mode ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setViewMode(mode)}
            >
              {VIEW_MODE_LABELS[mode]}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="gantt-container">
        <div className="gantt-scroll-container" ref={ganttContainerRef}>
          <div className="gantt-header">
            {renderDateHeader()}
          </div>

          <div className="gantt-body">
            <div
              className="gantt-fixed-column-backdrop"
              style={{ width: taskNameWidth }}
            />
            <div className="gantt-grid" style={{ width: taskNameWidth + days.length * columnWidth }}>
              {showTodayLine && (
                <div
                  className="gantt-today-line"
                  style={{ left: taskNameWidth + todayOffset * columnWidth + columnWidth / 2 }}
                />
              )}
              {days.map((day, index) => (
                <div
                  key={`${day.toISOString()}-grid`}
                  className={`gantt-grid-line ${isWeekend(day) ? 'weekend' : ''} ${isSameDay(day, today) ? 'today' : ''}`}
                  style={{ left: taskNameWidth + index * columnWidth, width: columnWidth }}
                />
              ))}
            </div>

            {tasks.map((task, index) => {
              const { left, width } = getTaskPosition(task);
              const isDraggingTask = dragPreview?.taskId === task.id;

              return (
                <div
                  key={task.id}
                  className="gantt-row"
                  style={{ top: index * rowHeight, height: rowHeight }}
                >
                  <div
                    className="gantt-task-name"
                    style={{ width: taskNameWidth }}
                    onDoubleClick={() => onTaskClick(task)}
                    onMouseEnter={(event) => handleTaskBarMouseEnter(event, task)}
                    onMouseMove={handleTaskBarMouseMove}
                    onMouseLeave={handleTaskBarMouseLeave}
                  >
                    <span
                      className="task-progress-dot"
                      style={{
                        background: task.progress >= 100 ? 'var(--color-success)' : task.progress > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                      }}
                    />
                    <span className="task-name-text">
                      {task.name}
                      {showProjectName && task.project_name && (
                        <span className="task-project-badge" style={{ backgroundColor: task.project_color || 'var(--color-text-muted)' }}>
                          {task.project_name}
                        </span>
                      )}
                    </span>
                  </div>

                  {isDraggingTask && dragPreview && (
                    <div
                      className="gantt-task-bar gantt-task-bar-preview"
                      style={{
                        left: dragPreview.left,
                        width: dragPreview.width,
                        backgroundColor: task.color,
                        top: (rowHeight - 24) / 2,
                      }}
                    />
                  )}

                  <div
                    className={`gantt-task-bar ${isDraggingTask ? 'gantt-task-bar-dragging' : ''}`}
                    style={{
                      left,
                      width,
                      backgroundColor: task.color,
                      top: (rowHeight - 24) / 2,
                    }}
                    onMouseDown={(event) => handleMouseDown(event, task, 'move')}
                    onClick={(event) => handleTaskBarClick(event, task)}
                    onMouseEnter={(event) => handleTaskBarMouseEnter(event, task)}
                    onMouseMove={handleTaskBarMouseMove}
                    onMouseLeave={handleTaskBarMouseLeave}
                  >
                    <div
                      className="gantt-task-progress"
                      style={{ width: `${task.progress}%` }}
                    />
                    <div
                      className="gantt-resize-handle start"
                      onMouseDown={(event) => handleMouseDown(event, task, 'start')}
                    />
                    <div
                      className="gantt-resize-handle end"
                      onMouseDown={(event) => handleMouseDown(event, task, 'end')}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dragging && dragPreview && (
        <div
          className="task-tooltip drag-preview-tooltip"
          style={{
            left: tooltipPosition.x + 12,
            top: tooltipPosition.y + 12,
          }}
        >
          <div className="tooltip-title">实时落点</div>
          <div className="tooltip-row">
            <span className="tooltip-label">开始:</span>
            <span>{format(dragPreview.startDate, 'yyyy-MM-dd')}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">结束:</span>
            <span>{format(dragPreview.endDate, 'yyyy-MM-dd')}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">位移:</span>
            <span>
              {dragPreview.daysDelta === 0
                ? '未移动'
                : `${dragPreview.daysDelta > 0 ? '+' : ''}${dragPreview.daysDelta} 天`}
            </span>
          </div>
          <div className="tooltip-hint">
            {dragPreview.type === 'move' ? '拖动整体任务条' : dragPreview.type === 'start' ? '调整开始时间' : '调整结束时间'}
          </div>
        </div>
      )}

      {hoveredTask && !dragging && (
        <div
          className="task-tooltip"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y + 10,
          }}
        >
          <div className="tooltip-title">{hoveredTask.name}</div>
          <div className="tooltip-row">
            <span className="tooltip-label">时间:</span>
            <span>{format(new Date(hoveredTask.start_date), 'yyyy-MM-dd')} 至 {format(new Date(hoveredTask.end_date), 'yyyy-MM-dd')}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">进度:</span>
            <span>{hoveredTask.progress}%</span>
          </div>
          {hoveredTask.description && (
            <div className="tooltip-row">
              <span className="tooltip-label">描述:</span>
              <span>{hoveredTask.description}</span>
            </div>
          )}
          {showProjectName && hoveredTask.project_name && (
            <div className="tooltip-row">
              <span className="tooltip-label">项目:</span>
              <span>{hoveredTask.project_name}</span>
            </div>
          )}
          <div className="tooltip-hint">双击可编辑</div>
        </div>
      )}
    </div>
  );
};

export default GanttChart;
