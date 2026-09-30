// FLEX 10K FPGA 實驗板的 3D 外觀：EPF10K50E（QFP240）、EPC2 設定晶片、50 MHz 振盪器、JTAG 座、
// 8 顆 LED、兩位七段顯示器、8 位指撥開關（點一下切換）、4 顆按鍵（按住）、nCONFIG 重新設定鍵、
// Type-C 電源座 + 電源滑動開關、喇叭、紅色 RESET 鍵、2 個滑動開關、SD 與 TF（microSD）卡座（點卡座插拔卡片）
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { DevBoardDef } from '../boardDefs.js';
import { PCB_TOP } from '../boardDefs.js';
import { useFpga } from './fpgaStore.js';
import { useDev } from '../devStore.js';
import { audible } from './fpgaAudio.js';
import { fpgaLive } from './FpgaRuntime.js';
import { createCanvasTexture, FONT } from '../../panelTexture.js';

const LED_X = (i: number) => 0.42 - i * 0.11;
const SW_X = (i: number) => -0.08 - i * 0.09;
const KEY_X = (i: number) => 0.52 - i * 0.14;
const LED_Z = 0.22, SEG_Z = 0.55, SW_Z = 0.9, KEY_Z = 0.9;
const HEX_X = [0.18, -0.12];
const CHIP = { x: -0.05, z: -0.35, s: 0.62 };
const PWR = { x: -0.78, z: -0.62 }, SPK = { x: -0.66, z: 0.14 }, RST = { x: -0.8, z: 0.5 };
const SLD_X = [-0.48, -0.6], SLD_Z = 0.5;
const SD = { x: 0.75, z: 0.8 }, TF = { x: 0.8, z: -0.8 };

function Box({ at, size, color, metal = false, onClick }: {
  at: [number, number, number]; size: [number, number, number]; color: string; metal?: boolean; onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <mesh position={[at[0], PCB_TOP + size[1] / 2 + at[1], at[2]]} castShadow onClick={onClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metal ? 0.85 : 0.1} roughness={metal ? 0.3 : 0.5} />
    </mesh>
  );
}

