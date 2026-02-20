import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import database from '../database';
import { Task, CreateTaskDto, UpdateTaskDto } from '../types';

const router = Router();

// 获取所有任务（带项目信息）
router.get('/all', (req: Request, res: Response) => {
  try {
    const tasks = database.all<Task & { project_name?: string; project_color?: string }>(
      `SELECT t.*, p.name as project_name, p.color as project_color 
       FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id 
       ORDER BY t.start_date`
    );
    const parsedTasks = tasks.map(task => ({
      ...task,
      dependencies: JSON.parse(task.dependencies as unknown as string || '[]')
    }));
    res.json(parsedTasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// 获取项目的所有任务
router.get('/project/:projectId', (req: Request, res: Response) => {
  try {
    const tasks = database.all<Task>('SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date', [req.params.projectId]);
    // 解析 dependencies JSON
    const parsedTasks = tasks.map(task => ({
      ...task,
      dependencies: JSON.parse(task.dependencies as unknown as string || '[]')
    }));
    res.json(parsedTasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// 获取单个任务
router.get('/:id', (req: Request, res: Response) => {
  try {
    const task = database.get<Task>('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({
      ...task,
      dependencies: JSON.parse(task.dependencies as unknown as string || '[]')
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// 创建任务
router.post('/', (req: Request, res: Response) => {
  try {
    const { 
      project_id, name, description, start_date, end_date, 
      progress, color, parent_id, dependencies 
    }: CreateTaskDto = req.body;
    
    if (!project_id || !name || !start_date || !end_date) {
      return res.status(400).json({ error: 'project_id, name, start_date and end_date are required' });
    }

    // 验证项目存在
    const project = database.get('SELECT id FROM projects WHERE id = ?', [project_id]);
    if (!project) {
      return res.status(400).json({ error: 'Project not found' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const depsJson = JSON.stringify(dependencies || []);
    
    database.run(
      `INSERT INTO tasks (id, project_id, name, description, start_date, end_date, progress, color, parent_id, dependencies, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, project_id, name, description || '', start_date, end_date, progress || 0, color || '#4A90D9', parent_id || null, depsJson, now, now]
    );

    const task = database.get<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    res.status(201).json({
      ...task,
      dependencies: JSON.parse((task as any)?.dependencies || '[]')
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// 更新任务
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { 
      name, description, start_date, end_date, 
      progress, color, parent_id, dependencies 
    }: UpdateTaskDto = req.body;
    
    const existing = database.get<Task>('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const now = new Date().toISOString();
    const depsJson = dependencies !== undefined ? JSON.stringify(dependencies) : existing.dependencies;
    
    database.run(
      `UPDATE tasks 
       SET name = ?, description = ?, start_date = ?, end_date = ?, progress = ?, color = ?, parent_id = ?, dependencies = ?, updated_at = ?
       WHERE id = ?`,
      [
        name ?? existing.name,
        description ?? existing.description,
        start_date ?? existing.start_date,
        end_date ?? existing.end_date,
        progress ?? existing.progress,
        color ?? existing.color,
        parent_id !== undefined ? parent_id : existing.parent_id,
        depsJson,
        now,
        req.params.id
      ]
    );

    const task = database.get<Task>('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json({
      ...task,
      dependencies: JSON.parse((task as any)?.dependencies || '[]')
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// 删除任务
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = database.get<Task>('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    database.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;