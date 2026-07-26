import { useMemo } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import {
  COLS, PITCH, MAIN_ROWS, BOARD_H, BOARD_TOP,
  BOARD_W, BOARD_D, LAYOUT, COL_XS,
} from './breadboardLayout.js';

const HOLE_SIZE = 0.28;
const HOLE_DARK = 0.16;

export function BreadboardMesh() {
  const boardY = BOARD_TOP + 0.001;

  const contactMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d8d4ce', roughness: 0.4, metalness: 0.3 }),
    []
  );
  const darkMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#111111', depthWrite: false }),
    []
  );
  const redMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#cc2222', depthWrite: false }),
    []
  );
  const blueMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#2255cc', depthWrite: false }),
    []
  );

  const contactGeom = useMemo(() => new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE), []);
  const darkGeom = useMemo(() => new THREE.PlaneGeometry(HOLE_DARK, HOLE_DARK), []);
  const railContactGeom = useMemo(() => new THREE.PlaneGeometry(HOLE_SIZE, HOLE_SIZE * 1.15), []);
  const accentDotGeom = useMemo(() => new THREE.PlaneGeometry(HOLE_DARK * 0.5, HOLE_DARK * 0.5), []);

  const rot: [number, number, number] = [-Math.PI / 2, 0, 0];
  const notchW = BOARD_W - 0.6;
  const centerGapSize = Math.abs(LAYOUT.botMain[0] - LAYOUT.topMain[MAIN_ROWS - 1]) - PITCH;

  function MainHole({ x, z }: { x: number; z: number }) {
    return (
      <group>
        <mesh geometry={contactGeom} material={contactMat} position={[x, boardY, z]} rotation={rot} renderOrder={1} />
        <mesh geometry={darkGeom} material={darkMat} position={[x, boardY + 0.0008, z]} rotation={rot} renderOrder={2} />
      </group>
    );
  }

  function RailHole({ x, z, color }: { x: number; z: number; color: 'red' | 'blue' }) {
    const accentMat = color === 'red' ? redMat : blueMat;
    return (
      <group>
        <mesh geometry={railContactGeom} material={contactMat} position={[x, boardY, z]} rotation={rot} renderOrder={1} />
        <mesh geometry={darkGeom} material={darkMat} position={[x, boardY + 0.0008, z]} rotation={rot} renderOrder={2} />
        <mesh geometry={accentDotGeom} material={accentMat} position={[x, boardY + 0.0015, z]} rotation={rot} renderOrder={3} />
      </group>
    );
  }

  return (
    <group>
      {/* Board body */}
      <mesh receiveShadow castShadow>
        <boxGeometry args={[BOARD_W, BOARD_H, BOARD_D]} />
        <meshStandardMaterial color="#f2f0ec" roughness={0.75} metalness={0} />
      </mesh>

      {/* Center DIP ridge */}
      <mesh position={[0, BOARD_TOP + 0.01, 0]}>
        <boxGeometry args={[notchW, 0.02, centerGapSize]} />
        <meshStandardMaterial color="#d8d5d0" roughness={0.8} />
      </mesh>

      {/* Rail color strips */}
      {[
        { z: LAYOUT.topRails[1], mat: redMat },
        { z: LAYOUT.topRails[0], mat: blueMat },
        { z: LAYOUT.botRails[0], mat: blueMat },
        { z: LAYOUT.botRails[1], mat: redMat },
      ].map(({ z, mat }, i) => (
        <mesh key={`strip-${i}`} position={[0, boardY + 0.001, z]} rotation={rot}>
          <planeGeometry args={[BOARD_W - 0.8, PITCH * 0.28]} />
          <primitive object={mat} />
        </mesh>
      ))}

      {/* Separator lines */}
      {[
        LAYOUT.topRails[1] - PITCH * 0.8,
        LAYOUT.topMain[0] + PITCH * 0.75,
        LAYOUT.botMain[MAIN_ROWS - 1] - PITCH * 0.75,
        LAYOUT.botRails[0] + PITCH * 0.8,
      ].map((z, i) => (
        <mesh key={`sep-${i}`} position={[0, boardY, z]} rotation={rot}>
          <planeGeometry args={[BOARD_W - 0.4, 0.018]} />
          <meshBasicMaterial color="#aaaaaa" />
        </mesh>
      ))}

      {/* Top rail holes: [0]=- blue, [1]=+ red */}
      {LAYOUT.topRails.map((z, ri) =>
        COL_XS.map((x, ci) => (
          <RailHole key={`tr-${ri}-${ci}`} x={x} z={z} color={ri === 1 ? 'red' : 'blue'} />
        ))
      )}

      {/* Top main holes (a–e) */}
      {LAYOUT.topMain.map((z, ri) =>
        COL_XS.map((x, ci) => (
          <MainHole key={`tm-${ri}-${ci}`} x={x} z={z} />
        ))
      )}

      {/* Bottom main holes (f–j) */}
      {LAYOUT.botMain.map((z, ri) =>
        COL_XS.map((x, ci) => (
          <MainHole key={`bm-${ri}-${ci}`} x={x} z={z} />
        ))
      )}

      {/* Bottom rail holes: [0]=- blue, [1]=+ red */}
      {LAYOUT.botRails.map((z, ri) =>
        COL_XS.map((x, ci) => (
          <RailHole key={`br-${ri}-${ci}`} x={x} z={z} color={ri === 0 ? 'blue' : 'red'} />
        ))
      )}

      {/* Row letters a–e */}
      {LAYOUT.topMain.map((z, i) => (
        <Text key={`la-${i}`} position={[-BOARD_W / 2 + 0.22, boardY + 0.002, z]}
          fontSize={0.09} color="#888888" anchorX="center" anchorY="middle"
          rotation={rot} renderOrder={3}>
          {String.fromCharCode(97 + (MAIN_ROWS - 1 - i))}
        </Text>
      ))}

      {/* Row letters f–j */}
      {LAYOUT.botMain.map((z, i) => (
        <Text key={`lb-${i}`} position={[-BOARD_W / 2 + 0.22, boardY + 0.002, z]}
          fontSize={0.09} color="#888888" anchorX="center" anchorY="middle"
          rotation={rot} renderOrder={3}>
          {String.fromCharCode(102 + i)}
        </Text>
      ))}

      {/* Column numbers every 5 */}
      {COL_XS.filter((_, i) => i % 5 === 0).map((x, i) => (
        <Text key={`cn-${i}`}
          position={[x, boardY + 0.002, LAYOUT.topMain[0] + PITCH * 1.3]}
          fontSize={0.08} color="#888888" anchorX="center" anchorY="middle"
          rotation={rot} renderOrder={3}>
          {(i * 5 + 1).toString()}
        </Text>
      ))}

      {/* +/− labels */}
      {[
        { z: LAYOUT.topRails[1], label: '+', color: '#cc2222' },
        { z: LAYOUT.topRails[0], label: '−', color: '#2255cc' },
        { z: LAYOUT.botRails[0], label: '−', color: '#2255cc' },
        { z: LAYOUT.botRails[1], label: '+', color: '#cc2222' },
      ].map(({ z, label, color }, i) => (
        <Text key={`pl-${i}`}
          position={[-BOARD_W / 2 + 0.22, boardY + 0.002, z]}
          fontSize={0.11} color={color} anchorX="center" anchorY="middle"
          rotation={rot} renderOrder={3}>
          {label}
        </Text>
      ))}
    </group>
  );
}
