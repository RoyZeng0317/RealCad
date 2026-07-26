import { useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox, Text } from '@react-three/drei';
import type { PlacedComponent } from '@circuit-lab/shared';
import { COMPONENT_LIBRARY } from '@circuit-lab/simulator-core';
import { useCircuitStore } from '../../stores/circuitStore.js';

const PIN_RADIUS = 0.018;
const PIN_HEIGHT = 0.15;
const PCB_THICKNESS = 0.06;

function Pin({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[PIN_RADIUS * 2, PIN_HEIGHT, PIN_RADIUS * 2]} />
      <meshStandardMaterial color="#b0b0b0" metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

function IC({ position, size, color = '#111' }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.005, -size[2] / 2 + 0.01]}>
        <boxGeometry args={[size[0] * 0.15, 0.01, 0.015]} />
        <meshStandardMaterial color="#666" roughness={0.5} />
      </mesh>
    </group>
  );
}

function USBPort({ position, rotation = 0, type = 'micro' }: { position: [number, number, number]; rotation?: number; type?: 'micro' | 'usbB' | 'usbC' | 'usbA' }) {
  const dims = type === 'usbB' ? [0.16, 0.04, 0.12] : type === 'usbC' ? [0.14, 0.04, 0.08] : type === 'usbA' ? [0.18, 0.06, 0.14] : [0.12, 0.03, 0.08];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh>
        <boxGeometry args={dims as [number, number, number]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0, dims[2] / 2 + 0.005]}>
        <boxGeometry args={[dims[0] * 0.6, dims[1] * 0.3, 0.01]} />
        <meshStandardMaterial color="#333" roughness={0.5} />
      </mesh>
    </group>
  );
}

function BarrelJack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.12, 12]} />
        <meshStandardMaterial color="#888" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[0.04, 0.02, 0.04]} />
        <meshStandardMaterial color="#333" roughness={0.5} />
      </mesh>
    </group>
  );
}

function EthernetPort({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.18, 0.06, 0.16]} />
        <meshStandardMaterial color="#888" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.025, 0.09]}>
        <boxGeometry args={[0.12, 0.02, 0.03]} />
        <meshStandardMaterial color="#444" roughness={0.5} />
      </mesh>
    </group>
  );
}

function AudioJack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 0.1, 10]} />
        <meshStandardMaterial color="#666" metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <cylinderGeometry args={[0.025, 0.02, 0.02, 8]} />
        <meshStandardMaterial color="#333" roughness={0.5} />
      </mesh>
    </group>
  );
}

function MountHole({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.04, 0.04, 0.01, 12]} />
        <meshStandardMaterial color="#c0a040" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.015, 12]} />
        <meshStandardMaterial color="#444" roughness={0.8} />
      </mesh>
    </group>
  );
}

function PCBBase({ width, depth, thickness = PCB_THICKNESS, color = '#1a6b3c', smooth = 0.02 }: { width: number; depth: number; thickness?: number; color?: string; smooth?: number }) {
  return (
    <RoundedBox args={[width, thickness, depth]} radius={smooth} smoothness={4} receiveShadow castShadow>
      <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} />
    </RoundedBox>
  );
}

