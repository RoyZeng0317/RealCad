export interface MicrocontrollerState {
  type: 'arduino' | 'esp32' | 'raspberry_pi';
  running: boolean;
  clockSpeed: number;
  pins: Record<string, PinState>;
  serialOutput: string[];
}

export interface PinState {
  mode: 'input' | 'output' | 'input_pullup';
  value: number;
  analogValue: number;
  pwmValue: number;
}

export interface MicrocontrollerIO {
  readPin(pin: number): number;
  writePin(pin: number, value: number): void;
  readSerial(): string;
  writeSerial(data: string): void;
  step(cycles: number): void;
  reset(): void;
}

export abstract class BaseMicrocontroller implements MicrocontrollerIO {
  protected pins: Map<number, PinState> = new Map();
  protected serialBuffer: string[] = [];
  protected clockSpeed: number;
  protected cycleCount: number = 0;

  constructor(clockSpeed: number) {
    this.clockSpeed = clockSpeed;
    for (let i = 0; i < 40; i++) {
      this.pins.set(i, { mode: 'input', value: 0, analogValue: 0, pwmValue: 0 });
    }
  }

  readPin(pin: number): number {
    return this.pins.get(pin)?.value ?? 0;
  }

  writePin(pin: number, value: number): void {
    const state = this.pins.get(pin);
    if (state) {
      state.value = value;
      state.mode = 'output';
    }
  }

  readSerial(): string {
    return this.serialBuffer.shift() ?? '';
  }

  writeSerial(data: string): void {
    this.serialBuffer.push(data);
  }

  getPinState(pin: number): PinState | undefined {
    return this.pins.get(pin);
  }

  getAllPinStates(): Record<string, PinState> {
    const result: Record<string, PinState> = {};
    for (const [pin, state] of this.pins) {
      result[`D${pin}`] = state;
    }
    return result;
  }

  abstract step(cycles: number): void;
  abstract reset(): void;
}

export class ArduinoUnoMicrocontroller extends BaseMicrocontroller {
  private program: Uint16Array = new Uint16Array();
  private pc: number = 0;
  private registers: Uint8Array = new Uint8Array(32);
  private sram: Uint8Array = new Uint8Array(2048);
  private portB: number = 0;
  private portC: number = 0;
  private portD: number = 0;
  private ddrB: number = 0;
  private ddrC: number = 0;
  private ddrD: number = 0;

  constructor() {
    super(16000000);
    for (let i = 0; i < 14; i++) {
      this.pins.set(i, { mode: 'input', value: 0, analogValue: 0, pwmValue: 0 });
    }
  }

  loadProgram(hex: Uint16Array): void {
    this.program = hex;
    this.reset();
  }

  reset(): void {
    this.pc = 0;
    this.registers.fill(0);
    this.sram.fill(0);
    this.portB = 0;
    this.portC = 0;
    this.portD = 0;
    this.ddrB = 0;
    this.ddrC = 0;
    this.ddrD = 0;
    this.cycleCount = 0;
  }

  step(cycles: number): void {
    const endCycle = this.cycleCount + cycles;
    while (this.cycleCount < endCycle && this.pc < this.program.length) {
      const instruction = this.program[this.pc];
      this.executeInstruction(instruction);
      this.pc++;
      this.cycleCount++;
    }
  }

  private executeInstruction(inst: number): void {
    const opcode = inst & 0xffff;

    if ((opcode & 0xfc00) === 0x2000) {
      const rd = (opcode >> 4) & 0x1f;
      const rr = ((opcode >> 5) & 0x10) | (opcode & 0x0f);
      this.registers[rd] += this.registers[rr];
    }

    if ((opcode & 0xf000) === 0x4000) {
      const rd = ((opcode >> 4) & 0x10) | (opcode & 0x0f);
      const k = (opcode >> 2) & 0xff;
      this.registers[rd] = k & 0xff;
      if (rd === 0x1e) this.updatePort(2);
    }

    if ((opcode & 0xfe0e) === 0x940c) {
      this.pc = ((opcode >> 3) & 0x1f) | ((opcode >> 7) & 0x1f00);
    }

    if ((opcode & 0xfe0e) === 0x9408) {
      this.pc = this.registers[31] * 256 + this.registers[30];
    }

    if ((opcode & 0xfe0f) === 0x9409) {
      const sreg = 0;
    }

    if (opcode === 0x0000) {
      this.pc = this.program.length;
    }
  }

  private updatePort(portIndex: number): void {
    const portReg = this.registers[0x18 + portIndex];
    const ddrReg = this.registers[0x1a + portIndex];

    switch (portIndex) {
      case 0: this.portB = portReg; this.ddrB = ddrReg; break;
      case 1: this.portC = portReg; this.ddrC = ddrReg; break;
      case 2: this.portD = portReg; this.ddrD = ddrReg; break;
    }

    this.syncPins();
  }

  private syncPins(): void {
    const digitalPins = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const portMapping = [
      { port: 'D', pins: [0, 1, 2, 3, 4, 5, 6, 7] },
      { port: 'B', pins: [8, 9, 10, 11, 12, 13] },
      { port: 'C', pins: [14, 15, 16, 17, 18, 19] },
    ];

    for (const { port, pins: pinList } of portMapping) {
      const portVal = port === 'D' ? this.portD : port === 'B' ? this.portB : this.portC;
      const ddrVal = port === 'D' ? this.ddrD : port === 'B' ? this.ddrB : this.ddrC;

      for (let i = 0; i < pinList.length; i++) {
        const pinNum = pinList[i];
        if (pinNum < 14) {
          const pinIndex = pinNum % 8;
          const bit = 1 << pinIndex;
          const isOutput = (ddrVal & bit) !== 0;
          const pinVal = (portVal & bit) !== 0 ? 5 : 0;

          const state = this.pins.get(pinNum);
          if (state) {
            state.mode = isOutput ? 'output' : 'input';
            state.value = pinVal;
          }
        }
      }
    }
  }
}

export function createMicrocontroller(type: 'arduino' | 'esp32' | 'raspberry_pi'): BaseMicrocontroller {
  switch (type) {
    case 'arduino':
      return new ArduinoUnoMicrocontroller();
    case 'esp32':
      return new ArduinoUnoMicrocontroller(); // Placeholder
    case 'raspberry_pi':
      return new ArduinoUnoMicrocontroller(); // Placeholder
  }
}
