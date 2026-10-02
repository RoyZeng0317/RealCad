// 開發板 3D 模型：PCB（含絲印腳位名稱）、排針（Uno 母座 / 其他公針）、主要晶片與接頭、板載 LED、ERROR 標籤；
// 滑鼠移到排針上顯示腳位與電壓，選「杜邦線」工具時點排針就能接線
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { DEV_BOARDS, PCB_TOP, pinTopY, devPinOwner, type DevKind, type DevBoardDef, type PinDef } from './boardDefs.js';
import { useDev, isPowered } from './devStore.js';
import { MODE } from './sketchRun.js';
import { useBoard } from '../boardStore.js';
import { getBench } from '../bench.js';
import { createCanvasTexture, FONT } from '../panelTexture.js';
import { P } from '../breadboardGrid.js';
import { FpgaDetails } from './fpga/FpgaBoard3D.js';

const PCB_H = 0.03;
const MODE_NAME = ['INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN'];

/** 把腳位依「同一排、相鄰」分組，一組做一條排針座 */
function headerGroups(pins: PinDef[]) {
  const rows = new Map<number, PinDef[]>();
  for (const p of pins) {
    const z = Math.round(p.z * 1000);
    rows.set(z, [...(rows.get(z) ?? []), p]);
  }
  const groups: { x0: number; x1: number; z: number }[] = [];
  for (const [, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    let start = row[0];
    let prev = row[0];
    for (const p of row.slice(1).concat([null as unknown as PinDef])) {
      if (!p || p.x - prev.x > P * 1.5) {
        groups.push({ x0: start.x, x1: prev.x, z: start.z });
        if (p) start = p;
      }
      if (p) prev = p;
    }
  }
  return groups;
}

function silkscreen(d: DevBoardDef) {
  const { w, d: dd } = d.size;
  return createCanvasTexture(w, dd, (p) => {
    const { ctx } = p;
    ctx.fillStyle = d.pcb;
    ctx.fillRect(0, 0, p.s(w), p.s(dd));
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(p.x(-w / 2), p.y(dd / 2 - (i * dd) / 6)); ctx.lineTo(p.x(w / 2), p.y(dd / 2 - (i * dd) / 6)); ctx.stroke(); }
    ctx.fillStyle = '#f2f4f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 腳位名稱印在排針往板子中心那一側
    ctx.font = `700 ${p.s(P * 0.42)}px ${FONT}`;
    for (const pin of d.pins) {
      const off = pin.z < 0 ? P * 0.85 : -P * 0.85;
      ctx.save();
      // FPGA 的 J1 是直排的雙排針：名稱印在左右兩側
      if (d.kind === 'fpga') ctx.translate(p.x(pin.x + (pin.x < 0.74 ? -P * 1.05 : P * 1.05)), p.y(-pin.z));
      else ctx.translate(p.x(pin.x), p.y(-(pin.z + off)));
      if (d.kind !== 'uno' && d.kind !== 'fpga') ctx.rotate(-Math.PI / 2);
      ctx.fillText(pin.label, 0, 0);
      ctx.restore();
    }
    ctx.font = `800 ${p.s(P * 1.0)}px ${FONT}`;
    if (d.kind === 'fpga') return;
    const title = d.kind === 'uno' ? 'UNO' : d.kind === 'pi5' ? 'Raspberry Pi 5' : d.kind === 'esp32' ? 'ESP32-DevKitC' : 'STM32F103';
    ctx.fillText(title, p.x(d.kind === 'uno' ? 1.2 * P : d.kind === 'pi5' ? -3 * P : 0), p.y(d.kind === 'uno' ? -2.5 * P : d.kind === 'pi5' ? -4 * P : 0));
  }, 520);
}

function Box({ at, size, color, metal = false, rough = 0.5 }: { at: [number, number, number]; size: [number, number, number]; color: string; metal?: boolean; rough?: number }) {
  return (
    <mesh position={[at[0], PCB_TOP + size[1] / 2 + at[1], at[2]]} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal ? 0.85 : 0.1} roughness={metal ? 0.3 : rough} />
    </mesh>
  );
}

