import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { getRow } from '../db/database.js';

interface CollaborationRoom {
  projectId: string;
  users: Map<string, { userId: string; name: string; cursor?: any }>;
}

const rooms = new Map<string, CollaborationRoom>();

export function setupCollaboration(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const session = (socket.request as any).session;
    if (session?.passport?.user) {
      (socket as any).userId = session.passport.user;
      next();
    } else {
      (socket as any).userId = `anon_${socket.id}`;
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${(socket as any).userId}`);

    socket.on('project:join', async (projectId: string) => {
      socket.join(`project:${projectId}`);

      if (!rooms.has(projectId)) {
        rooms.set(projectId, { projectId, users: new Map() });
      }
      const room = rooms.get(projectId)!;
      room.users.set(socket.id, {
        userId: (socket as any).userId,
        name: (socket as any).userId,
      });

      const projectData = await getProjectData(projectId);
      socket.emit('project:state', projectData);

      io.to(`project:${projectId}`).emit('collaborators:update', {
        collaborators: Array.from(room.users.values()),
        count: room.users.size,
      });

      console.log(`${(socket as any).userId} joined project ${projectId}`);
    });

    socket.on('project:leave', (projectId: string) => {
      leaveProject(socket, projectId);
    });

    socket.on('circuit:update', (projectId: string, circuitData: any) => {
      socket.to(`project:${projectId}`).emit('circuit:sync', circuitData, (socket as any).userId);
    });

    socket.on('component:add', (projectId: string, component: any) => {
      socket.to(`project:${projectId}`).emit('component:added', component, (socket as any).userId);
    });

    socket.on('component:move', (projectId: string, componentId: string, position: any) => {
      socket.to(`project:${projectId}`).emit('component:moved', componentId, position, (socket as any).userId);
    });

    socket.on('component:remove', (projectId: string, componentId: string) => {
      socket.to(`project:${projectId}`).emit('component:removed', componentId, (socket as any).userId);
    });

    socket.on('wire:add', (projectId: string, wire: any) => {
      socket.to(`project:${projectId}`).emit('wire:added', wire, (socket as any).userId);
    });

    socket.on('wire:remove', (projectId: string, wireId: string) => {
      socket.to(`project:${projectId}`).emit('wire:removed', wireId, (socket as any).userId);
    });

    socket.on('cursor:move', (projectId: string, cursor: any) => {
      const room = rooms.get(projectId);
      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          user.cursor = cursor;
        }
      }
      socket.to(`project:${projectId}`).emit('cursor:moved', (socket as any).userId, cursor);
    });

    socket.on('code:change', (projectId: string, code: string) => {
      socket.to(`project:${projectId}`).emit('code:synced', code, (socket as any).userId);
    });

    socket.on('simulation:start', (projectId: string) => {
      socket.to(`project:${projectId}`).emit('simulation:started', (socket as any).userId);
    });

    socket.on('simulation:stop', (projectId: string) => {
      socket.to(`project:${projectId}`).emit('simulation:stopped', (socket as any).userId);
    });

    socket.on('disconnect', () => {
      for (const [projectId, room] of rooms) {
        if (room.users.has(socket.id)) {
          leaveProject(socket, projectId);
        }
      }
      console.log(`User disconnected: ${(socket as any).userId}`);
    });
  });

  return io;
}

function leaveProject(socket: Socket, projectId: string): void {
  const room = rooms.get(projectId);
  if (room) {
    room.users.delete(socket.id);
    if (room.users.size === 0) {
      rooms.delete(projectId);
    } else {
      socket.to(`project:${projectId}`).emit('collaborators:update', {
        collaborators: Array.from(room.users.values()),
        count: room.users.size,
      });
    }
  }
  socket.leave(`project:${projectId}`);
}

async function getProjectData(projectId: string): Promise<any> {
  try {
    const project = await getRow('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (project) {
      return { ...project, data: typeof project.data === 'string' ? JSON.parse(project.data) : (project.data ?? {}) };
    }
  } catch { }
  return null;
}
