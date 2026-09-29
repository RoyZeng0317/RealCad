// 儀器面板上可互動的 3D 零件：旋鈕、按鍵、LED、BNC 端子
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useWaveLab } from './waveStore.js';
import { createCanvasTexture, FONT } from './panelTexture.js';

type Vec3 = [number, number, number];

const setCursor = (c: string) => { document.body.style.cursor = c; };

/**
 * 旋鈕：按住往上/往下拖曳、或在旋鈕上滾動滑鼠滾輪來轉動；按住 Shift 為微調。
 * 旋鈕是無限旋轉的編碼器（跟真實數位儀器一樣），每轉一格呼叫一次 onStep。
 */
export function Knob3D({
  position, radius = 0.2, onStep, color = '#26292e', capColor = '#aab2bb',
}: {
  position: Vec3;
  radius?: number;
  onStep: (steps: number, fine: boolean) => void;
  color?: string;
  capColor?: string;
}) {
  const spin = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const setDragging = useWaveLab((s) => s.setDragging);
  const setKnobHover = useWaveLab((s) => s.setKnobHover);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  const turn = (steps: number, fine: boolean) => {
    if (spin.current) spin.current.rotation.z -= steps * 0.18;
    onStepRef.current(steps, fine);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(true);
    let acc = 0;
    let lastY = e.nativeEvent.clientY;
    const move = (ev: PointerEvent) => {
      acc += lastY - ev.clientY;
      lastY = ev.clientY;
      const steps = Math.trunc(acc / 10);
      if (steps !== 0) {
        acc -= steps * 10;
        turn(steps, ev.shiftKey);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e: ThreeEvent<WheelEvent>) => {
    e.stopPropagation();
    turn(e.nativeEvent.deltaY < 0 ? 1 : -1, e.nativeEvent.shiftKey);
  };

  const depth = radius * 0.9;
  return (
    <group
      position={position}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); setKnobHover(true); setCursor('ns-resize'); }}
      onPointerOut={() => { setHover(false); setKnobHover(false); setCursor('auto'); }}
    >
      {/* 底座裙邊 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]} castShadow>
        <cylinderGeometry args={[radius * 1.12, radius * 1.15, 0.04, 40]} />
        <meshStandardMaterial color="#15171a" metalness={0.3} roughness={0.6} />
      </mesh>
      <group ref={spin}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, depth / 2 + 0.04]} castShadow>
          <cylinderGeometry args={[radius * 0.92, radius, depth, 40]} />
          <meshStandardMaterial color={hover ? '#34383f' : color} roughness={0.45} metalness={0.2} />
        </mesh>
        {/* 金屬頂蓋 */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, depth + 0.045]}>
          <cylinderGeometry args={[radius * 0.8, radius * 0.8, 0.012, 40]} />
          <meshStandardMaterial color={capColor} metalness={0.9} roughness={0.25} />
        </mesh>
        {/* 指示刻線 */}
        <mesh position={[0, radius * 0.5, depth + 0.055]}>
          <boxGeometry args={[radius * 0.1, radius * 0.55, 0.01]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}

function buttonLabelTexture(text: string, w: number, h: number) {
  return createCanvasTexture(w, h, (p) => {
    p.ctx.clearRect(0, 0, p.s(w), p.s(h));
    p.ctx.fillStyle = '#f2f4f7';
    // 字級取「按鍵高度的 42%」，太長的字再縮到按鍵寬度的 85% 內
    let size = p.s(h * 0.42);
    p.ctx.font = `700 ${size}px ${FONT}`;
    const tw = p.ctx.measureText(text).width;
    if (tw > p.s(w * 0.85)) size *= p.s(w * 0.85) / tw;
    p.ctx.font = `700 ${size}px ${FONT}`;
    p.ctx.textAlign = 'center';
    p.ctx.textBaseline = 'middle';
    p.ctx.fillText(text, p.x(0), p.y(0));
  }, 512);
}

/** 按鍵：點一下觸發 onPress；active 時按鍵本身發光（代表目前選取的功能） */
export function Button3D({
  position, size = [0.2, 0.12], text, color = '#474d56', activeColor = '#2f8cff',
  active = false, onPress,
}: {
  position: Vec3;
  size?: [number, number];
  text?: string;
  color?: string;
  activeColor?: string;
  active?: boolean;
  onPress: () => void;
}) {
  const [w, h] = size;
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState(false);
  const tex = useMemo(() => (text ? buttonLabelTexture(text, w, h) : null), [text, w, h]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const depth = pressed ? 0.025 : 0.05;
  const base = active ? activeColor : color;

  return (
    <group
      position={position}
      onPointerDown={(e) => { e.stopPropagation(); setPressed(true); }}
      onPointerUp={(e) => { e.stopPropagation(); if (pressed) onPress(); setPressed(false); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); setCursor('pointer'); }}
      onPointerOut={() => { setHover(false); setPressed(false); setCursor('auto'); }}
    >
      <RoundedBox args={[w, h, depth]} radius={Math.min(0.02, depth / 2.2)} smoothness={3} position={[0, 0, depth / 2]} castShadow>
        <meshStandardMaterial
          color={base}
          emissive={active ? activeColor : '#000000'}
          emissiveIntensity={active ? 0.55 : 0}
          roughness={0.5}
          metalness={0.1}
          envMapIntensity={hover ? 1.4 : 1}
        />
      </RoundedBox>
      {tex && (
        <mesh position={[0, 0, depth + 0.001]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function Led3D({ position, on, color = '#39ff6a' }: { position: Vec3; on: boolean; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.015]}>
        <sphereGeometry args={[0.03, 20, 12]} />
        <meshStandardMaterial
          color={on ? color : '#2a2f2a'}
          emissive={on ? color : '#000000'}
          emissiveIntensity={on ? 2.5 : 0}
          toneMapped={false}
        />
      </mesh>
      {on && <pointLight color={color} intensity={0.15} distance={0.6} />}
    </group>
  );
}

/** BNC 母座：朝 +z 方向突出，接線頭的中心在 [0, 0, 0.12] */
export function Bnc3D({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.015]}>
        <cylinderGeometry args={[0.11, 0.11, 0.03, 6]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.07]}>
        <cylinderGeometry args={[0.065, 0.065, 0.1, 24]} />
        <meshStandardMaterial color="#dfe3e8" metalness={0.95} roughness={0.2} />
      </mesh>
      {/* 卡榫 */}
      {[-1, 1].map((d) => (
        <mesh key={d} position={[d * 0.075, 0, 0.09]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color="#dfe3e8" metalness={0.95} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** 香蕉插座（電源供應器輸出端子）：彩色絕緣外環 + 金屬孔，接線頭中心在 [0, 0, 0.1] */
export function BananaJack3D({ position, color }: { position: Vec3; color: string }) {
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.04]} castShadow>
        <cylinderGeometry args={[0.065, 0.07, 0.08, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.081]}>
        <cylinderGeometry args={[0.028, 0.028, 0.004, 16]} />
        <meshStandardMaterial color="#b8a060" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}
