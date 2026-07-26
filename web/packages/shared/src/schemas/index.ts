import type { CircuitProject, SimulationConfig } from '../types/index.js';

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  dt: 1e-3,
  tmax: 1.0,
  method: 'trapezoidal',
  reltol: 1e-3,
  vntol: 1e-6,
  abstol: 1e-12,
  maxIter: 100,
};

export const DEFAULT_PROJECT: Omit<CircuitProject, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Untitled Project',
  description: '',
  components: [],
  wires: [],
  ownerId: undefined,
  collaborators: [],
  isPublic: false,
  viewMode: '3d',
};

export const COMPONENT_COLORS: Record<string, string> = {
  resistor: '#cc6633',
  capacitor: '#3366cc',
  inductor: '#33cc66',
  diode: '#333333',
  led: '#ff0000',
  npn_transistor: '#663399',
  pnp_transistor: '#993366',
  battery: '#33cc33',
  wire: '#336699',
};