function HeaderPins({ positions, color = '#b0b0b0' }: { positions: [number, number, number][]; color?: string }) {
  return (
    <group>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[0.025, PIN_HEIGHT, 0.025]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function SMTHeader({ count, start, spacing = 0.065, dir = [1, 0] }: { count: number; start: [number, number]; spacing?: number; dir?: [number, number] }) {
  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    positions.push([start[0] + dir[0] * i * spacing, 0.005, start[1] + dir[1] * i * spacing]);
  }
  return (
    <group>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[0.035, 0.01, 0.03]} />
          <meshStandardMaterial color="#c0c0c0" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

export function ComponentMesh({ component }: { component: PlacedComponent }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectedComponentId, selectComponent, removeComponent, simulationState } = useCircuitStore();
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = selectedComponentId === component.id;
  const def = COMPONENT_LIBRARY[component.type];
  const color = componentColors[component.type] ?? '#888';

  const state = simulationState?.componentStates?.[component.id];
  const ledBrightness = component.type === 'led' ? (state?.brightness as number ?? 0) : 0;

  if (!def) return null;

  const size = def.size;

  const handleClick = (e: any) => {
    e.stopPropagation();
    selectComponent(component.id);
  };

  const handleDoubleClick = () => {
    removeComponent(component.id);
  };

  const renderShape = () => {
    switch (component.type) {
      case 'resistor':
        return <ResistorShape size={size} color={color} />;
      case 'capacitor':
        return <CapacitorShape size={size} color={color} />;
      case 'inductor':
        return <InductorShape size={size} color={color} />;
      case 'led':
        return <LEDShape size={size} color={color} brightness={ledBrightness} />;
      case 'diode':
      case 'zener_diode':
        return <DiodeShape size={size} color={color} />;
      case 'npn_transistor':
      case 'pnp_transistor':
      case 'mosfet_n':
      case 'mosfet_p':
        return <TransistorShape size={size} color={color} />;
      case 'battery':
        return <BatteryShape size={size} color={color} />;
      case 'push_button':
        return <ButtonShape size={size} color={color} />;
      case 'arduino_uno':
        return <ArduinoUnoShape />;
      case 'arduino_mega2560':
        return <ArduinoMegaShape />;
      case 'raspberry_pi_pico':
        return <PicoShape />;
      case 'raspberry_pi_pico_2w':
        return <Pico2WShape />;
      case 'raspberry_pi_4':
        return <RPi4Shape />;
      case 'raspberry_pi_5':
        return <RPi5Shape />;
      case 'esp32':
        return <ESP32Shape />;
      case 'esp32_s3':
        return <ESP32S3Shape />;
      case 'seven_segment':
        return <SevenSegmentShape size={size} />;
      case 'and_gate':
      case 'or_gate':
      case 'nand_gate':
        return <LogicGateShape size={size} color={color} type={component.type} />;
      default:
        return (
          <mesh>
            <boxGeometry args={[size.width, size.height, size.depth]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
          </mesh>
        );
    }
  };

  return (
    <group position={[component.position.x, component.position.y, component.position.z]}>
      <group
        ref={meshRef as any}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={() => setIsHovered(true)}
        onPointerOut={() => setIsHovered(false)}
        scale={isSelected ? 1.05 : isHovered ? 1.02 : 1}
      >
        {renderShape()}
      </group>
      {(isSelected || isHovered) && (
        <mesh>
          <boxGeometry args={[size.width * 1.1, size.height * 1.1 + 0.1, size.depth * 1.1]} />
          <meshBasicMaterial
            color={isSelected ? '#00d2ff' : '#888'}
            transparent
            opacity={0.12}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
}

const componentColors: Record<string, string> = {
  resistor: '#cc6633',
  capacitor: '#4488cc',
  inductor: '#44aa66',
  diode: '#555',
  led: '#ff2222',
  npn_transistor: '#7744aa',
  pnp_transistor: '#aa4477',
  mosfet_n: '#4488aa',
  mosfet_p: '#aa8844',
  battery: '#44cc44',
  arduino_uno: '#1a6b3c',
  arduino_mega2560: '#1a6b3c',
  esp32: '#0d3b7a',
  esp32_s3: '#0d3b7a',
  raspberry_pi_pico: '#1a6b3c',
  raspberry_pi_pico_2w: '#1a6b3c',
  raspberry_pi_4: '#1a6b3c',
  raspberry_pi_5: '#1a6b3c',
  push_button: '#cc4444',
  switch_spst: '#888',
  seven_segment: '#222',
  '555_timer': '#444',
  op_amp: '#444466',
  and_gate: '#446688',
  or_gate: '#448866',
  nand_gate: '#884466',
  buzzer: '#666644',
  dc_motor: '#446666',
};

function ResistorShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[-size.width * 0.25, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[size.width * 0.25, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size.width * 0.5, size.height * 0.6, size.depth * 0.4]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}

function CapacitorShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[-size.width * 0.25, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, size.height, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[size.width * 0.25, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, size.height, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, size.height, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

function InductorShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[(i / 5 - 0.5) * size.width, 0, 0]}>
          <torusGeometry args={[0.12, 0.04, 8, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function LEDShape({ size, color, brightness }: { size: any; color: string; brightness: number }) {
  const ledColor = new THREE.Color(color);
  const emitColor = ledColor.clone().lerp(new THREE.Color('#fff'), brightness * 0.5);
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={brightness > 0.01 ? emitColor : '#000'}
          emissiveIntensity={brightness * 2}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
    </group>
  );
}

function DiodeShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[-0.2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#ccc" metalness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.15, 0.15, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.2, 0, 0]}>
        <boxGeometry args={[0.02, 0.2, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function TransistorShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.2, 0.25, 0.15]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, 0.15, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 6]} />
        <meshStandardMaterial color="#aaa" metalness={0.5} />
      </mesh>
      <mesh position={[-0.1, -0.15, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 6]} />
        <meshStandardMaterial color="#aaa" metalness={0.5} />
      </mesh>
      <mesh position={[0.1, -0.15, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 6]} />
        <meshStandardMaterial color="#aaa" metalness={0.5} />
      </mesh>
    </group>
  );
}

function BatteryShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.3, 0.3]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0.25, 0.05, 0]}>
        <boxGeometry args={[0.05, 0.25, 0.05]} />
        <meshStandardMaterial color="#ccc" metalness={0.7} />
      </mesh>
    </group>
  );
}