function BoardLed({ at, color, on, k = 1 }: { at: [number, number]; color: string; on: boolean; k?: number }) {
  return (
    <mesh position={[at[0], PCB_TOP + 0.01, at[1]]}>
      <boxGeometry args={[0.03, 0.02, 0.02]} />
      <meshStandardMaterial color={on ? color : '#3a3a3a'} emissive={on ? color : '#000'} emissiveIntensity={on ? 2.5 * k : 0} toneMapped={false} />
    </mesh>
  );
}

/** 各板子的主要零件外觀 */
function Details({ d, powered, ledOn, ledK, running }: { d: DevBoardDef; powered: boolean; ledOn: boolean; ledK: number; running: boolean }) {
  const W = d.size.w, D = d.size.d;
  if (d.kind === 'fpga') return <FpgaDetails d={d} powered={powered} />;
  if (d.kind === 'uno') return (
    <>
      <Box at={[-W / 2 + 0.08, 0, -0.18]} size={[0.24, 0.2, 0.21]} color="#c9ced4" metal />
      <Box at={[-W / 2 + 0.07, 0, 0.28]} size={[0.25, 0.19, 0.16]} color="#111" />
      <Box at={[0.18, 0, 0.18]} size={[0.64, 0.07, 0.14]} color="#16181b" />
      <Box at={[-0.2, 0, -0.18]} size={[0.1, 0.06, 0.05]} color="#c9ced4" metal />
      <Box at={[-0.42, 0, -0.34]} size={[0.07, 0.04, 0.07]} color="#9a2020" />
      <BoardLed at={[0.05, -0.22]} color="#ffb020" on={ledOn} k={ledK} />
      <BoardLed at={[0.05, -0.15]} color="#ffb020" on={false} />
      <BoardLed at={[0.05, -0.08]} color="#ffb020" on={false} />
      <BoardLed at={[0.46, -0.05]} color="#3cff5a" on={powered} />
    </>
  );
  if (d.kind === 'esp32') return (
    <>
      <Box at={[-0.08, 0, 0]} size={[0.32, 0.055, 0.3]} color="#c9ced4" metal />
      <Box at={[-0.34, 0, 0]} size={[0.2, 0.012, 0.3]} color="#1d1d1f" />
      <Box at={[W / 2 - 0.05, 0, 0]} size={[0.1, 0.05, 0.14]} color="#c9ced4" metal />
      <Box at={[0.3, 0, 0.14]} size={[0.07, 0.04, 0.06]} color="#222" />
      <Box at={[0.3, 0, -0.14]} size={[0.07, 0.04, 0.06]} color="#222" />
      <BoardLed at={[0.22, 0.05]} color="#ff2a1a" on={powered} />
      <BoardLed at={[0.22, -0.05]} color={d.led!.color} on={ledOn} k={ledK} />
    </>
  );
  if (d.kind === 'stm32') return (
    <>
      <mesh position={[0.02, PCB_TOP + 0.01, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[0.13, 0.02, 0.13]} />
        <meshStandardMaterial color="#16181b" roughness={0.5} />
      </mesh>
      <Box at={[-W / 2 + 0.05, 0, 0]} size={[0.1, 0.05, 0.14]} color="#c9ced4" metal />
      <Box at={[-0.2, 0, 0.05]} size={[0.05, 0.05, 0.04]} color="#e0c020" />
      <Box at={[-0.2, 0, -0.05]} size={[0.05, 0.05, 0.04]} color="#e0c020" />
      <Box at={[0.25, 0, 0.05]} size={[0.06, 0.03, 0.05]} color="#ddd" />
      <BoardLed at={[-0.32, 0.07]} color="#ff2a1a" on={powered} />
      <BoardLed at={[-0.32, -0.07]} color={d.led!.color} on={ledOn} k={ledK} />
    </>
  );
  return (
    <>
      <Box at={[-0.1, 0, 0.05]} size={[0.26, 0.03, 0.26]} color="#c9ced4" metal />
      <Box at={[0.22, 0, 0.05]} size={[0.16, 0.02, 0.14]} color="#16181b" />
      <Box at={[0.3, 0, -0.18]} size={[0.14, 0.02, 0.12]} color="#16181b" />
      <Box at={[W / 2 - 0.13, 0, 0.3]} size={[0.3, 0.24, 0.26]} color="#c9ced4" metal />
      <Box at={[W / 2 - 0.13, 0, 0.02]} size={[0.3, 0.28, 0.24]} color="#2a5ad4" />
      <Box at={[W / 2 - 0.13, 0, -0.25]} size={[0.3, 0.28, 0.24]} color="#1b1d20" />
      <Box at={[-W / 2 + 0.2, 0, D / 2 - 0.05]} size={[0.16, 0.06, 0.1]} color="#c9ced4" metal />
      <Box at={[-0.35, 0, D / 2 - 0.05]} size={[0.12, 0.05, 0.1]} color="#c9ced4" metal />
      <Box at={[-0.12, 0, D / 2 - 0.05]} size={[0.12, 0.05, 0.1]} color="#c9ced4" metal />
      <BoardLed at={[-W / 2 + 0.08, D / 2 - 0.2]} color="#ff2a1a" on={powered} />
      <BoardLed at={[-W / 2 + 0.08, D / 2 - 0.25]} color="#3cff5a" on={running} />
    </>
  );
}

function MalePins({ d }: { d: DevBoardDef }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const top = pinTopY(d);
  useEffect(() => {
    const m = new THREE.Matrix4();
    d.pins.forEach((p, i) => { m.makeTranslation(p.x, (PCB_TOP + top) / 2, p.z); ref.current?.setMatrixAt(i, m); });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [d, top]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, d.pins.length]} castShadow raycast={() => null}>
      <boxGeometry args={[0.012, top - PCB_TOP, 0.012]} />
      <meshStandardMaterial color="#d9c27a" metalness={0.9} roughness={0.3} />
    </instancedMesh>
  );
}

