import { Server as SocketIOServer } from 'socket.io';
import { getRow } from '../db/database.js';
const rooms = new Map();
export function setupCollaboration(httpServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
            credentials: true,
        },
    });
    io.use((socket, next) => {
        const session = socket.request.session;
        if (session?.passport?.user) {
            socket.userId = session.passport.user;
            next();
        }
        else {
            socket.userId = `anon_${socket.id}`;
            next();
        }
    });
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId}`);
        socket.on('project:join', async (projectId) => {
            socket.join(`project:${projectId}`);
            if (!rooms.has(projectId)) {
                rooms.set(projectId, { projectId, users: new Map() });
            }
            const room = rooms.get(projectId);
            room.users.set(socket.id, {
                userId: socket.userId,
                name: socket.userId,
            });
            const projectData = await getProjectData(projectId);
            socket.emit('project:state', projectData);
            io.to(`project:${projectId}`).emit('collaborators:update', {
                collaborators: Array.from(room.users.values()),
                count: room.users.size,
            });
            console.log(`${socket.userId} joined project ${projectId}`);
        });
        socket.on('project:leave', (projectId) => {
            leaveProject(socket, projectId);
        });
        socket.on('circuit:update', (projectId, circuitData) => {
            socket.to(`project:${projectId}`).emit('circuit:sync', circuitData, socket.userId);
        });
        socket.on('component:add', (projectId, component) => {
            socket.to(`project:${projectId}`).emit('component:added', component, socket.userId);
        });
        socket.on('component:move', (projectId, componentId, position) => {
            socket.to(`project:${projectId}`).emit('component:moved', componentId, position, socket.userId);
        });
        socket.on('component:remove', (projectId, componentId) => {
            socket.to(`project:${projectId}`).emit('component:removed', componentId, socket.userId);
        });
        socket.on('wire:add', (projectId, wire) => {
            socket.to(`project:${projectId}`).emit('wire:added', wire, socket.userId);
        });
        socket.on('wire:remove', (projectId, wireId) => {
            socket.to(`project:${projectId}`).emit('wire:removed', wireId, socket.userId);
        });
        socket.on('cursor:move', (projectId, cursor) => {
            const room = rooms.get(projectId);
            if (room) {
                const user = room.users.get(socket.id);
                if (user) {
                    user.cursor = cursor;
                }
            }
            socket.to(`project:${projectId}`).emit('cursor:moved', socket.userId, cursor);
        });
        socket.on('code:change', (projectId, code) => {
            socket.to(`project:${projectId}`).emit('code:synced', code, socket.userId);
        });
        socket.on('simulation:start', (projectId) => {
            socket.to(`project:${projectId}`).emit('simulation:started', socket.userId);
        });
        socket.on('simulation:stop', (projectId) => {
            socket.to(`project:${projectId}`).emit('simulation:stopped', socket.userId);
        });
        socket.on('disconnect', () => {
            for (const [projectId, room] of rooms) {
                if (room.users.has(socket.id)) {
                    leaveProject(socket, projectId);
                }
            }
            console.log(`User disconnected: ${socket.userId}`);
        });
    });
    return io;
}
function leaveProject(socket, projectId) {
    const room = rooms.get(projectId);
    if (room) {
        room.users.delete(socket.id);
        if (room.users.size === 0) {
            rooms.delete(projectId);
        }
        else {
            socket.to(`project:${projectId}`).emit('collaborators:update', {
                collaborators: Array.from(room.users.values()),
                count: room.users.size,
            });
        }
    }
    socket.leave(`project:${projectId}`);
}
async function getProjectData(projectId) {
    try {
        const project = await getRow('SELECT * FROM projects WHERE id = $1', [projectId]);
        if (project) {
            return { ...project, data: typeof project.data === 'string' ? JSON.parse(project.data) : (project.data ?? {}) };
        }
    }
    catch { }
    return null;
}
//# sourceMappingURL=socket.js.map