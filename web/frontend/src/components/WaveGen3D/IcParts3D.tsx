// NE555（黑色 DIP-8 + 缺口 + 印字）與 CH224K PD 誘騙模組（PCB + USB-C 母座 + 排針，線拉到桌上的充電器）的 3D 模型
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { holePos } from './boardModel.js';
import type { BoardPart } from './boardParts.js';
import { TOP_Y } from './breadboardGrid.js';
import { createCanvasTexture, FONT } from './panelTexture.js';
import { useHeatMaterial, usePartEvents, LEAD, type Sel } from './BoardParts3D.js';
import { CHARGERS } from './ch224.js';

function useText(lines: [string, number, number, string?][], w: number, h: number, bg: string) {
  const tex = useMemo(() => createCanvasTexture(w, h, (p) => {
    p.ctx.fillStyle = bg;
    p.ctx.fillRect(0, 0, p.s(w), p.s(h));
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    for (const [t, y, size, color] of lines) { p.ctx.fillStyle = color ?? '#e8eef5'; p.ctx.font = `700 ${p.s(size)}px ${FONT}`; p.ctx.fillText(t, p.x(0), p.y(y)); }
  }, 1600), [lines, w, h, bg]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const NE_LABEL: [string, number, number][] = [['NE555P', 0.008, 0.024], ['TI  E4  ●', -0.022, 0.014]];

// ---- NE555：DIP-8 跨在中間溝上，第 1 腳在 e 欄最上面那列 ----
export function Ne5553D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const pins = useMemo(() => part.pins.map(holePos), [part.pins]);
  const mat = useHeatMaterial(part, '#18191c', selected);
  const x0 = pins[0].x, x1 = pins[7].x, z0 = pins[0].z, z1 = pins[3].z;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.abs(z1 - z0), width = Math.abs(x1 - x0);
  const dir = z1 >= z0 ? 1 : -1;
  const tex = useText(NE_LABEL, len + 0.03, width * 1.1, '#18191c');
  const bodyY = TOP_Y + 0.035;
  return (
    <group {...usePartEvents(part)}>
      {pins.map((p, i) => (
        <mesh key={i} position={[p.x + (i < 4 ? 0.006 : -0.006), TOP_Y + 0.012, p.z]}>
          <boxGeometry args={[0.008, 0.04, 0.018]} />
          <meshStandardMaterial color={LEAD} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      <group position={[cx, bodyY, cz]}>
        <mesh castShadow material={mat}><boxGeometry args={[width * 1.1, 0.04, len + 0.05]} /></mesh>
        <mesh position={[0, 0.0205, -dir * (len / 2 + 0.025)]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.012, 16, 0, Math.PI]} />
          <meshBasicMaterial color="#050505" />
        </mesh>
        <mesh position={[0, 0.0206, 0]} rotation={[-Math.PI / 2, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2]}>
          <planeGeometry args={[len + 0.03, width * 1.1]} />
          <meshBasicMaterial map={part.burnt ? null : tex} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---- CH224K 模組：紫色小板平放在排針上，USB-C 母座朝外，線拉到桌上的白色充電器 ----
export function Ch2243D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const pins = useMemo(() => part.pins.map(holePos), [part.pins]);
  const pcb = useHeatMaterial(part, '#5a2d8a', selected);
  const g = useMemo(() => {
    const [, s, r] = part.pins[0].split(':');
    const cx = (holePos(`t:${s}:${r}:4`).x + holePos(`t:${s}:${r}:5`).x) / 2;
    const out = Math.sign(pins[0].x - cx) || -1; // USB-C 朝端子排外側
    const c = pins[1].clone();
    const board = new THREE.Vector3(c.x + out * 0.13, TOP_Y + 0.11, c.z);
    const usb = board.clone().add(new THREE.Vector3(out * 0.17, 0.02, 0));
    const brick = new THREE.Vector3(usb.x + out * 1.0, TOP_Y - 0.02, usb.z + 0.5);
    return { out, board, usb, brick };
  }, [pins, part.pins]);
  const vLabel = `${part.pdVolt ?? 12}V`;
  const tex = useText(useMemo(() => [['CH224K', 0.02, 0.026], [`PD ${vLabel}`, -0.02, 0.022, '#ffd34a']] as [string, number, number, string?][], [vLabel]), 0.16, 0.1, '#16171a');
  const cable = useMemo(() => {
    const a = g.usb.clone().add(new THREE.Vector3(g.out * 0.04, 0, 0));
    const pts = [a, a.clone().add(new THREE.Vector3(g.out * 0.15, 0.04, 0.02)), new THREE.Vector3((a.x + g.brick.x) / 2, TOP_Y + 0.1, (a.z + g.brick.z) / 2), g.brick.clone().add(new THREE.Vector3(-g.out * 0.12, 0.04, 0))];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.014, 8, false);
  }, [g]);
  useEffect(() => () => cable.dispose(), [cable]);
  const plugged = part.plugged !== false;
  return (
    <group {...usePartEvents(part)}>
      {pins.map((p, i) => (
        <mesh key={i} position={[p.x, TOP_Y + 0.05, p.z]}>
          <boxGeometry args={[0.012, 0.13, 0.012]} />
          <meshStandardMaterial color="#d9c27a" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={g.board} castShadow material={pcb}><boxGeometry args={[0.36, 0.014, 0.26]} /></mesh>
      {/* CH224K（ESSOP-10）與印字 */}
      <mesh position={[g.board.x, g.board.y + 0.012, g.board.z]} castShadow>
        <boxGeometry args={[0.08, 0.012, 0.09]} />
        <meshStandardMaterial color="#16171a" roughness={0.5} />
      </mesh>
      <mesh position={[g.board.x - g.out * 0.08, g.board.y + 0.0085, g.board.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.13, 0.08]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* USB-C 母座 */}
      <mesh position={g.usb} castShadow>
        <boxGeometry args={[0.08, 0.032, 0.09]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.3} />
      </mesh>
      {plugged && (
        <>
          <mesh position={g.usb.clone().add(new THREE.Vector3(g.out * 0.06, 0, 0))} castShadow>
            <boxGeometry args={[0.06, 0.05, 0.11]} />
            <meshStandardMaterial color="#e8e8e2" roughness={0.6} />
          </mesh>
          <mesh geometry={cable} castShadow><meshStandardMaterial color="#e8e8e2" roughness={0.6} /></mesh>
          {/* 充電器（白色方塊）+ 規格貼紙 */}
          <group position={g.brick}>
            <mesh position={[0, 0.12, 0]} castShadow>
              <boxGeometry args={[0.26, 0.24, 0.26]} />
              <meshStandardMaterial color="#f2f2ee" roughness={0.5} />
            </mesh>
            <ChargerLabel name={CHARGERS[part.charger ?? 'pd65'].name.split('（')[0]} />
          </group>
        </>
      )}
      {/* PG 指示：協商成功時模組上的綠燈 */}
      <mesh position={[g.board.x + g.out * 0.08, g.board.y + 0.012, g.board.z + 0.08]}>
        <boxGeometry args={[0.025, 0.012, 0.018]} />
        <meshBasicMaterial color={plugged && !part.burnt ? '#39ff6a' : '#1a3a22'} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ChargerLabel({ name }: { name: string }) {
  const tex = useText(useMemo(() => [[name, 0, 0.03, '#333']] as [string, number, number, string?][], [name]), 0.26, 0.08, '#f2f2ee');
  return (
    <mesh position={[0, 0.241, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.25, 0.08]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