function Headers({ d }: { d: DevBoardDef }) {
  const groups = useMemo(() => headerGroups(d.pins), [d]);
  const h = d.female ? pinTopY(d) - PCB_TOP : 0.045;
  return (
    <>
      {groups.map((g, i) => (
        <mesh key={i} position={[(g.x0 + g.x1) / 2, PCB_TOP + h / 2, g.z]} castShadow raycast={() => null}>
          <boxGeometry args={[g.x1 - g.x0 + P, h, P * 0.95]} />
          <meshStandardMaterial color="#141414" roughness={0.6} />
        </mesh>
      ))}
      {d.female
        ? d.pins.map((p) => (
          <mesh key={p.id} position={[p.x, pinTopY(d) + 0.0015, p.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[P * 0.45, P * 0.45]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
        ))
        : <MalePins d={d} />}
    </>
  );
}

function PinTip({ d, pin }: { d: DevBoardDef; pin: PinDef }) {
  const k = d.kind;
  const rt = useDev((s) => s.rt[k]);
  const owner = devPinOwner(k, pin);
  const st = rt.pins[owner.id];
  const b = getBench();
  const gnd = d.pins.find((p) => p.kind === 'GND')!.id;
  const v = b.holeV(`h:${k}:${pin.id}`);
  const g = b.sol.nodeV[b.netOfHole(`h:${k}:${gnd}`)] ?? 0;
  const tags = [pin.gpio !== undefined ? `GPIO ${pin.gpio}` : '', pin.adc ? 'ADC' : '', pin.pwm ? 'PWM' : '', pin.ft ? '5V 耐壓' : ''].filter(Boolean).join('・');
  return (
    <Html zIndexRange={[10, 0]} position={[pin.x, pinTopY(d) + 0.08, pin.z]} center style={{ pointerEvents: 'none' }}>
      <div style={{
        whiteSpace: 'nowrap', background: 'rgba(10,10,26,0.94)', color: '#e0e0e0', fontSize: 12, fontFamily: FONT,
        padding: '4px 8px', borderRadius: 6, border: '1px solid #1f1f48', transform: 'translateY(-24px)',
      }}>
        <b style={{ color: '#00d2ff' }}>{d.name} · {pin.label}</b>{tags && <span style={{ color: '#7a7ab0' }}>　{tags}</span>}
        {pin.note && <div style={{ color: '#7a7ab0' }}>{pin.note}</div>}
        <div>
          {rt.dead.includes(owner.id) ? <span style={{ color: '#ff4d3a' }}>已燒毀</span>
            : st ? <span style={{ color: '#ffd21f' }}>{MODE_NAME[st.mode]}{st.mode === MODE.OUTPUT ? ` ${st.level === 1 ? 'HIGH' : st.level === 0 ? 'LOW' : `PWM ${Math.round(st.level * 100)}%`}` : ''}</span> : null}
          <span style={{ color: '#7dffb0' }}>　{v === null ? '未接' : `${(v - g).toFixed(3)} V`}</span>
        </div>
      </div>
    </Html>
  );
}

export function DevBoard3D({ kind }: { kind: DevKind }) {
  const d = DEV_BOARDS[kind];
  const powered = useDev((s) => isPowered(s, kind));
  const rt = useDev((s) => s.rt[kind]);
  const selected = useDev((s) => s.selected === kind);
  const usb = useDev((s) => s.conf[kind].usb);
  const tex = useMemo(() => silkscreen(d), [d]);
  useEffect(() => () => tex.dispose(), [tex]);
  const [hover, setHover] = useState<PinDef | null>(null);
  const group = useRef<THREE.Group>(null);

  // 板載 LED：看程式對那隻腳的輸出（Blue Pill 的 PC13 是低電位點亮）
  let ledOn = false, ledK = 1;
  if (d.led && powered) {
    const pinId = d.pins.find((p) => p.gpio === d.led!.gpio)?.id;
    const st = pinId ? rt.pins[pinId] : undefined;
    if (st && st.mode === MODE.OUTPUT) {
      const lvl = d.led.activeLow ? 1 - st.level : st.level;
      ledOn = lvl > 0.02;
      ledK = lvl;
    }
  }
  const hasError = rt.tripped || rt.dead.length > 0 || rt.issues.some((i) => i.severity === 'error') || rt.status === 'error';

  const nearest = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!group.current) return null;
    const l = group.current.worldToLocal(e.point.clone());
    let best: PinDef | null = null, bd = P * 0.6;
    for (const p of d.pins) {
      const dist = Math.hypot(l.x - p.x, l.z - p.z);
      if (dist < bd) { bd = dist; best = p; }
    }
    return best;
  };
  const selectBoard = () => { useDev.getState().select(kind); useBoard.getState().selectPart(null); };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = nearest(e);
    if (p?.id !== hover?.id) {
      setHover(p);
      useBoard.getState().setHoverHole(p ? `h:${kind}:${p.id}` : null);
      document.body.style.cursor = p ? 'crosshair' : 'pointer';
    }
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    const p = nearest(e);
    const tool = useBoard.getState().tool;
    if (p && tool !== 'select') useBoard.getState().clickHole(`h:${kind}:${p.id}`);
    else selectBoard();
  };

  const top = pinTopY(d);
  return (
    <group ref={group} position={[d.slot.x, 0, d.slot.z]}>
      {/* 銅柱 */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (d.size.w / 2 - 0.06), (PCB_TOP - PCB_H) / 2, sz * (d.size.d / 2 - 0.06)]}>
          <cylinderGeometry args={[0.02, 0.02, PCB_TOP - PCB_H, 8]} />
          <meshStandardMaterial color="#c9a24a" metalness={0.8} roughness={0.3} />
        </mesh>
      )))}
      <RoundedBox args={[d.size.w, PCB_H, d.size.d]} radius={0.012} smoothness={2} position={[0, PCB_TOP - PCB_H / 2, 0]} castShadow receiveShadow
        onClick={d.sensor ? (e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          selectBoard();
        } : undefined}>
        <meshStandardMaterial color={d.pcb} roughness={0.6} emissive={selected ? '#2f8cff' : '#000'} emissiveIntensity={selected ? 0.25 : 0} />
      </RoundedBox>
      <mesh position={[0, PCB_TOP + 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[d.size.w, d.size.d]} />
        <meshStandardMaterial map={tex} roughness={0.6} />
      </mesh>
      <Headers d={d} />
      <Details d={d} powered={powered} ledOn={ledOn} ledK={ledK} running={rt.status === 'running' || rt.status === 'sleeping'} />
      {usb && <UsbCable d={d} />}

      {/* 點擊 / 滑鼠感應面：排針頂端高度、整塊板子大小（透明）；FPGA 板另外還有 J2 ~ J4 的感應區 */}
      {[d.sensor ?? { x: 0, z: 0, w: d.size.w, d: d.size.d }, ...(d.sensors ?? [])].map((r, i) => (
        <mesh key={i} position={[r.x, top + 0.002, r.z]} rotation={[-Math.PI / 2, 0, 0]}
          onPointerMove={onMove} onClick={onClick}
          onPointerOut={() => { setHover(null); useBoard.getState().setHoverHole(null); document.body.style.cursor = 'auto'; }}>
          <planeGeometry args={[r.w, r.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {hover && (
        <>
          <mesh position={[hover.x, top + 0.004, hover.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[P * 0.3, P * 0.5, 20]} />
            <meshBasicMaterial color="#39ff6a" toneMapped={false} />
          </mesh>
          <PinTip d={d} pin={hover} />
        </>
      )}
      {hasError && <ErrorBadge tripped={rt.tripped} />}
    </group>
  );
}

function ErrorBadge({ tripped }: { tripped: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.style.opacity = String(0.55 + 0.45 * Math.abs(Math.sin(clock.elapsedTime * 4))); });
  return (
    <Html zIndexRange={[10, 0]} position={[0, 0.45, 0]} center style={{ pointerEvents: 'none' }}>
      <div ref={ref} style={{
        background: '#c01818', color: '#fff', fontWeight: 800, fontSize: 13, fontFamily: FONT,
        padding: '3px 10px', borderRadius: 6, boxShadow: '0 0 12px rgba(255,40,40,0.8)', whiteSpace: 'nowrap',
      }}>
        ⚠ ERROR{tripped ? '・USB 保險絲跳脫' : ''}
      </div>
    </Html>
  );
}

/** USB 線：從板子的 USB 接頭往桌子後方拉出去（代表接電腦供電） */
function UsbCable({ d }: { d: DevBoardDef }) {
  const geo = useMemo(() => {
    const W = d.size.w, D = d.size.d;
    const start = d.kind === 'fpga' ? new THREE.Vector3(-W / 2 - 0.05, PCB_TOP + 0.03, -D / 2 + 0.2)
      : d.kind === 'pi5' ? new THREE.Vector3(-W / 2 + 0.2, PCB_TOP + 0.03, D / 2 + 0.05)
      : d.kind === 'uno' ? new THREE.Vector3(-W / 2 - 0.05, PCB_TOP + 0.1, -0.18)
      : d.kind === 'esp32' ? new THREE.Vector3(W / 2 + 0.05, PCB_TOP + 0.02, 0)
      : new THREE.Vector3(-W / 2 - 0.05, PCB_TOP + 0.02, 0);
    const dir = d.kind === 'pi5' ? new THREE.Vector3(0, 0, 1) : d.kind === 'esp32' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
    const pts = [start, start.clone().addScaledVector(dir, 0.25).setY(0.03), start.clone().addScaledVector(dir, 0.45).setY(0.02).add(new THREE.Vector3(0.1, 0, 0.35))];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.022, 8, false);
  }, [d]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow raycast={() => null}>
      <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
    </mesh>
  );
}

export function DevBoards3D() {
  const conf = useDev((s) => s.conf);
  return <>{(Object.keys(conf) as DevKind[]).filter((k) => conf[k].present).map((k) => <DevBoard3D key={k} kind={k} />)}</>;
}
