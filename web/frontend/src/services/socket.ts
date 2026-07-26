import { io, Socket } from 'socket.io-client';
import { useCircuitStore } from '../stores/circuitStore.js';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(window.location.origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('circuit:sync', (circuitData: any, userId: string) => {
    const store = useCircuitStore.getState();
    if (circuitData.components) {
      store.setProject({ ...store.project, components: circuitData.components, wires: circuitData.wires });
    }
  });

  socket.on('component:added', (component: any, userId: string) => {
    // Handled via circuit:sync
  });

  socket.on('component:moved', (componentId: string, position: any, userId: string) => {
    const store = useCircuitStore.getState();
    store.moveComponent(componentId, position);
  });

  socket.on('component:removed', (componentId: string) => {
    const store = useCircuitStore.getState();
    store.removeComponent(componentId);
  });

  socket.on('wire:added', (wire: any) => {
    // Handled via circuit:sync
  });

  socket.on('wire:removed', (wireId: string) => {
    const store = useCircuitStore.getState();
    store.removeWire(wireId);
  });

  socket.on('collaborators:update', (data: { collaborators: any[]; count: number }) => {
    const store = useCircuitStore.getState();
    store.setCollaborators(data.collaborators);
  });

  socket.on('cursor:moved', (userId: string, cursor: any) => {
    // Cursor position updates for collaborative editing
  });

  socket.on('code:synced', (code: string, userId: string) => {
    // Code sync from collaborator
  });

  return socket;
}

export function joinProject(projectId: string): void {
  const s = getSocket();
  if (s) {
    s.emit('project:join', projectId);
  }
}

export function leaveProject(projectId: string): void {
  const s = getSocket();
  if (s) {
    s.emit('project:leave', projectId);
  }
}

export function emitCircuitUpdate(projectId: string, circuitData: any): void {
  const s = getSocket();
  if (s) {
    s.emit('circuit:update', projectId, circuitData);
  }
}

export function emitComponentAdd(projectId: string, component: any): void {
  const s = getSocket();
  if (s) {
    s.emit('component:add', projectId, component);
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
