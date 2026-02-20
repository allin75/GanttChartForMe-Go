import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { format, differenceInDays, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isWeekend, isSameDay } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface GanttChartProps {
  tasks: Task[];
  onTaskUpdate: (id: string, data: { start_date?: string; end_date?: string }) => void;
  onTaskClick: (task: Task) => void;
  showProjectName?: boolean;
}

type ViewMode = 'day' | 'week' | 'month';

const GanttChart: React.FC<GanttChartProps> = ({ tasks, onTaskUpdate, onTaskClick, showProjectName = false }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ taskId: string; type: 'move' | 'start' | 'end'; startX: number; originalStart: Date; originalEnd: Date } | null>(null);
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const lastClickTimeRef = useRef<{ taskId: string; time: number } | null>(null);

  // 计算日期范围
  const getDateRange = useCallback(() => {
    if (tasks.length === 0) {
      const today = new Date();
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    }

    const dates = tasks.flatMap(t => [new Date(t.start_date), new Date(t.end_date)]);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // 根据视图模式扩展范围
    const start = startOfWeek(addDays(minDate, -7), { weekStartsOn: 1 });
    const end = addDays(maxDate, 14);

    return { start, end };
  }, [tasks]);

  const { start: rangeStart, end: rangeEnd } = getDateRange();

  // 生成日期列
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  // 计算列宽
  const getColumnWidth = () => {
    switch (viewMode) {
      case 'day': return 60;
      case 'week': return 40;
      case 'month': return 20;
    }
  };

  const columnWidth = getColumnWidth();
  const rowHeight = 40;
  const taskNameWidth = 200;

  // 计算任务条位置
  const getTaskPosition = (task: Task) => {
    const startDate = new Date(task.start_date);
    const endDate = new Date(task.end_date);
    const startOffset = differenceInDays(startDate, rangeStart);
    const duration = differenceInDays(endDate, startDate) + 1;

    return {
      left: taskNameWidth + startOffset * columnWidth,
      width: duration * columnWidth - 4,
    };
  };

  // 拖拽处理
  const handleMouseDown = (e: React.MouseEvent, task: Task, type: 'move' | 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({
      taskId: task.id,
      type,
      startX: e.clientX,
      originalStart: new Date(task.start_date),
      originalEnd: new Date(task.end_date),
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;

    const deltaX = e.clientX - dragging.startX;
    const daysDelta = Math.round(deltaX / columnWidth);

    if (dragging.type === 'move') {
      const newStart = addDays(dragging.originalStart, daysDelta);
      const newEnd = addDays(dragging.originalEnd, daysDelta);
      // 实时更新UI（不保存）
    } else if (dragging.type === 'start') {
      const newStart = addDays(dragging.originalStart, daysDelta);
      // 实时更新UI
    } else if (dragging.type === 'end') {
      const newEnd = addDays(dragging.originalEnd, daysDelta);
      // 实时更新UI
    }
  }, [dragging, columnWidth]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!dragging) return;

    const deltaX = e.clientX - dragging.startX;
    const daysDelta = Math.round(deltaX / columnWidth);

    // 如果几乎没有移动，不更新
    if (daysDelta === 0) {
      setDragging(null);
      return;
    }

    let newStart = dragging.originalStart;
    let newEnd = dragging.originalEnd;

    if (dragging.type === 'move') {
      newStart = addDays(dragging.originalStart, daysDelta);
      newEnd = addDays(dragging.originalEnd, daysDelta);
    } else if (dragging.type === 'start') {
      newStart = addDays(dragging.originalStart, daysDelta);
      if (newStart > newEnd) newStart = newEnd;
    } else if (dragging.type === 'end') {
      newEnd = addDays(dragging.originalEnd, daysDelta);
      if (newEnd < newStart) newEnd = newStart;
    }

    onTaskUpdate(dragging.taskId, {
      start_date: format(newStart, 'yyyy-MM-dd'),
      end_date: format(newEnd, 'yyyy-MM-dd'),
    });

    setDragging(null);
  }, [dragging, onTaskUpdate]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // 同步水平滚动
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollOffset(e.currentTarget.scrollLeft);
  };

  // 今日线
  const today = new Date();
  const todayOffset = differenceInDays(today, rangeStart);
  const showTodayLine = todayOffset >= 0 && todayOffset < days.length;

  // 处理任务条的鼠标进入
  const handleTaskBarMouseEnter = (e: React.MouseEvent, task: Task) => {
    if (dragging) return;
    setHoveredTask(task);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  // 处理任务条的鼠标移动
  const handleTaskBarMouseMove = (e: React.MouseEvent) => {
    if (dragging) return;
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  // 处理任务条的鼠标离开
  const handleTaskBarMouseLeave = () => {
    setHoveredTask(null);
  };

  // 处理任务条点击（区分单击和双击）
  const handleTaskBarClick = (e: React.MouseEvent, task: Task) => {
    // 如果刚刚完成拖拽，忽略这次点击
    if (dragging) return;

    const now = Date.now();
    const lastClick = lastClickTimeRef.current;

    // 检查是否是双击（同一任务，间隔小于300ms）
    if (lastClick && lastClick.taskId === task.id && now - lastClick.time < 300) {
      // 双击：打开编辑框
      e.preventDefault();
      e.stopPropagation();
      onTaskClick(task);
      lastClickTimeRef.current = null;
    } else {
      // 单击：只记录时间，不执行任何操作
      lastClickTimeRef.current = { taskId: task.id, time: now };
    }
  };

  // 渲染日期头部
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
        {/* 月份行 */}
        <div className="gantt-header-row gantt-months">
          <div className="gantt-header-cell" style={{ width: taskNameWidth }}>任务名称</div>
          {weeks.map((week, i) => (
            <div 
              key={i} 
              className="gantt-header-cell"
              style={{ width: 7 * columnWidth }}
            >
              {format(week.start, 'yyyy年MM月', { locale: zhCN })}
            </div>
          ))}
        </div>
        {/* 周行 */}
        <div className="gantt-header-row gantt-weeks">
          <div className="gantt-header-cell" style={{ width: taskNameWidth }}>周</div>
          {weeks.map((week, i) => (
            <div 
              key={i} 
              className="gantt-header-cell"
              style={{ width: 7 * columnWidth }}
            >
              W{format(week.start, 'w')}
            </div>
          ))}
        </div>
        {/* 日期行 */}
        <div className="gantt-header-row gantt-days">
          <div className="gantt-header-cell" style={{ width: taskNameWidth }}>日</div>
          <div className="gantt-days-container">
            {days.map((day, i) => (
              <div 
                key={i} 
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
        <div className="gantt-view-modes">
          <button 
            className={`btn btn-sm ${viewMode === 'day' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setViewMode('day')}
          >
            日
          </button>
          <button 
            className={`btn btn-sm ${viewMode === 'week' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setViewMode('week')}
          >
            周
          </button>
          <button 
            className={`btn btn-sm ${viewMode === 'month' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setViewMode('month')}
          >
            月
          </button>
        </div>
      </div>
      
      <div className="gantt-container" ref={containerRef}>
        <div className="gantt-header">
          {renderDateHeader()}
        </div>
        
        <div className="gantt-body" onScroll={handleScroll}>
          {/* 网格背景 */}
          <div className="gantt-grid" style={{ width: taskNameWidth + days.length * columnWidth }}>
            {/* 今日线 */}
            {showTodayLine && (
              <div 
                className="gantt-today-line"
                style={{ left: taskNameWidth + todayOffset * columnWidth + columnWidth / 2 }}
              />
            )}
            {/* 垂直网格线 */}
            {days.map((day, i) => (
              <div 
                key={i} 
                className={`gantt-grid-line ${isWeekend(day) ? 'weekend' : ''} ${isSameDay(day, today) ? 'today' : ''}`}
                style={{ left: taskNameWidth + i * columnWidth, width: columnWidth }}
              />
            ))}
          </div>

          {/* 任务行 */}
          {tasks.map((task, index) => {
            const { left, width } = getTaskPosition(task);
            return (
              <div 
                key={task.id} 
                className="gantt-row"
                style={{ top: index * rowHeight, height: rowHeight }}
              >
                {/* 任务名称 */}
                <div 
                  className="gantt-task-name"
                  style={{ width: taskNameWidth }}
                  onDoubleClick={() => onTaskClick(task)}
                  onMouseEnter={(e) => handleTaskBarMouseEnter(e, task)}
                  onMouseMove={handleTaskBarMouseMove}
                  onMouseLeave={handleTaskBarMouseLeave}
                >
                  <span className="task-progress-dot" style={{ 
                    background: task.progress >= 100 ? '#28a745' : task.progress > 0 ? '#ffc107' : '#6c757d'
                  }} />
                  <span className="task-name-text">
                    {task.name}
                    {showProjectName && task.project_name && (
                      <span className="task-project-badge" style={{ backgroundColor: task.project_color || '#6c757d' }}>
                        {task.project_name}
                      </span>
                    )}
                  </span>
                </div>
                
                {/* 任务条 */}
                <div
                  className="gantt-task-bar"
                  style={{
                    left,
                    width,
                    backgroundColor: task.color,
                    top: (rowHeight - 24) / 2,
                  }}
                  onClick={(e) => handleTaskBarClick(e, task)}
                  onMouseEnter={(e) => handleTaskBarMouseEnter(e, task)}
                  onMouseMove={handleTaskBarMouseMove}
                  onMouseLeave={handleTaskBarMouseLeave}
                >
                  {/* 进度 */}
                  <div 
                    className="gantt-task-progress"
                    style={{ width: `${task.progress}%` }}
                  />
                  
                  {/* 拖拽手柄 */}
                  <div 
                    className="gantt-resize-handle start"
                    onMouseDown={(e) => handleMouseDown(e, task, 'start')}
                  />
                  <div 
                    className="gantt-resize-handle end"
                    onMouseDown={(e) => handleMouseDown(e, task, 'end')}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 任务信息提示框 */}
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
            <span className="tooltip-label">时间：</span>
            <span>{format(new Date(hoveredTask.start_date), 'yyyy-MM-dd')} ~ {format(new Date(hoveredTask.end_date), 'yyyy-MM-dd')}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">进度：</span>
            <span>{hoveredTask.progress}%</span>
          </div>
          {hoveredTask.description && (
            <div className="tooltip-row">
              <span className="tooltip-label">描述：</span>
              <span>{hoveredTask.description}</span>
            </div>
          )}
          {showProjectName && hoveredTask.project_name && (
            <div className="tooltip-row">
              <span className="tooltip-label">项目：</span>
              <span>{hoveredTask.project_name}</span>
            </div>
          )}
          <div className="tooltip-hint">双击编辑</div>
        </div>
      )}
    </div>
  );
};

export default GanttChart;