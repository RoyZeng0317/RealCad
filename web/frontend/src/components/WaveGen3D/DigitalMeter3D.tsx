// 3D 桌上型萬用電表 DM-5050（50,000 count、雙顯示 VFD）：跟電源供應器一樣大的機身、功能鍵、HOLD / REL、HI / LO / mA / 10A 香蕉插座
// 接到麵包板的紅黑測試線畫在 InstrumentLeads（DmLeads）
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useDm, DM_MODES, isCurrentMode } from './dmStore.js';
import { dmRead, type DmReading } from './benchMeter.js';
import { createCanvasTexture, label, sectionBox, FONT, MONO, type PanelCtx } from './panelTexture.js';
import { Button3D, Led3D, BananaJack3D } from './parts.js';
import { DM } from './layout.js';

const { w: W, h: H, d: D } = DM.size;
const PW = W - 0.1, PH = H - 0.1;
const VFD = { x: -0.42, y: 0.28, w: 1.55, h: 0.56 };
const VFD_COLOR = '#5dffd8';

function drawPanel(p: PanelCtx) {
  p.ctx.fillStyle = '#2c3138';
  p.ctx.fillRect(0, 0, p.s(PW), p.s(PH));
  label(p, 'RealCad', -1.18, 0.62, 0.075, '#ffffff', 'left', 800);
  label(p, 'DM-5050  Bench Digital Multimeter', -0.78, 0.62, 0.045, '#9fb3c8', 'left');
  label(p, '50,000 Count · Dual Display', 1.18, 0.62, 0.045, '#f5c518', 'right', 700);
  sectionBox(p, -0.42, -0.36, 1.6, 0.42, 'FUNCTION');
  label(p, 'POWER', -1.07, -0.66, 0.035, '#9fb3c8');
  // 插座區
  sectionBox(p, 0.93, -0.25, 0.56, 0.6);
  label(p, 'HI  V Ω ⊣▷', DM.jackHi.x, DM.jackHi.y + 0.12, 0.032, '#ff6a5a', 'center', 800);
  label(p, 'mA', DM.jackMa.x, DM.jackMa.y + 0.12, 0.035, '#ff6a5a', 'center', 800);
  label(p, 'LO  COM', DM.jackLo.x, DM.jackLo.y + 0.12, 0.032, '#ffffff', 'center', 800);
  label(p, '10A', DM.jack10.x, DM.jack10.y + 0.12, 0.035, '#ff6a5a', 'center', 800);
  label(p, 'FUSED 0.5A', DM.jackMa.x, DM.jackMa.y - 0.12, 0.024, '#9fb3c8');
  label(p, 'FUSED 10A', DM.jack10.x, DM.jack10.y - 0.12, 0.024, '#9fb3c8');
  label(p, 'CAT II 600V', 0.93, 0.13, 0.03, '#ffb020', 'center', 700);
}

export function drawVfd(ctx: CanvasRenderingContext2D, Wc: number, Hc: number, r: DmReading, mode: string, flags: { hold: boolean; rel: boolean; on: boolean }) {
  ctx.fillStyle = '#04100e';
  ctx.fillRect(0, 0, Wc, Hc);
  if (!flags.on) return;
  ctx.shadowColor = VFD_COLOR;
  ctx.fillStyle = VFD_COLOR;
  // 上排小字：功能、AUTO / HOLD / REL、導通嗶聲
  ctx.font = `800 ${Hc * 0.11}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.shadowBlur = 6;
  ctx.fillText(mode, 14, Hc * 0.12);
  ctx.textAlign = 'right';
  const tags = [flags.hold ? 'HOLD' : '', flags.rel ? 'REL' : '', r.beep ? '•))) ♪' : ''].filter(Boolean).join('  ');
  ctx.fillText(tags || 'AUTO', Wc - 14, Hc * 0.12);
  // 主顯示（背景淡淡的 8 模仿 VFD 沒點亮的筆畫）
  const digit = Hc * 0.46;
  ctx.font = `700 ${digit}px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  const x = Wc * 0.78;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(93,255,216,0.06)';
  ctx.fillText('-88888', x, Hc * 0.66);
  ctx.fillStyle = VFD_COLOR;
  ctx.shadowBlur = digit * 0.25;
  ctx.fillText(r.main, x, Hc * 0.66);
  ctx.font = `700 ${Hc * 0.18}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(r.unit, x + 10, Hc * 0.66);
  // 副顯示
  ctx.font = `600 ${Hc * 0.14}px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.shadowBlur = 4;
  ctx.fillText(r.sub, Wc - 14, Hc * 0.9);
  ctx.shadowBlur = 0;
}