function ButtonShape({ size, color }: { size: any; color: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.35, 0.1, 0.35]} />
        <meshStandardMaterial color="#888" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.2, 0.05, 0.2]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

function ArduinoUnoShape() {
  const halfW = 0.75;
  const halfH = 0.8;
  return (
    <group>
      <PCBBase width={1.5} depth={1.6} color="#1a6b3c" />
      <IC position={[0.35, 0.035, 0.3]} size={[0.35, 0.055, 0.35]} />
      <IC position={[-0.4, 0.035, -0.25]} size={[0.15, 0.05, 0.15]} />
      <HeaderPins positions={Array.from({ length: 6 }, (_, i) => [-halfW + 0.05, 0.04, -0.5 + i * 0.15] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 8 }, (_, i) => [halfW - 0.05, 0.04, -0.55 + i * 0.13] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 6 }, (_, i) => [-halfW + 0.05, 0.04, 0.15 + i * 0.15] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 8 }, (_, i) => [halfW - 0.05, 0.04, 0.2 + i * 0.13] as [number, number, number])} />
      <USBPort position={[-0.55, 0.04, halfH - 0.05]} type="usbB" />
      <BarrelJack position={[0.3, 0.04, halfH - 0.05]} />
      <MountHole position={[-halfW + 0.12, 0.02, halfH - 0.12]} />
      <MountHole position={[-halfW + 0.12, 0.02, -halfH + 0.12]} />
      <MountHole position={[halfW - 0.12, 0.02, -halfH + 0.12]} />
      <mesh position={[0.2, 0.04, -halfH + 0.1]}>
        <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
        <meshStandardMaterial color="#44cc44" emissive="#44cc44" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function ArduinoMegaShape() {
  const halfW = 1.0;
  const halfH = 1.2;
  return (
    <group>
      <PCBBase width={2.0} depth={2.4} color="#1a6b3c" />
      <IC position={[0.55, 0.035, -0.05]} size={[0.45, 0.06, 0.45]} />
      <IC position={[0.55, 0.035, 0.55]} size={[0.3, 0.05, 0.3]} />
      <HeaderPins positions={Array.from({ length: 16 }, (_, i) => [-halfW + 0.05, 0.04, -1.0 + i * 0.12] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 16 }, (_, i) => [halfW - 0.05, 0.04, -1.0 + i * 0.12] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [-0.35 + i * 0.08, 0.04, -halfH + 0.05] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [-0.35 + i * 0.08, 0.04, halfH - 0.05] as [number, number, number])} />
      <USBPort position={[-0.5, 0.04, halfH - 0.05]} type="usbB" />
      <BarrelJack position={[0.55, 0.04, halfH - 0.05]} />
      <MountHole position={[-halfW + 0.15, 0.02, -halfH + 0.15]} />
      <MountHole position={[-halfW + 0.15, 0.02, halfH - 0.15]} />
      <MountHole position={[halfW - 0.15, 0.02, -halfH + 0.15]} />
      <MountHole position={[halfW - 0.15, 0.02, halfH - 0.15]} />
    </group>
  );
}

