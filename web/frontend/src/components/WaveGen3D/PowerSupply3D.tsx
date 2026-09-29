// 3D 直流電源供應器 PS-3005（0–30 V / 0–5 A）：七段 LCD、VOLTAGE/CURRENT 旋鈕、記憶預設、輸出開關、香蕉插座
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { usePsuLab } from './psuStore.js';
import { useBench } from './bench.js';
import { createCanvasTexture, label, sectionBox, type PanelCtx } from './panelTexture.js';
import { drawPsuLcd } from './psuDisplay.js';
import { Knob3D, Button3D, Led3D, BananaJack3D } from './parts.js';
import { PSU } from './layout.js';

const { w: W, h: H, d: D } = PSU.size;
const PW = W - 0.1, PH = H - 0.1;
const LCD = { x: 0, y: 0.28, w: 2.3, h: 0.5 };
const PRESETS: [string, number][] = [['3.3V', 3.3], ['5V', 5], ['12V', 12]];

function drawPanel(p: PanelCtx) {
  p.ctx.fillStyle = '#3a4048';
  p.ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.18, 0.62, 0.075, '#ffffff', 'left', 800);
  label(p, 'PS-3005  DC Power Supply', -0.78, 0.62, 0.05, '#9fb3c8', 'left');
  label(p, '0–30 V  0–5 A', 1.18, 0.62, 0.055, '#f5c518', 'right', 700);
  label(p, 'VOLTAGE', -0.85, -0.55, 0.05);
  label(p, 'CURRENT', -0.3, -0.55, 0.05);
  label(p, '▲ drag / scroll ▼  (Shift = fine)', -0.575, -0.64, 0.035, '#7c8a99');
  sectionBox(p, 0.36, -0.17, 0.74, 0.2, 'MEMORY');
  label(p, 'CV', 0.17, -0.62, 0.045, '#9fb3c8', 'left');
  label(p, 'CC', 0.42, -0.62, 0.045, '#9fb3c8', 'left');
  label(p, '+', PSU.jackPlus.x, -0.56, 0.07, '#ff5a4a', 'center', 800);
  label(p, 'GND', PSU.jackGnd.x, -0.56, 0.04, '#5ad17a', 'center', 800);
  label(p, '−', PSU.jackMinus.x, -0.56, 0.07, '#ffffff', 'center', 800);
  label(p, 'OUTPUT', 0.97, -0.25, 0.045, '#9fb3c8');
}

export function PowerSupply3D() {
  const psu = usePsuLab((s) => s.psu);
  const { setPsu, stepV, stepI } = usePsuLab.getState();
  const reading = useBench().psu;

  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const lcd = useMemo(() => createCanvasTexture(LCD.w, LCD.h, () => {}, 400), []);
  useEffect(() => () => { panelTex.dispose(); lcd.dispose(); }, [panelTex, lcd]);

  useEffect(() => {
    const c = lcd.image as HTMLCanvasElement;
    drawPsuLcd(c.getContext('2d')!, c.width, c.height, psu, reading);
    lcd.needsUpdate = true;
  }, [psu, reading.v, reading.i, reading.mode, lcd]);

  const on = psu.power;
  return (
    <group position={PSU.pos} rotation={[0, PSU.rotY, 0]}>
      <RoundedBox args={[W, H, D]} radius={0.06} smoothness={4} position={[0, H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3d6fa8" roughness={0.5} metalness={0.25} />
      </RoundedBox>
      {/* 提把 */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (W / 2 - 0.2), H + 0.12, 0]} castShadow>
          <boxGeometry args={[0.08, 0.24, 0.08]} />
          <meshStandardMaterial color="#1b1d20" />
        </mesh>
      ))}
      <mesh position={[0, H + 0.24, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, W - 0.32, 16]} />
        <meshStandardMaterial color="#1b1d20" roughness={0.6} />
      </mesh>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (W / 2 - 0.25), 0.02, sz * (D / 2 - 0.25)]}>
          <cylinderGeometry args={[0.09, 0.1, 0.04, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      )))}

      <group position={[0, H / 2, D / 2]}>
        <mesh position={[0, 0, 0.002]}>
          <planeGeometry args={[PW, PH]} />
          <meshStandardMaterial map={panelTex} roughness={0.7} />
        </mesh>
        <mesh position={[LCD.x, LCD.y, 0.01]}>
          <boxGeometry args={[LCD.w + 0.06, LCD.h + 0.06, 0.02]} />
          <meshStandardMaterial color="#111317" roughness={0.3} />
        </mesh>
        <mesh position={[LCD.x, LCD.y, 0.021]}>
          <planeGeometry args={[LCD.w, LCD.h]} />
          <meshBasicMaterial map={lcd} toneMapped={false} />
        </mesh>

        <Knob3D position={[-0.85, -0.28, 0.002]} radius={0.17} capColor="#ff5a4a"
          onStep={(s, fine) => on && stepV(s, fine)} />
        <Knob3D position={[-0.3, -0.28, 0.002]} radius={0.17} capColor="#3cff7a"
          onStep={(s, fine) => on && stepI(s, fine)} />

        {PRESETS.map(([text, v], i) => (
          <Button3D key={text} position={[0.12 + i * 0.24, -0.19, 0.002]} size={[0.2, 0.1]} text={text}
            active={on && Math.abs(psu.vSet - v) < 1e-6} onPress={() => on && setPsu({ vSet: v })} />
        ))}
        <Button3D position={[0.12, -0.42, 0.002]} size={[0.2, 0.12]} text="⏻" color="#5a3035"
          active={on} activeColor="#d23b3b" onPress={() => setPsu({ power: !on, output: false })} />
        <Button3D position={[0.42, -0.42, 0.002]} size={[0.3, 0.12]} text="ON/OFF"
          active={on && psu.output} activeColor="#27b34a"
          onPress={() => on && setPsu({ output: !psu.output })} />
        <Led3D position={[0.12, -0.62, 0.002]} on={reading.mode === 'CV'} />
        <Led3D position={[0.37, -0.62, 0.002]} on={reading.mode === 'CC'} color="#ff4d3a" />

        <BananaJack3D position={[PSU.jackPlus.x, PSU.jackPlus.y, 0.002]} color="#c8201c" />
        <BananaJack3D position={[PSU.jackGnd.x, PSU.jackGnd.y, 0.002]} color="#1f8a3a" />
        <BananaJack3D position={[PSU.jackMinus.x, PSU.jackMinus.y, 0.002]} color="#16181b" />
      </group>
    </group>
  );
}
