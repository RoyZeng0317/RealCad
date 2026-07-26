import { createSimulator } from '@circuit-lab/simulator-core';
import type { CircuitProject, SimulationState } from '@circuit-lab/shared';
import { ArduinoUnoMicrocontroller } from './microcontroller.js';

export class SimulationManager {
  private project: CircuitProject;
  private arduino: ArduinoUnoMicrocontroller | null = null;
  private animationFrameId: number | null = null;
  private running: boolean = false;

  constructor(project: CircuitProject) {
    this.project = project;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const hasArduino = this.project.components.some((c) => c.type === 'arduino_uno');
    if (hasArduino) {
      this.arduino = new ArduinoUnoMicrocontroller();
    }

    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    if (this.arduino) {
      this.arduino.step(1000);

      for (const comp of this.project.components) {
        if (comp.type === 'arduino_uno') {
          for (let pin = 0; pin < 14; pin++) {
            const state = this.arduino.getPinState(pin);
            if (state && state.mode === 'output') {
              comp.properties[`pin_${pin}`] = state.value;
            }
          }
        }
      }
    }

    const sim = createSimulator(this.project);
    const result = sim.solveDC();

    const simEvent = new CustomEvent<SimulationState>('simulation:update', { detail: result });
    window.dispatchEvent(simEvent);

    this.animationFrameId = requestAnimationFrame(this.tick);
  };
}