export function DigitalMeter3D() {
  const dm = useDm((s) => s.dm);
  const setDm = useDm.getState().setDm;
  const panelTex = useMemo(() => createCanvasTexture(PW, PH, drawPanel), []);
  const vfd = useMemo(() => createCanvasTexture(VFD.w, VFD.h, () => {}, 420), []);
  useEffect(() => () => { panelTex.dispose(); vfd.dispose(); }, [panelTex, vfd]);
  const last = useRef(-1);
  const held = useRef<DmReading | null>(null);

  // 每秒更新 5 次（跟真的電表取樣率差不多）；電阻檔自動換檔、電流過大燒保險絲也在這裡處理
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.2) return;
    last.current = clock.elapsedTime;
    const s = useDm.getState().dm;
    const r = dmRead();
    if (r.ohmRange !== null) setDm({ ohmRange: r.ohmRange });
    if (r.blowFuse && s.fuseOk) setDm({ fuseOk: false });
    if (!s.hold) held.current = r;
    const name = DM_MODES.find(([m]) => m === s.mode)?.[1] ?? '';
    const c = vfd.image as HTMLCanvasElement;
    drawVfd(c.getContext('2d')!, c.width, c.height, held.current ?? r, name, { hold: s.hold, rel: s.rel !== null, on: s.power });
    vfd.needsUpdate = true;
  });

  const on = dm.power;
  return (
    <group position={DM.pos} rotation={[0, DM.rotY, 0]}>
      <RoundedBox args={[W, H, D]} radius={0.06} smoothness={4} position={[0, H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#c9c2b0" roughness={0.55} metalness={0.15} />
      </RoundedBox>
      {/* 提把（跟電源供應器一樣） */}
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
        <mesh position={[VFD.x, VFD.y, 0.01]}>
          <boxGeometry args={[VFD.w + 0.06, VFD.h + 0.06, 0.02]} />
          <meshStandardMaterial color="#0b0d10" roughness={0.3} />
        </mesh>
        <mesh position={[VFD.x, VFD.y, 0.021]}>
          <planeGeometry args={[VFD.w, VFD.h]} />
          <meshBasicMaterial map={vfd} toneMapped={false} />
        </mesh>

        {/* 功能鍵（兩排）*/}
        {DM_MODES.map(([m, text], i) => (
          <Button3D key={m} position={[-1.08 + (i % 4) * 0.36 + 0.12, -0.27 - Math.floor(i / 4) * 0.17, 0.002]} size={[0.3, 0.12]} text={text}
            active={on && dm.mode === m} activeColor="#1f7f9f" onPress={() => on && setDm({ mode: m })} />
        ))}
        <Button3D position={[0.5, 0.38, 0.002]} size={[0.2, 0.12]} text="HOLD" active={on && dm.hold} activeColor="#b8621f"
          onPress={() => on && setDm({ hold: !dm.hold })} />
        <Button3D position={[0.5, 0.2, 0.002]} size={[0.2, 0.12]} text="REL" active={on && dm.rel !== null} activeColor="#8a3ad4"
          onPress={() => { if (!on) return; const v = dmRead().value; setDm({ rel: dm.rel !== null || v === null ? null : v }); }} />
        <Button3D position={[0.5, 0.02, 0.002]} size={[0.2, 0.12]} text={dm.jack} color="#6b2a2a"
          active={on && isCurrentMode(dm.mode)} activeColor="#c8201c" onPress={() => setDm({ jack: dm.jack === 'mA' ? '10A' : 'mA' })} />
        <Button3D position={[-1.07, -0.56, 0.002]} size={[0.2, 0.1]} text="⏻" color="#5a3035"
          active={on} activeColor="#d23b3b" onPress={() => setDm({ power: !on })} />
        <Led3D position={[-0.88, -0.56, 0.002]} on={on && dm.fuseOk} color="#39ff6a" />

        <BananaJack3D position={[DM.jackHi.x, DM.jackHi.y, 0.002]} color="#c8201c" />
        <BananaJack3D position={[DM.jackMa.x, DM.jackMa.y, 0.002]} color="#c8201c" />
        <BananaJack3D position={[DM.jackLo.x, DM.jackLo.y, 0.002]} color="#16181b" />
        <BananaJack3D position={[DM.jack10.x, DM.jack10.y, 0.002]} color="#c8201c" />
      </group>
    </group>
  );
}
