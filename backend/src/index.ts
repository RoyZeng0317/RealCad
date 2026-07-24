import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import passport from 'passport';
import { createServer } from 'http';
import { setupPassport } from './services/auth.js';
import { setupCollaboration } from './collab/socket.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import { getDb, closeDb } from './db/database.js';

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'circuit-lab-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

setupPassport();

app.use('/auth', authRoutes);
app.use('/api/projects', projectRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const io = setupCollaboration(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Circuit Lab server running on http://localhost:${PORT}`);
  console.log(`Client URL: ${CLIENT_URL}`);
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn('Google OAuth not configured. Authentication will not work.');
  }
});

process.on('SIGTERM', () => {
  closeDb();
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  closeDb();
  httpServer.close();
  process.exit(0);
});
