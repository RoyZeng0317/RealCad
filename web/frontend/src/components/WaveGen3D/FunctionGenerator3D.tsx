// 3D 函數波產生器本體：外殼、印刷面板、LCD、波形/參數按鍵、ADJUST 旋鈕、輸出開關與 BNC
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useWaveLab, type GenParam } from './waveStore.js';
import type { Waveform } from './waveform.js';
import { createCanvasTexture, label, sectionBox } from './panelTexture.js';
import { drawGenLcd } from './genDisplay.js';
import { Knob3D, Button3D, Led3D, Bnc3D } from './parts.js';
import { GEN } from './layout.js';

const { w: W, h: H, d: D } = GEN.size;
const LCD = { x: -0.8, y: 0.2, w: 1.45, h: 0.64 };
const WAVES: [Waveform, string][] = [
  ['sine', 'SINE'], ['square', 'SQUARE'], ['triangle', 'TRI'],
  ['ramp', 'RAMP'], ['pulse', 'PULSE'], ['noise', 'NOISE'],
];
const PARAMS: [GenParam, string, number, number][] = [
  ['frequency', 'FREQ', 0.2, 0.33], ['amplitude', 'AMPL', 0.5, 0.33],
  ['offset', 'OFFSET', 0.2, 0.12], ['duty', 'DUTY', 0.5, 0.12],
];
const PW = W - 0.1, PH = H - 0.1; // 前面板（比外殼略小，形成邊框）

function drawPanel(p: Parameters<Parameters<typeof createCanvasTexture>[2]>[0]) {
  const { ctx } = p;
  ctx.fillStyle = '#3a4048';
  ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.58, 0.61, 0.08, '#ffffff', 'left', 800);
  label(p, 'FG-2000  Function Generator', -1.12, 0.61, 0.055, '#9fb3c8', 'left');
  label(p, '0.1 Hz – 10 MHz', 1.58, 0.61, 0.06, '#f5c518', 'right', 700);
  sectionBox(p, -0.8, -0.37, 1.58, 0.3, 'WAVEFORM');
  sectionBox(p, 0.35, 0.22, 0.7, 0.5, 'PARAMETER');
  label(p, 'ADJUST', 1.2, -0.17, 0.055, '#9fb3c8');
  label(p, '▲ drag / scroll ▼', 1.2, -0.25, 0.04, '#7c8a99');
  label(p, 'POWER', 0.2, -0.6, 0.05);
  label(p, 'OUTPUT', 0.62, -0.6, 0.05);
  label(p, 'OUT  50Ω', 1.2, -0.62, 0.05);
  // BNC 周圍的保護框
  ctx.strokeStyle = '#f5c518';
  ctx.lineWidth = p.s(0.01);
  ctx.beginPath();
  ctx.arc(p.x(1.2), p.y(-0.45), p.s(0.14), 0, Math.PI * 2);
  ctx.stroke();
}

export function FunctionGenerator3D() {
  const gen = useWaveLab((s) => s.gen);
  const selected = useWaveLab((s) => s.selected);
  const { setGen, setWaveform, setSelected, stepSelected } = useWaveLab.getState();

  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const lcd = useMemo(() => createCanvasTexture(LCD.w, LCD.h, () => {}, 512), []);
  useEffect(() => () => { panelTex.dispose(); lcd.dispose(); }, [panelTex, lcd]);

  useEffect(() => {
    const c = lcd.image as HTMLCanvasElement;
    drawGenLcd(c.getContext('2d')!, c.width, c.height, gen, selected);
    lcd.needsUpdate = true;
  }, [gen, selected, lcd]);

  const on = gen.power;
  const z = D / 2;

  return (
    <group position={GEN.pos} rotation={[0, GEN.rotY, 0]}>
      {/* 外殼 */}
      <RoundedBox args={[W, H, D]} radius={0.06} smoothness={4} position={[0, H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#c9cdd3" roughness={0.55} metalness={0.15} />
      </RoundedBox>
      {/* 腳墊 */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (W / 2 - 0.25), 0.02, sz * (D / 2 - 0.25)]}>
          <cylinderGeometry args={[0.09, 0.1, 0.04, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      )))}

      <group position={[0, H / 2, z]}>
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={[PW, PH]} />
          <meshStandardMaterial map={panelTex} roughness={0.7} />
        </mesh>

        {/* LCD 與邊框 */}
        <mesh position={[LCD.x, LCD.y, 0.01]}>
          <boxGeometry args={[LCD.w + 0.06, LCD.h + 0.06, 0.02]} />
          <meshStandardMaterial color="#111317" roughness={0.3} />
        </mesh>
        <mesh position={[LCD.x, LCD.y, 0.021]}>
          <planeGeometry args={[LCD.w, LCD.h]} />
          <meshBasicMaterial map={lcd} toneMapped={false} />
        </mesh>

        {WAVES.map(([w, text], i) => (
          <Button3D
            key={w}
            position={[-1.42 + i * 0.245, -0.38, 0.002]}
            size={[0.21, 0.13]}
            text={text}
            active={on && gen.waveform === w}
            activeColor="#f5a318"
            onPress={() => { setWaveform(w); if (w === 'pulse') setSelected('duty'); }}
          />
        ))}

        {PARAMS.map(([p, text, x, y]) => (
          <Button3D
            key={p}
            position={[x, y, 0.002]}
            size={[0.26, 0.14]}
            text={text}
            active={on && selected === p}
            onPress={() => setSelected(p)}
          />
        ))}

        <Knob3D position={[1.2, 0.2, 0.002]} radius={0.3} onStep={(s, fine) => on && stepSelected(s, fine)} />

        <Button3D
          position={[0.2, -0.45, 0.002]}
          size={[0.22, 0.14]}
          text="⏻"
          color="#5a3035"
          active={on}
          activeColor="#d23b3b"
          onPress={() => setGen({ power: !on })}
        />
        <Button3D
          position={[0.62, -0.45, 0.002]}
          size={[0.26, 0.14]}
          text="ON/OFF"
          active={on && gen.output}
          activeColor="#27b34a"
          onPress={() => setGen({ output: !gen.output })}
        />
        <Led3D position={[0.62, -0.3, 0.002]} on={on && gen.output} />
        <Bnc3D position={[GEN.bnc.x, GEN.bnc.y, 0.002]} />
      </group>
    </group>
  );
}
