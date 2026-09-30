// 麵包板 IC 的 3D 模型：ATmega328P-PU（黑色 DIP-28 + 缺口 + 印字）、CH340G 轉接板（藍色 PCB + SOP-16 + 12 MHz 石英 + Micro USB 與連到電腦的線）
// 滑鼠移到 IC 上會顯示最近那隻腳的名稱與電壓
import { useEffect, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { holePos } from '../boardModel.js';
import { BREADBOARD } from '../layout.js';
import { getBench } from '../bench.js';
import type { BoardPart } from '../boardParts.js';
import { TOP_Y } from '../breadboardGrid.js';
import { createCanvasTexture, FONT } from '../panelTexture.js';
import { useHeatMaterial, usePartEvents, LEAD, type Sel } from '../BoardParts3D.js';
import { CHIP_PINS, AT, CH } from './chipDefs.js';

function useLabel(lines: [string, number, number][], w: number, h: number, bg: string | null, color = '#e8eef5') {
  const tex = useMemo(() => createCanvasTexture(w, h, (p) => {
    if (bg) { p.ctx.fillStyle = bg; p.ctx.fillRect(0, 0, p.s(w), p.s(h)); }
    p.ctx.fillStyle = color;
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    for (const [t, y, size] of lines) { p.ctx.font = `700 ${p.s(size)}px ${FONT}`; p.ctx.fillText(t, p.x(0), p.y(y)); }
  }, 1600), [lines, w, h, bg, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const AT_LABEL: [string, number, number][] = [['ATMEGA328P-PU', 0.012, 0.026], ['AVR  2038  ●', -0.022, 0.016]];
const CH_LABEL: [string, number, number][] = [['CH340G', 0, 0.02]];

export function Chip3D({ part, selected }: { part: BoardPart; selected: Sel }) {
  const pins = useMemo(() => part.pins.map(holePos), [part.pins]);
  const half = pins.length / 2;
  const atmega = part.kind === 'atmega';
  const mat = useHeatMaterial(part, atmega ? '#18191c' : '#1f4fae', selected);
  const [hover, setHover] = useState<number | null>(null);
  // 第 1 腳（e 欄、最上面那列）到第 N/2 腳沿 +z 排；第 N/2+1 ~ N 在 f 欄
  const x0 = pins[0].x, x1 = pins[pins.length - 1].x;
  const z0 = pins[0].z, z1 = pins[half - 1].z;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const len = Math.abs(z1 - z0), width = Math.abs(x1 - x0);
  const dir = z1 >= z0 ? 1 : -1; // 拖曳時 IC 可能被翻轉排列
  const events = usePartEvents(part);
  const nearest = (e: ThreeEvent<PointerEvent>) => {
    // e.point 是世界座標 → 麵包板本地座標
    const l = e.point.clone().sub(BREADBOARD.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -BREADBOARD.rotY);
    let best = 0, bd = Infinity;
    pins.forEach((p, i) => { const d = Math.hypot(p.x - l.x, p.z - l.z); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const labelTex = useLabel(atmega ? AT_LABEL : CH_LABEL, atmega ? len + 0.03 : 0.1, atmega ? width * 1.1 : 0.1, atmega ? '#18191c' : '#16171a');
  const bodyY = atmega ? TOP_Y + 0.035 : TOP_Y + 0.11;

  return (
    <group {...events} onPointerMove={(e) => { e.stopPropagation(); const i = nearest(e); if (i !== hover) setHover(i); }}
      onPointerOut={() => setHover(null)}>
      {/* 接腳 */}
      {pins.map((p, i) => (
        <mesh key={i} position={[p.x + (i < half ? 0.006 : -0.006), TOP_Y + (atmega ? 0.012 : 0.04), p.z]} raycast={() => null}>
          <boxGeometry args={[0.008, atmega ? 0.04 : 0.1, 0.018]} />
          <meshStandardMaterial color={atmega ? LEAD : '#d9c27a'} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {atmega ? (
        <group position={[cx, bodyY, cz]}>
          <mesh castShadow material={mat}>
            <boxGeometry args={[width * 1.1, 0.04, len + 0.03]} />
          </mesh>
          {/* 第 1 腳那端的半圓缺口與圓點 */}
          <mesh position={[0, 0.0205, -dir * (len / 2 + 0.015)]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <circleGeometry args={[0.012, 16, 0, Math.PI]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
          <mesh position={[0, 0.0206, 0]} rotation={[-Math.PI / 2, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2]} raycast={() => null}>
            <planeGeometry args={[len + 0.03, width * 1.1]} />
            <meshBasicMaterial map={part.burnt ? null : labelTex} toneMapped={false} />
          </mesh>
        </group>
      ) : (
        <group position={[cx, bodyY, cz]}>
          {/* 藍色轉接板 + SOP-16 + 石英 + Micro USB */}
          <mesh castShadow material={mat}>
            <boxGeometry args={[width + 0.06, 0.012, len + 0.14]} />
          </mesh>
          <mesh position={[0, 0.012, 0.01 * dir]} castShadow>
            <boxGeometry args={[0.1, 0.014, 0.12]} />
            <meshStandardMaterial color="#16171a" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.0195, 0.01 * dir]} rotation={[-Math.PI / 2, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2]} raycast={() => null}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial map={labelTex} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.012, dir * (len / 2 - 0.02)]} castShadow>
            <boxGeometry args={[0.08, 0.02, 0.035]} />
            <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.016, -dir * (len / 2 + 0.035)]} castShadow>
            <boxGeometry args={[0.07, 0.026, 0.06]} />
            <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.3} />
          </mesh>
          <UsbCable z={-dir * (len / 2 + 0.065)} dir={-dir} />
        </group>
      )}
      {hover !== null && <PinTip part={part} i={hover} at={pins[hover]} y={bodyY + 0.08} />}
    </group>
  );
}

function PinTip({ part, i, at, y }: { part: BoardPart; i: number; at: THREE.Vector3; y: number }) {
  const def = CHIP_PINS[part.kind as 'atmega' | 'ch340'][i];
  const b = getBench();
  const v = b.holeV(part.pins[i]);
  const g = b.holeV(part.pins[part.kind === 'atmega' ? AT.GND : CH.GND]) ?? 0;
  return (
    <Html zIndexRange={[10, 0]} position={[at.x, y, at.z]} center style={{ pointerEvents: 'none' }}>
      <div style={{
        whiteSpace: 'nowrap', background: 'rgba(10,10,26,0.94)', color: '#e0e0e0', fontSize: 12, fontFamily: FONT,
        padding: '4px 8px', borderRadius: 6, border: '1px solid #1f1f48', transform: 'translateY(-20px)',
      }}>
        <b style={{ color: '#00d2ff' }}>第 {i + 1} 腳 · {def.name}</b>
        {def.note && <span style={{ color: '#7a7ab0' }}>　{def.note}</span>}
        <div style={{ color: '#7dffb0' }}>{v === null ? '未接' : `${(v - g).toFixed(3)} V（對 GND 腳）`}</div>
      </div>
    </Html>
  );
}

/** 從 Micro USB 接出去、往麵包板後方拉到桌面（代表接到電腦） */
function UsbCable({ z, dir }: { z: number; dir: number }) {
  const geo = useMemo(() => {
    const from = new THREE.Vector3(0, 0.016, z);
    // 先往上翹、再往左拉出麵包板邊緣垂到桌面，不壓在其他零件上
    const pts = [from, from.clone().add(new THREE.Vector3(-0.02, 0.06, dir * 0.08)), from.clone().add(new THREE.Vector3(-0.35, 0.12, dir * 0.15)),
      from.clone().add(new THREE.Vector3(-0.8, 0.02, dir * 0.2)), from.clone().add(new THREE.Vector3(-1.1, -0.3, dir * 0.25))];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.014, 8, false);
  }, [z, dir]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow raycast={() => null}>
      <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
    </mesh>
  );
}
