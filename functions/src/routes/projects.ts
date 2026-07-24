import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getRows, getRow, run } from '../db/database.js';

const router = Router();

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const projects = await getRows(
      `SELECT p.*, u.name as owner_name
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.owner_id = $1 OR p.id IN (
         SELECT project_id FROM project_collaborators WHERE user_id = $1
       )
       ORDER BY p.updated_at DESC`,
      [(req.user as any).id]
    );
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/public', async (_req, res) => {
  try {
    const projects = await getRows(
      `SELECT p.*, u.name as owner_name
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.is_public = TRUE
       ORDER BY p.updated_at DESC
       LIMIT 50`
    );
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await getRow(
      'SELECT p.*, u.name as owner_name FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = $1',
      [req.params.id]
    );
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({
      ...project,
      is_public: !!project.is_public,
      data: typeof project.data === 'string' ? JSON.parse(project.data) : (project.data ?? {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.post('/', isAuthenticated, async (req, res) => {
  try {
    const id = uuidv4();
    const { name, description, data, isPublic } = req.body;
    await run(
      'INSERT INTO projects (id, name, description, owner_id, data, is_public) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, name ?? 'Untitled Project', description ?? '', (req.user as any).id, JSON.stringify(data ?? {}), isPublic ?? false]
    );
    const project = await getRow('SELECT * FROM projects WHERE id = $1', [id]);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const project = await getRow('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const userId = (req.user as any).id;
    const isOwner = project.owner_id === userId;
    const collab = await getRow(
      'SELECT 1 FROM project_collaborators WHERE project_id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (!isOwner && !collab) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { name, description, data, isPublic } = req.body;
    await run(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        data = COALESCE($3, data),
        is_public = COALESCE($4, is_public),
        updated_at = NOW()
       WHERE id = $5`,
      [
        name ?? null,
        description ?? null,
        data ? JSON.stringify(data) : null,
        isPublic !== undefined ? isPublic : null,
        req.params.id,
      ]
    );
    const updated = await getRow('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const project = await getRow('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (project.owner_id !== (req.user as any).id) {
      return res.status(403).json({ error: 'Only owner can delete' });
    }
    await run('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
