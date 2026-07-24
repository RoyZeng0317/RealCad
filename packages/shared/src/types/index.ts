export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Size3D {
  width: number;
  height: number;
  depth: number;
}

export type ComponentCategory =
  | 'passive'
  | 'active'
  | 'power'
  | 'logic'
  | 'microcontroller'
  | 'display'
  | 'electromechanical'
  | 'measurement';

export type ComponentType =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zener_diode'
  | 'npn_transistor'
  | 'pnp_transistor'
  | 'mosfet_n'
  | 'mosfet_p'
  | 'op_amp'
  | '555_timer'
  | 'and_gate'
  | 'or_gate'
  | 'not_gate'
  | 'nand_gate'
  | 'nor_gate'
  | 'xor_gate'
  | 'battery'
  | 'voltage_source'
  | 'current_source'
  | 'potentiometer'
  | 'switch_spst'
  | 'switch_spdt'
  | 'push_button'
  | 'relay'
  | 'arduino_uno'
  | 'arduino_mega2560'
  | 'esp32'
  | 'esp32_s3'
  | 'raspberry_pi_pico'
  | 'raspberry_pi_pico_2w'
  | 'raspberry_pi_4'
  | 'raspberry_pi_5'
  | 'seven_segment'
  | 'lcd_1602'
  | 'dc_motor'
  | 'servo_motor'
  | 'stepper_motor'
  | 'buzzer'
  | 'microphone'
  | 'photoresistor'
  | 'thermistor'
  | 'vcc'
  | 'gnd'
  | 'ic';

export interface Port {
  id: string;
  name: string;
  position: Position;
  type: 'input' | 'output' | 'bidirectional' | 'power';
  voltage?: number;
}

export interface ComponentDefinition {
  type: ComponentType;
  name: string;
  category: ComponentCategory;
  ports: Port[];
  defaultProperties: Record<string, number | string | boolean>;
  size: Size3D;
  modelPath?: string;
  symbolPath?: string;
  description: string;
  spiceModel?: string;
}

export interface PlacedComponent {
  id: string;
  type: ComponentType;
  position: Position;
  rotation: number;
  properties: Record<string, number | string | boolean>;
  label?: string;
}

export interface Wire {
  id: string;
  from: { componentId: string; portId: string };
  to: { componentId: string; portId: string };
  waypoints: Position[];
  color?: string;
}

export interface CircuitProject {
  id: string;
  name: string;
  description?: string;
  components: PlacedComponent[];
  wires: Wire[];
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  collaborators?: string[];
  isPublic: boolean;
  viewMode: '2d' | '3d';
}

export interface SimulationState {
  time: number;
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  componentStates: Record<string, Record<string, number | boolean>>;
}

export interface SimulationConfig {
  dt: number;
  tmax: number;
  method: 'euler' | 'trapezoidal' | 'gear2';
  reltol: number;
  vntol: number;
  abstol: number;
  maxIter: number;
}