function PicoShape() {
  return (
    <group>
      <PCBBase width={1.2} depth={1.2} color="#1a6b3c" />
      <IC position={[0, 0.035, 0.25]} size={[0.25, 0.045, 0.25]} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [-0.5, 0.04, -0.5 + i * 0.1] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [0.5, 0.04, -0.5 + i * 0.1] as [number, number, number])} />
      <USBPort position={[0, 0.04, -0.55]} type="micro" />
      <mesh position={[-0.45, 0.03, 0.45]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshBasicMaterial color="#c0a040" />
      </mesh>
      <mesh position={[0.45, 0.03, 0.45]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshBasicMaterial color="#c0a040" />
      </mesh>
    </group>
  );
}

function Pico2WShape() {
  return (
    <group>
      <PCBBase width={1.2} depth={1.3} color="#1a6b3c" />
      <IC position={[0, 0.035, 0.3]} size={[0.3, 0.05, 0.3]} />
      <IC position={[-0.2, 0.04, 0.1]} size={[0.1, 0.025, 0.1]} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [-0.5, 0.04, -0.55 + i * 0.1] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [0.5, 0.04, -0.55 + i * 0.1] as [number, number, number])} />
      <USBPort position={[0, 0.04, -0.6]} type="micro" />
      <mesh position={[-0.45, 0.03, 0.5]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshBasicMaterial color="#c0a040" />
      </mesh>
      <mesh position={[0.45, 0.03, 0.5]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshBasicMaterial color="#c0a040" />
      </mesh>
    </group>
  );
}

function RPi4Shape() {
  const halfW = 1.0;
  const halfH = 0.8;
  return (
    <group>
      <PCBBase width={2.0} depth={1.6} color="#1a6b3c" />
      <IC position={[0.35, 0.035, 0.4]} size={[0.35, 0.05, 0.35]} />
      <USBPort position={[-0.55, 0.04, -halfH + 0.05]} type="usbC" />
      <USBPort position={[-0.25, 0.04, -halfH + 0.05]} type="usbC" />
      <USBPort position={[0.1, 0.04, -halfH + 0.05]} type="usbA" />
      <USBPort position={[0.35, 0.04, -halfH + 0.05]} type="usbA" />
      <EthernetPort position={[-0.55, 0.04, -halfH + 0.05]} />
      <AudioJack position={[0.55, 0.04, -halfH + 0.05]} />
      <HeaderPins positions={Array.from({ length: 40 }, (_, i) => [-0.55 + ((i % 20) * 0.065), 0.04, halfH - 0.08 - (i >= 20 ? 0.085 : 0)] as [number, number, number])} />
      <MountHole position={[-halfW + 0.12, 0.02, -halfH + 0.12]} />
      <MountHole position={[-halfW + 0.12, 0.02, halfH - 0.12]} />
      <MountHole position={[halfW - 0.12, 0.02, -halfH + 0.12]} />
      <MountHole position={[halfW - 0.12, 0.02, halfH - 0.12]} />
      <mesh position={[-0.75, 0.04, 0.6]}>
        <boxGeometry args={[0.08, 0.025, 0.25]} />
        <meshStandardMaterial color="#888" roughness={0.4} />
      </mesh>
    </group>
  );
}

