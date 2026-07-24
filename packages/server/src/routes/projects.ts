import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';

const router = Router();

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

router.get('/', isAuthenticated, (req, res) => {
  const db = getDb();
  const projects = db
    .prepare(
      `SELECT p.*, u.name as owner_name
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.owner_id = ? OR p.id IN (
         SELECT project_id FROM project_collaborators WHERE user_id = ?
       )
       ORDER BY p.updated_at DESC`
    )
    .all((req.user as any).id, (req.user as any).id);
  res.json(projects);
});

router.get('/public', (_req, res) => {
  const db = getDb();
  const projects = db
    .prepare(
      `SELECT p.*, u.name as owner_name
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.is_public = 1
       ORDER BY p.updated_at DESC
       LIMIT 50`
    )
    .all();
  res.json(projects);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const project = db
    .prepare('SELECT p.*, u.name as owner_name FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = ?')
    .get(req.params.id) as any;
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({
    ...project,
    is_public: !!project.is_public,
    data: JSON.parse(project.data || '{}'),
  });
});

router.post('/', isAuthenticated, (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const { name, description, data, isPublic } = req.body;
  db.prepare(
    'INSERT INTO projects (id, name, description, owner_id, data, is_public) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name ?? 'Untitled Project', description ?? '', (req.user as any).id, JSON.stringify(data ?? {}), isPublic ? 1 : 0);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.put('/:id', isAuthenticated, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const userId = (req.user as any).id;
  const isOwner = project.owner_id === userId;
  const isCollaborator = db
    .prepare('SELECT 1 FROM project_collaborators WHERE project_id = ? AND user_id = ?')
    .get(req.params.id, userId);
  if (!isOwner && !isCollaborator) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { name, description, data, isPublic } = req.body;
  db.prepare(
    `UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      data = COALESCE(?, data),
      is_public = COALESCE(?, is_public),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? null,
    description ?? null,
    data ? JSON.stringify(data) : null,
    isPublic !== undefined ? (isPublic ? 1 : 0) : null,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', isAuthenticated, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (project.owner_id !== (req.user as any).id) {
    return res.status(403).json({ error: 'Only owner can delete' });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