/** 板上絲印（透明底，疊在 PCB 貼圖上） */
function useSilk(d: DevBoardDef) {
  const tex = useMemo(() => createCanvasTexture(d.size.w, d.size.d, (p) => {
    const { ctx } = p;
    const t = (s: string, x: number, z: number, size = 0.035, weight = 700) => {
      ctx.font = `${weight} ${p.s(size)}px ${FONT}`;
      ctx.fillText(s, p.x(x), p.y(-z));
    };
    ctx.fillStyle = '#f2f4f7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    t('RealCad FLEX 10K Lab Board', -0.15, -0.98, 0.06, 800);
    t('EPF10K50EQC240-1', -0.15, -0.9, 0.035);
    for (let i = 0; i < 8; i++) { t(`LED${i}`, LED_X(i), LED_Z + 0.07, 0.028); t(`SW${i}`, SW_X(i), SW_Z + 0.11, 0.028); }
    for (let i = 0; i < 4; i++) t(`KEY${i}`, KEY_X(i), KEY_Z + 0.11, 0.028);
    t('ON ↑', -0.4, SW_Z - 0.1, 0.028);
    t('HEX1', HEX_X[1], SEG_Z + 0.21, 0.03); t('HEX0', HEX_X[0], SEG_Z + 0.21, 0.03);
    t('JTAG', -0.72, -0.04, 0.03); t('EPC2', -0.58, -0.66, 0.03);
    t('POWER', -0.6, -0.72 - 0.16, 0.026); t('CONF_DONE', 0.45, -0.52, 0.026);
    t('nCONFIG', 0.45, -0.3, 0.026); t('50 MHz', 0.45, -0.73, 0.026);
    t('J1', 0.745, -0.5, 0.04, 800);
    t('PWR', PWR.x, PWR.z + 0.13, 0.026); t('ON ↑', PWR.x, PWR.z - 0.13, 0.022);
    t('TYPE-C 5V', -0.74, -1.05, 0.024);
    t('SPEAKER', SPK.x, SPK.z + 0.13, 0.026);
    t('RESET', RST.x, RST.z + 0.1, 0.026);
    t('SLD1', SLD_X[1], SLD_Z + 0.1, 0.026); t('SLD0', SLD_X[0], SLD_Z + 0.1, 0.026);
    t('SD', SD.x, SD.z + 0.17, 0.03); t('TF', TF.x, TF.z + 0.11, 0.03);
  }, 600), [d]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

function useChipTex() {
  const tex = useMemo(() => createCanvasTexture(CHIP.s, CHIP.s, (p) => {
    const { ctx } = p;
    ctx.fillStyle = '#17181b';
    ctx.fillRect(0, 0, p.s(CHIP.s), p.s(CHIP.s));
    ctx.fillStyle = '#c8ccd2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${p.s(0.075)}px ${FONT}`;
    ctx.fillText('ALTERA', p.x(0), p.y(0.12));
    ctx.font = `700 ${p.s(0.05)}px ${FONT}`;
    ctx.fillText('FLEX 10KE', p.x(0), p.y(0.03));
    ctx.font = `600 ${p.s(0.042)}px ${FONT}`;
    ctx.fillText('EPF10K50EQC240-1', p.x(0), p.y(-0.05));
    ctx.fillText('QFP-240', p.x(0), p.y(-0.12));
    ctx.beginPath();
    ctx.arc(p.x(-0.24), p.y(0.24), p.s(0.02), 0, Math.PI * 2);
    ctx.fill();
  }, 512), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

const SEGS: [number, number, number, number][] = [ // x, z, 長, 直的?
  [0, -0.11, 0.1, 0], [0.06, -0.055, 0.09, 1], [0.06, 0.055, 0.09, 1], [0, 0.11, 0.1, 0],
  [-0.06, 0.055, 0.09, 1], [-0.06, -0.055, 0.09, 1], [0, 0, 0.1, 0], [0.09, 0.12, 0.018, 0],
];

function onMat(color: string) {
  return new THREE.MeshStandardMaterial({ color: '#2a1010', emissive: color, emissiveIntensity: 0, toneMapped: false });
}

/** LED / 七段顯示器：每幀依 fpgaLive 的亮度更新材質（不觸發 React 重繪） */
function Lights({ powered }: { powered: boolean }) {
  const leds = useMemo(() => Array.from({ length: 8 }, () => onMat('#ff2a1a')), []);
  const segs = useMemo(() => [0, 1].map(() => SEGS.map(() => onMat('#ff3020'))), []);
  const conf = useMemo(() => onMat('#3cff5a'), []);
  const pwr = useMemo(() => onMat('#ff2a1a'), []);
  useEffect(() => () => { [...leds, ...segs.flat(), conf, pwr].forEach((m) => m.dispose()); }, [leds, segs, conf, pwr]);
  useFrame(() => {
    const set = (m: THREE.MeshStandardMaterial, k: number) => {
      m.emissiveIntensity = k * 3;
      m.color.set(k > 0.02 ? '#ff6050' : '#2a1010');
    };
    leds.forEach((m, i) => set(m, powered ? fpgaLive.led[i] : 0));
    segs.forEach((digit, h) => digit.forEach((m, i) => set(m, powered ? 1 - fpgaLive.seg[h][i] : 0)));
    conf.emissiveIntensity = powered && fpgaLive.configured ? 3 : 0;
    pwr.emissiveIntensity = powered ? 3 : 0;
  });
  return (
    <>
      {leds.map((m, i) => (
        <mesh key={i} material={m} position={[LED_X(i), PCB_TOP + 0.012, LED_Z]} raycast={() => null}>
          <boxGeometry args={[0.04, 0.024, 0.055]} />
        </mesh>
      ))}
      {segs.map((digit, h) => (
        <group key={h} position={[HEX_X[h], PCB_TOP + 0.042, SEG_Z]}>
          <mesh position={[0, -0.02, 0]} raycast={() => null} castShadow>
            <boxGeometry args={[0.2, 0.04, 0.3]} />
            <meshStandardMaterial color="#141414" roughness={0.4} />
          </mesh>
          {digit.map((m, i) => {
            const [x, z, len, vert] = SEGS[i];
            return (
              <mesh key={i} material={m} position={[x, 0.001, z]} raycast={() => null}>
                <boxGeometry args={vert ? [0.018, 0.002, len] : i === 7 ? [0.018, 0.002, 0.018] : [len, 0.002, 0.018]} />
              </mesh>
            );
          })}
        </group>
      ))}
      <mesh material={conf} position={[0.45, PCB_TOP + 0.01, -0.6]} raycast={() => null}><boxGeometry args={[0.03, 0.02, 0.02]} /></mesh>
      <mesh material={pwr} position={[-0.6, PCB_TOP + 0.01, -0.8]} raycast={() => null}><boxGeometry args={[0.03, 0.02, 0.02]} /></mesh>
    </>
  );
}

const stop = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation();
const pointer = { onPointerOver: () => { document.body.style.cursor = 'pointer'; }, onPointerOut: () => { document.body.style.cursor = 'auto'; } };

function Switches() {
  const sw = useFpga((s) => s.sw);
  return (
    <>
      <Box at={[(SW_X(0) + SW_X(7)) / 2, 0, SW_Z]} size={[0.76, 0.05, 0.16]} color="#c0262a" />
      {Array.from({ length: 8 }, (_, i) => {
        const on = (sw >> i) & 1;
        return (
          <mesh key={i} position={[SW_X(i), PCB_TOP + 0.06, SW_Z + (on ? -0.03 : 0.03)]} castShadow {...pointer}
            onClick={(e) => { stop(e); if (e.delta <= 4) useFpga.getState().toggleSw(i); }}>
            <boxGeometry args={[0.05, 0.03, 0.06]} />
            <meshStandardMaterial color={on ? '#ffffff' : '#d8d8d8'} emissive={on ? '#335' : '#000'} />
          </mesh>
        );
      })}
    </>
  );
}

function Keys() {
  const keys = useFpga((s) => s.keys);
  const colors = ['#e8e8e8', '#e8e8e8', '#e8e8e8', '#e8e8e8'];
  return (
    <>
      {colors.map((c, i) => {
        const down = (keys >> i) & 1;
        const set = (v: boolean) => (e: ThreeEvent<PointerEvent>) => { stop(e); useFpga.getState().setKey(i, v); };
        return (
          <group key={i} position={[KEY_X(i), 0, KEY_Z]}>
            <Box at={[0, 0, 0]} size={[0.11, 0.035, 0.11]} color="#26272b" metal />
            <mesh position={[0, PCB_TOP + 0.035 + (down ? 0.008 : 0.02), 0]} castShadow
              onPointerDown={set(true)} onPointerUp={set(false)} onClick={stop}
              onPointerOver={pointer.onPointerOver}
              onPointerOut={(e) => { pointer.onPointerOut(); if (down) set(false)(e); }}>
              <cylinderGeometry args={[0.032, 0.034, 0.03, 16]} />
              <meshStandardMaterial color={down ? '#9aa' : c} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function NConfig() {
  const [down, setDown] = useState(false);
  return (
    <mesh position={[0.45, PCB_TOP + 0.02 + (down ? 0 : 0.008), -0.38]} castShadow {...pointer}
      onPointerDown={(e) => { stop(e); setDown(true); }} onPointerUp={(e) => { stop(e); setDown(false); useFpga.getState().reconfigure(); }}
      onClick={stop}>
      <cylinderGeometry args={[0.022, 0.022, 0.02, 12]} />
      <meshStandardMaterial color="#2a2a2e" />
    </mesh>
  );
}

export function FpgaDetails({ d, powered }: { d: DevBoardDef; powered: boolean }) {
  const silk = useSilk(d);
  const chipTex = useChipTex();
  const W = d.size.w;
  const busy = useFpga((s) => s.prog.progress !== null);
  const blink = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => { if (blink.current) blink.current.emissiveIntensity = busy ? (Math.sin(clock.elapsedTime * 20) > 0 ? 3 : 0) : 0; });
  return (
    <>
      <mesh position={[0, PCB_TOP + 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[d.size.w, d.size.d]} />
        <meshStandardMaterial map={silk} transparent depthWrite={false} />
      </mesh>
      {/* FPGA 本體：接腳框 + 黑色封裝 + 印字 */}
      <Box at={[CHIP.x, 0, CHIP.z]} size={[CHIP.s + 0.07, 0.006, CHIP.s + 0.07]} color="#b9bec6" metal />
      <Box at={[CHIP.x, 0.004, CHIP.z]} size={[CHIP.s, 0.028, CHIP.s]} color="#17181b" />
      <mesh position={[CHIP.x, PCB_TOP + 0.0325, CHIP.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[CHIP.s, CHIP.s]} />
        <meshStandardMaterial map={chipTex} roughness={0.5} />
      </mesh>
      {/* EPC2 設定晶片（PLCC20）、振盪器、JTAG 座、電源座 */}
      <Box at={[-0.58, 0, -0.52]} size={[0.16, 0.04, 0.16]} color="#1b1c1f" />
      <Box at={[0.45, 0, -0.84]} size={[0.14, 0.05, 0.09]} color="#c9ced4" metal />
      <Box at={[-0.72, 0, -0.2]} size={[0.12, 0.09, 0.25]} color="#16171a" />
      <TypeC x={-W / 2 + 0.045} z={-D2(d) + 0.2} />
      <PowerSwitch />
      <Speaker powered={powered} />
      <ResetButton />
      <Slides />
      <CardSlot which="sd" />
      <CardSlot which="tf" />
      <mesh position={[-0.72, PCB_TOP + 0.1, 0.0]} raycast={() => null}>
        <boxGeometry args={[0.03, 0.015, 0.02]} />
        <meshStandardMaterial ref={blink} color="#2a2000" emissive="#ffb020" emissiveIntensity={0} toneMapped={false} />
      </mesh>
      <Lights powered={powered} />
      <Switches />
      <Keys />
      <NConfig />
    </>
  );
}
const D2 = (d: DevBoardDef) => d.size.d / 2;

/** Type-C 電源座：金屬外殼 + 黑色開口（USB 線從左邊接出去） */
function TypeC({ x, z }: { x: number; z: number }) {
  return (
    <>
      <Box at={[x, 0, z]} size={[0.09, 0.035, 0.12]} color="#c9ced4" metal />
      <mesh position={[x - 0.046, PCB_TOP + 0.0175, z]} rotation={[0, -Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[0.1, 0.022]} />
        <meshBasicMaterial color="#111" />
      </mesh>
    </>
  );
}

/** 滑動開關本體 + 撥桿；on = 撥到後面（絲印 ON ↑ 那邊） */
function SlideSwitch({ x, z, on, onToggle, long = 0.12 }: { x: number; z: number; on: boolean; onToggle: () => void; long?: number }) {
  return (
    <group>
      <Box at={[x, 0, z]} size={[0.06, 0.035, long]} color="#1c1d21" />
      <mesh position={[x, PCB_TOP + 0.045, z + (on ? -1 : 1) * long * 0.22]} castShadow {...pointer}
        onClick={(e) => { stop(e); if (e.delta <= 4) onToggle(); }}>
        <boxGeometry args={[0.03, 0.025, 0.045]} />
        <meshStandardMaterial color="#e8e8e8" />
      </mesh>
      {/* 點本體也能切換 */}
      <mesh position={[x, PCB_TOP + 0.02, z]} {...pointer} onClick={(e) => { stop(e); if (e.delta <= 4) onToggle(); }}>
        <boxGeometry args={[0.062, 0.036, long]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function PowerSwitch() {
  const usb = useDev((s) => s.conf.fpga.usb);
  return <SlideSwitch x={PWR.x} z={PWR.z} on={usb} onToggle={() => useDev.getState().setUsb('fpga', !useDev.getState().conf.fpga.usb)} long={0.14} />;
}

function Slides() {
  const slides = useFpga((s) => s.slides);
  return <>{SLD_X.map((x, i) => <SlideSwitch key={i} x={x} z={SLD_Z} on={!!((slides >> i) & 1)} onToggle={() => useFpga.getState().toggleSlide(i)} />)}</>;
}

/** 喇叭（蜂鳴器）：發聲時振膜跟著抖 */
function Speaker({ powered }: { powered: boolean }) {
  const cone = useRef<THREE.Mesh>(null);
  const muted = useFpga((s) => !s.speaker);
  useFrame(({ clock }) => {
    if (!cone.current) return;
    const on = powered && !muted && audible(fpgaLive.spkHz);
    cone.current.position.y = PCB_TOP + 0.052 + (on ? 0.004 * Math.sin(clock.elapsedTime * 90) : 0);
  });
  return (
    <group>
      <mesh position={[SPK.x, PCB_TOP + 0.025, SPK.z]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.085, 0.085, 0.05, 28]} />
        <meshStandardMaterial color="#17181b" roughness={0.5} />
      </mesh>
      <mesh ref={cone} position={[SPK.x, PCB_TOP + 0.052, SPK.z]} raycast={() => null}>
        <cylinderGeometry args={[0.06, 0.07, 0.006, 28]} />
        <meshStandardMaterial color="#3a3a40" roughness={0.8} />
      </mesh>
      <mesh position={[SPK.x, PCB_TOP + 0.057, SPK.z]} raycast={() => null}>
        <cylinderGeometry args={[0.012, 0.012, 0.004, 12]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
    </group>
  );
}

/** 紅色 RESET 按鍵：按住 = 0 */
function ResetButton() {
  const down = useFpga((s) => s.reset);
  const set = (v: boolean) => (e: ThreeEvent<PointerEvent>) => { stop(e); useFpga.getState().setReset(v); };
  return (
    <group position={[RST.x, 0, RST.z]}>
      <Box at={[0, 0, 0]} size={[0.11, 0.035, 0.11]} color="#26272b" metal />
      <mesh position={[0, PCB_TOP + 0.035 + (down ? 0.008 : 0.02), 0]} castShadow
        onPointerDown={set(true)} onPointerUp={set(false)} onClick={stop}
        onPointerOver={pointer.onPointerOver}
        onPointerOut={(e) => { pointer.onPointerOut(); if (useFpga.getState().reset) set(false)(e); }}>
        <cylinderGeometry args={[0.036, 0.038, 0.03, 18]} />
        <meshStandardMaterial color={down ? '#8a1414' : '#e02020'} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** SD / TF 卡座：點一下插入或退出卡片（卡片從板子右邊插進去） */
function CardSlot({ which }: { which: 'sd' | 'tf' }) {
  const inserted = useFpga((s) => (which === 'sd' ? s.sdCard : s.tfCard));
  const c = which === 'sd' ? SD : TF;
  const slot: [number, number, number] = which === 'sd' ? [0.3, 0.03, 0.26] : [0.18, 0.022, 0.15];
  const card: [number, number, number] = which === 'sd' ? [0.32, 0.01, 0.24] : [0.15, 0.007, 0.11];
  const toggle = (e: ThreeEvent<MouseEvent>) => { stop(e); if (e.delta <= 4) useFpga.getState().toggleCard(which); };
  return (
    <group>
      <mesh position={[c.x, PCB_TOP + slot[1] / 2, c.z]} castShadow {...pointer} onClick={toggle}>
        <boxGeometry args={slot} />
        <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.3} />
      </mesh>
      {inserted && (
        <mesh position={[c.x + slot[0] / 2 - card[0] / 2 + (which === 'sd' ? 0.08 : 0.05), PCB_TOP + slot[1] * 0.5, c.z]} castShadow {...pointer} onClick={toggle}>
          <boxGeometry args={card} />
          <meshStandardMaterial color={which === 'sd' ? '#1d4fb8' : '#202225'} roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}