function RPi5Shape() {
  const halfW = 1.1;
  const halfH = 0.9;
  return (
    <group>
      <PCBBase width={2.2} depth={1.8} color="#1a6b3c" />
      <IC position={[0.5, 0.035, 0.5]} size={[0.4, 0.055, 0.4]} />
      <USBPort position={[-0.6, 0.04, -halfH + 0.05]} type="usbC" />
      <USBPort position={[-0.3, 0.04, -halfH + 0.05]} type="usbC" />
      <USBPort position={[0.05, 0.04, -halfH + 0.05]} type="usbA" />
      <USBPort position={[0.3, 0.04, -halfH + 0.05]} type="usbA" />
      <EthernetPort position={[-0.55, 0.04, -halfH + 0.05]} />
      <AudioJack position={[0.5, 0.04, -halfH + 0.05]} />
      <HeaderPins positions={Array.from({ length: 40 }, (_, i) => [-0.6 + ((i % 20) * 0.065), 0.04, halfH - 0.08 - (i >= 20 ? 0.085 : 0)] as [number, number, number])} />
      <MountHole position={[-halfW + 0.12, 0.02, -halfH + 0.12]} />
      <MountHole position={[-halfW + 0.12, 0.02, halfH - 0.12]} />
      <MountHole position={[halfW - 0.12, 0.02, -halfH + 0.12]} />
      <MountHole position={[halfW - 0.12, 0.02, halfH - 0.12]} />
      <mesh position={[0.7, 0.04, 0.45]}>
        <boxGeometry args={[0.08, 0.02, 0.25]} />
        <meshStandardMaterial color="#888" roughness={0.4} />
      </mesh>
    </group>
  );
}

function ESP32Shape() {
  return (
    <group>
      <PCBBase width={1.2} depth={1.2} color="#0d3b7a" />
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.5]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
      </mesh>
      <HeaderPins positions={Array.from({ length: 8 }, (_, i) => [-0.5, 0.04, -0.4 + i * 0.11] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 8 }, (_, i) => [0.5, 0.04, -0.4 + i * 0.11] as [number, number, number])} />
      <USBPort position={[0, 0.04, 0.5]} type="micro" />
    </group>
  );
}

function ESP32S3Shape() {
  return (
    <group>
      <PCBBase width={1.4} depth={1.2} color="#0d3b7a" />
      <mesh position={[0.2, 0.035, 0.05]}>
        <boxGeometry args={[0.55, 0.04, 0.55]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.3} />
      </mesh>
      <HeaderPins positions={Array.from({ length: 16 }, (_, i) => [-0.6, 0.04, -0.5 + i * 0.065] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 16 }, (_, i) => [0.6, 0.04, -0.5 + i * 0.065] as [number, number, number])} />
      <HeaderPins positions={Array.from({ length: 10 }, (_, i) => [-0.3 + i * 0.065, 0.04, 0.55] as [number, number, number])} />
      <USBPort position={[-0.55, 0.04, 0.5]} type="usbC" />
    </group>
  );
}

function SevenSegmentShape({ size }: { size: any }) {
  const segPositions: [number, number, number][] = [
    [0, 0.35, 0.05], [0.25, 0.15, 0.05], [0.25, -0.15, 0.05],
    [0, -0.35, 0.05], [-0.25, -0.15, 0.05], [-0.25, 0.15, 0.05],
    [0, 0, 0.05],
  ];
  const segSizes: [number, number, number][] = [
    [0.25, 0.05, 0.02], [0.05, 0.15, 0.02], [0.05, 0.15, 0.02],
    [0.25, 0.05, 0.02], [0.05, 0.15, 0.02], [0.05, 0.15, 0.02],
    [0.25, 0.05, 0.02],
  ];
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[size.width, size.height, size.depth]} />
        <meshStandardMaterial color="#222" roughness={0.8} />
      </mesh>
      {segPositions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={segSizes[i]} />
          <meshStandardMaterial color={i < 6 ? '#ff4444' : '#44ff44'} emissive="#ff2222" emissiveIntensity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function LogicGateShape({ size, color, type }: { size: any; color: string; type: string }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.35, 0.15]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[-0.25, 0.12, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 6]} />
        <meshStandardMaterial color="#ccc" />
      </mesh>
      <mesh position={[-0.25, -0.12, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 6]} />
        <meshStandardMaterial color="#ccc" />
      </mesh>
      <mesh position={[0.25, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.05, 6]} />
        <meshStandardMaterial color="#ccc" />
      </mesh>
    </group>
  );
}
