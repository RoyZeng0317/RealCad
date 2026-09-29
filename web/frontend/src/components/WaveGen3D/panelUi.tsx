// HTML 控制面板共用的小元件：分區、滑桿、切換按鈕樣式
import type { CSSProperties, ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={u.section}>
      <div style={u.sectionTitle}>{title}</div>
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
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
}

export const chip = (active: boolean, activeBg = '#2f8cff', bg = '#2a3038'): CSSProperties => ({
  flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #3a424d', cursor: 'pointer',
  background: active ? activeBg : bg, color: '#fff', fontSize: 13, fontWeight: 600,
});

const u: Record<string, CSSProperties> = {
  section: { borderTop: '1px solid #2c333c', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 12, color: '#9fb3c8', fontWeight: 700, letterSpacing: 0.5 },
  slider: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 },
  sliderHead: { display: 'flex', justifyContent: 'space-between' },
  value: { fontFamily: 'Consolas, monospace', color: '#ffd21f' },
};
