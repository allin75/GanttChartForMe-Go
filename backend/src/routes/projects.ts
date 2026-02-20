import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import database from '../database';
import { Project, CreateProjectDto, UpdateProjectDto } from '../types';

const router = Router();

// 获取所有项目
router.get('/', (req: Request, res: Response) => {
  try {
    const projects = database.all<Project>('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// 获取单个项目
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = database.get<Project>('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// 创建项目
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, color }: CreateProjectDto = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    
    database.run(
      `INSERT INTO projects (id, name, description, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, description || '', color || '#4A90D9', now, now]
    );

    const project = database.get<Project>('SELECT * FROM projects WHERE id = ?', [id]);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// 更新项目
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, description, color }: UpdateProjectDto = req.body;
    const existing = database.get<Project>('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const now = new Date().toISOString();
    database.run(
      `UPDATE projects 
       SET name = ?, description = ?, color = ?, updated_at = ?
       WHERE id = ?`,
      [
        name ?? existing.name,
        description ?? existing.description,
        color ?? existing.color,
        now,
        req.params.id
      ]
    );

    const project = database.get<Project>('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// 删除项目
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = database.get<Project>('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    database.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;