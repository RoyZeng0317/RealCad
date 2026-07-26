import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/circuit_lab',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]): Promise<pg.QueryResult> {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function getRow(text: string, params?: any[]): Promise<any> {
  const result = await query(text, params);
  return result.rows[0] ?? null;
}

export async function getRows(text: string, params?: any[]): Promise<any[]> {
  const result = await query(text, params);
  return result.rows;
}

export async function run(text: string, params?: any[]): Promise<pg.QueryResult> {
  return query(text, params);
}

export async function initSchema(): Promise<void> {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled Project',
      description TEXT DEFAULT '',
      owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}',
      is_public BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS project_collaborators (
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'editor',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess JSONB NOT NULL,
      expired TIMESTAMPTZ NOT NULL
    );
  `);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
