import { describe, it, expect } from 'vitest';
import { createSimulator, COMPONENT_LIBRARY } from '../src/index.js';
import type { CircuitProject } from '@circuit-lab/shared';

function makeProject(): CircuitProject {
  return {
    id: 'test-1',
    name: 'Test Circuit',
    components: [
      {
        id: 'bat1',
        type: 'battery',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        properties: { voltage: 9 },
      },
      {
        id: 'r1',
        type: 'resistor',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        properties: { resistance: 1000 },
      },
      {
        id: 'led1',
        type: 'led',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        properties: { forwardVoltage: 2.0 },
      },
    ],
    wires: [
      {
        id: 'w1',
        from: { componentId: 'bat1', portId: 'positive' },
        to: { componentId: 'r1', portId: 'p1' },
        waypoints: [],
      },
      {
        id: 'w2',
        from: { componentId: 'r1', portId: 'p2' },
        to: { componentId: 'led1', portId: 'anode' },
        waypoints: [],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPublic: false,
    viewMode: '3d',
  };
}

describe('CircuitSimulator', () => {
  it('should create a simulator instance', () => {
    const sim = createSimulator(makeProject());
    expect(sim).toBeDefined();
  });

  it('should solve DC for a simple circuit', () => {
    const sim = createSimulator(makeProject());
    const result = sim.solveDC();
    expect(result).toBeDefined();
    expect(result.time).toBe(0);
    expect(result.componentStates).toBeDefined();
  });

  it('should run transient simulation', () => {
    const sim = createSimulator(makeProject());
    const results = sim.solveTransient(5);
    expect(results).toHaveLength(5);
    expect(results[0].time).toBe(0);
    expect(results[4].time).toBe(0.004);
  });

  it('should handle empty circuit', () => {
    const emptyProject: CircuitProject = {
      id: 'empty',
      name: 'Empty',
      components: [],
      wires: [],
      createdAt: '',
      updatedAt: '',
      isPublic: false,
      viewMode: '3d',
    };
    const sim = createSimulator(emptyProject);
    const result = sim.solveDC();
    expect(Object.keys(result.nodeVoltages)).toHaveLength(0);
  });
});

describe('Component Library', () => {
  it('should have all required component types', () => {
    const types = Object.keys(COMPONENT_LIBRARY);
    expect(types).toContain('resistor');
    expect(types).toContain('capacitor');
    expect(types).toContain('battery');
    expect(types).toContain('led');
    expect(types).toContain('arduino_uno');
    expect(types).toContain('raspberry_pi_4');
    expect(types).toContain('esp32');
    expect(types.length).toBeGreaterThan(30);
  });

  it('should have definitions with correct structure', () => {
    for (const [type, def] of Object.entries(COMPONENT_LIBRARY)) {
      expect(def.type).toBe(type);
      expect(def.name).toBeDefined();
      expect(def.category).toBeDefined();
      expect(def.ports.length).toBeGreaterThan(0);
      expect(def.size).toBeDefined();
      expect(def.size.width).toBeGreaterThan(0);
    }
  });
});
