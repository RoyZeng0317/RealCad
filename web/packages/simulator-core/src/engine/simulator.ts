import type { CircuitProject, PlacedComponent, Wire, SimulationState, SimulationConfig } from '@circuit-lab/shared';
import { COMPONENT_LIBRARY } from '../components/library.js';
import { DeviceStamp, buildMNAMatrix, solveMNA, MNASolution } from '../solver/mna.js';

interface NodeMap {
  nodeId: number;
}

function buildNetlist(project: CircuitProject): { devices: DeviceStamp[]; numNodes: number } {
  const nodeMap = new Map<string, number>();
  let nextNode = 1;
  const devices: DeviceStamp[] = [];

  function getNode(key: string): number {
    if (key === 'gnd' || key === 'GND' || key === '0') return 0;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, nextNode++);
    }
    return nodeMap.get(key)!;
  }

  for (const comp of project.components) {
    const def = COMPONENT_LIBRARY[comp.type];
    if (!def) continue;
    const connectedWires = project.wires.filter(
      (w) => w.from.componentId === comp.id || w.to.componentId === comp.id
    );
    if (connectedWires.length === 0) continue;

    const pinNodes = new Map<string, number>();
    for (const port of def.ports) {
      const wire = connectedWires.find(
        (w) =>
          (w.from.componentId === comp.id && w.from.portId === port.id) ||
          (w.to.componentId === comp.id && w.to.portId === port.id)
      );
      if (wire) {
        const otherEnd =
          wire.from.componentId === comp.id
            ? project.components.find((c) => c.id === wire.to.componentId)
            : project.components.find((c) => c.id === wire.from.componentId);
        if (otherEnd) {
          const otherPort =
            wire.from.componentId === otherEnd.id ? wire.from.portId : wire.to.portId;
          const nodeKey = `${wire.id}_${comp.id}_${port.id}`;
          pinNodes.set(port.id, getNode(nodeKey));
        }
      }
    }

    if (pinNodes.size < 2) continue;

    switch (comp.type) {
      case 'resistor': {
        const p1 = pinNodes.get('p1') ?? 0;
        const p2 = pinNodes.get('p2') ?? 0;
        const resistance = (comp.properties.resistance as number) ?? 1000;
        if (resistance > 0) {
          devices.push({ type: 'R', name: `R_${comp.id}`, positiveNode: p1, negativeNode: p2, value: resistance });
        }
        break;
      }
      case 'battery':
      case 'voltage_source': {
        const p = pinNodes.get('positive') ?? 0;
        const n = pinNodes.get('negative') ?? 0;
        const voltage = (comp.properties.voltage as number) ?? 5;
        devices.push({ type: 'V', name: `V_${comp.id}`, positiveNode: p, negativeNode: n, value: voltage });
        break;
      }
      case 'led': {
        const anode = pinNodes.get('anode') ?? 0;
        const cathode = pinNodes.get('cathode') ?? 0;
        devices.push({ type: 'D', name: `D_${comp.id}`, positiveNode: anode, negativeNode: cathode, value: 1e-12, extraParam: 2.0 });
        break;
      }
      case 'diode': {
        const anode = pinNodes.get('anode') ?? 0;
        const cathode = pinNodes.get('cathode') ?? 0;
        devices.push({ type: 'D', name: `D_${comp.id}`, positiveNode: anode, negativeNode: cathode, value: 1e-12 });
        break;
      }
    }
  }

  return { devices, numNodes: nextNode };
}

export class CircuitSimulator {
  private project: CircuitProject;
  private config: SimulationConfig;
  private mnaSolution: MNASolution | null = null;

  constructor(project: CircuitProject, config?: Partial<SimulationConfig>) {
    this.project = project;
    this.config = {
      dt: 1e-3,
      tmax: 1.0,
      method: 'trapezoidal',
      reltol: 1e-3,
      vntol: 1e-6,
      abstol: 1e-12,
      maxIter: 100,
      ...config,
    };
  }

  solveDC(): SimulationState {
    const { devices, numNodes } = buildNetlist(this.project);

    if (numNodes <= 1 || devices.length === 0) {
      return {
        time: 0,
        nodeVoltages: {},
        branchCurrents: {},
        componentStates: {},
      };
    }

    const vsCount = devices.filter((d) => d.type === 'V').length;
    const { A, b } = buildMNAMatrix(devices, numNodes, vsCount);
    const mnaResult = solveMNA(A, b);
    this.mnaSolution = mnaResult;

    const nodeVoltages: Record<string, number> = {};
    const componentStates: Record<string, Record<string, number | boolean>> = {};

    const seenNodes = new Set<string>();
    let nodeIdx = 0;
    for (const comp of this.project.components) {
      const def = COMPONENT_LIBRARY[comp.type];
      if (!def) continue;
      const connectedWires = this.project.wires.filter(
        (w) => w.from.componentId === comp.id || w.to.componentId === comp.id
      );
      for (const port of def.ports) {
        const wire = connectedWires.find(
          (w) =>
            (w.from.componentId === comp.id && w.from.portId === port.id) ||
            (w.to.componentId === comp.id && w.to.portId === port.id)
        );
        if (wire) {
          const key = `${wire.id}_${comp.id}_${port.id}`;
          if (!seenNodes.has(key)) {
            seenNodes.add(key);
            if (nodeIdx < mnaResult.voltages.length) {
              nodeVoltages[key] = mnaResult.voltages[nodeIdx];
            }
            nodeIdx++;
          }
        }
      }

      if (comp.type === 'led' || comp.type === 'diode') {
        const anodeKey = `${comp.id}_anode_voltage`;
        const cathodeKey = `${comp.id}_cathode_voltage`;
        const vFwd = (nodeVoltages[anodeKey] ?? 0) - (nodeVoltages[cathodeKey] ?? 0);
        componentStates[comp.id] = {
          forwardVoltage: vFwd,
          conducting: vFwd > 1.5,
          brightness: Math.min(1, Math.max(0, (vFwd - 1.5) / 2.0)),
        };
      }
    }

    return {
      time: 0,
      nodeVoltages,
      branchCurrents: {},
      componentStates,
    };
  }

  solveTransient(steps: number): SimulationState[] {
    const states: SimulationState[] = [];
    for (let i = 0; i < steps; i++) {
      const state = this.solveDC();
      state.time = i * this.config.dt;
      states.push(state);
    }
    return states;
  }
}

export function createSimulator(project: CircuitProject, config?: Partial<SimulationConfig>): CircuitSimulator {
  return new CircuitSimulator(project, config);
}
