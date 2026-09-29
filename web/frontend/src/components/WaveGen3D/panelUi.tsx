// 實驗室工作區共用的 UI 元件與配色（沿用 Explore Demos 編輯器的深藍配色）
import type { CSSProperties, ReactNode } from 'react';

export const T = {
  bg: '#0a0a1a',
  panel: '#0f0f25',
  card: '#13132e',
  border: '#1f1f48',
  text: '#e0e0e0',
  muted: '#7a7ab0',
  accent: '#00d2ff',
  value: '#ffd21f',
  font: '"Segoe UI", "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif',
  mono: 'Consolas, "DejaVu Sans Mono", monospace',
};

/** 卡片式分區：側欄、下方面板、檢視器都用同一種外觀 */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={u.section}>
      <div style={u.sectionHead}>
        <span style={u.sectionTitle}>{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Slider({ label, value, min, max, step, v, onChange }: {
  label: string; value: string; min: number; max: number; step: number; v: number;
  onChange: (x: number) => void;
}) {
  return (
    <label style={u.slider}>
      <span style={u.sliderHead}><span>{label}</span><span style={u.value}>{value}</span></span>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: T.accent }} />
    </label>
  );
}

export const chip = (active: boolean, activeBg = '#0086b3', bg = '#1a1a3e'): CSSProperties => ({
  flex: 1, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${active ? T.accent : '#2a2a5a'}`,
  background: active ? activeBg : bg, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: T.font,
});

export const row: CSSProperties = { display: 'flex', gap: 6 };
export const grid3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };
export const help: CSSProperties = { fontSize: 12, color: T.muted, lineHeight: 1.6, margin: 0 };
export const warn: CSSProperties = {
  fontSize: 12, color: '#ffb4a8', background: 'rgba(210,59,59,0.15)', border: '1px solid #6b2a2a',
  borderRadius: 6, padding: '6px 8px', lineHeight: 1.5,
};
export const selectStyle: CSSProperties = {
  background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 6px', fontFamily: T.font,
};

export function Stat({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 8px' }}>
      <div style={{ fontSize: 11, color: T.muted }}>{k}</div>
      <div style={{ fontFamily: T.mono, color: color ?? T.value, fontSize: 13 }}>{v}</div>
    </div>
  );
}

const u: Record<string, CSSProperties> = {
  section: {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px',
    display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
  },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 12, color: T.accent, fontWeight: 700, letterSpacing: 0.5 },
  slider: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 },
  sliderHead: { display: 'flex', justifyContent: 'space-between' },
  value: { fontFamily: T.mono, color: T.value },
};
