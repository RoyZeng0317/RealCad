import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { CircuitProject, PlacedComponent, Wire, SimulationState, ComponentType } from '@circuit-lab/shared';
import { v4 as uuidv4 } from 'uuid';

interface CircuitStore {
  project: CircuitProject;
  simulationState: SimulationState | null;
  isSimulating: boolean;
  viewMode: '2d' | '3d';
  selectedComponentId: string | null;
  selectedTool: 'select' | 'wire' | 'component' | 'probe';
  placingComponentType: ComponentType | null;
  collaborators: Array<{ userId: string; name: string; cursor?: any }>;

  setProject: (project: CircuitProject) => void;
  addComponent: (type: ComponentType, position: { x: number; y: number; z: number }) => void;
  moveComponent: (id: string, position: { x: number; y: number; z: number }) => void;
  removeComponent: (id: string) => void;
  updateComponentProperty: (id: string, key: string, value: number | string | boolean) => void;
  addWire: (from: { componentId: string; portId: string }, to: { componentId: string; portId: string }) => void;
  removeWire: (id: string) => void;
  setSimulationState: (state: SimulationState | null) => void;
  setIsSimulating: (v: boolean) => void;
  setViewMode: (mode: '2d' | '3d') => void;
  selectComponent: (id: string | null) => void;
  setSelectedTool: (tool: 'select' | 'wire' | 'component' | 'probe') => void;
  setPlacingComponentType: (type: ComponentType | null) => void;
  setCollaborators: (collaborators: Array<{ userId: string; name: string; cursor?: any }>) => void;
}

export const useCircuitStore = create<CircuitStore>()(
  immer((set) => ({
    project: {
      id: uuidv4(),
      name: 'Untitled Project',
      components: [],
      wires: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: false,
      viewMode: '3d',
    },
    simulationState: null,
    isSimulating: false,
    viewMode: '3d',
    selectedComponentId: null,
    selectedTool: 'select',
    placingComponentType: null,
    collaborators: [],

    setProject: (project) =>
      set((state) => {
        state.project = project;
      }),

    addComponent: (type, position) =>
      set((state) => {
        const component: PlacedComponent = {
          id: uuidv4(),
          type,
          position,
          rotation: 0,
          properties: {},
        };
        state.project.components.push(component);
        state.project.updatedAt = new Date().toISOString();
      }),

    moveComponent: (id, position) =>
      set((state) => {
        const comp = state.project.components.find((c) => c.id === id);
        if (comp) {
          comp.position = position;
          state.project.updatedAt = new Date().toISOString();
        }
      }),

    removeComponent: (id) =>
      set((state) => {
        state.project.components = state.project.components.filter((c) => c.id !== id);
        state.project.wires = state.project.wires.filter(
          (w) => w.from.componentId !== id && w.to.componentId !== id
        );
        state.project.updatedAt = new Date().toISOString();
      }),

    updateComponentProperty: (id, key, value) =>
      set((state) => {
        const comp = state.project.components.find((c) => c.id === id);
        if (comp) {
          comp.properties[key] = value;
          state.project.updatedAt = new Date().toISOString();
        }
      }),

    addWire: (from, to) =>
      set((state) => {
        const wire: Wire = {
          id: uuidv4(),
          from,
          to,
          waypoints: [],
        };
        state.project.wires.push(wire);
        state.project.updatedAt = new Date().toISOString();
      }),

    removeWire: (id) =>
      set((state) => {
        state.project.wires = state.project.wires.filter((w) => w.id !== id);
        state.project.updatedAt = new Date().toISOString();
      }),

    setSimulationState: (state) => set((s) => { s.simulationState = state; }),
    setIsSimulating: (v) => set((s) => { s.isSimulating = v; }),
    setViewMode: (mode) => set((s) => { s.viewMode = mode; }),
    selectComponent: (id) => set((s) => { s.selectedComponentId = id; }),
    setSelectedTool: (tool) => set((s) => { s.selectedTool = tool; }),
    setPlacingComponentType: (type) => set((s) => { s.placingComponentType = type; }),
    setCollaborators: (collaborators) => set((s) => { s.collaborators = collaborators; }),
  }))
);
