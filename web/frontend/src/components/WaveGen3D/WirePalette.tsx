// 杜邦線顏色的懸浮視窗（可拖曳）：常用色、R / G / B 三色滑桿與數值、16 進位色碼（#RRGGBB）、系統調色盤、最近用過的顏色
//   選了杜邦線工具會自動打開；選取中的杜邦線會直接換成新顏色，之後放的新線也用這個顏色
//   ⚠ 這裡有文字 / 數字輸入框：Enter 套用後一定 blur()、Esc 離開（快捷鍵規則，見 SHORTCUTS.md）
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useBoard } from './boardStore.js';
import { useLabUi } from './labUi.js';
import { WIRE_COLORS } from './boardParts.js';
import { T } from './panelUi.js';

const EXTRA = ['#8a3ad4', '#e05aa8', '#7a4a1e', '#8a8a8a', '#1fb5b5', '#a8d42a'];
const PRESETS = [...WIRE_COLORS, ...EXTRA];

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
export const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export function parseHex(t: string): [number, number, number] | null {
  let s = t.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

/** 套用顏色：新放的杜邦線用這個顏色；目前選取的如果是杜邦線，也直接換色 */
function applyColor(c: string) {
  const b = useBoard.getState();
  const color = c.toLowerCase();
  b.setParam({ wireColor: color });
  const sel = b.parts.find((p) => p.id === b.selectedId);
  if (sel?.kind === 'wire' && sel.color !== color) {
    useBoard.setState((s) => ({ parts: s.parts.map((p) => (p.id === sel.id ? { ...p, color } : p)) }));
  }
}

/** Enter 套用並離開輸入框、Esc 放棄並離開；打字時不觸發 S / W / X 快捷鍵 */
const keyHandler = (apply: () => void, reset: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') { e.preventDefault(); apply(); e.currentTarget.blur(); }
  if (e.key === 'Escape') { reset(); e.currentTarget.blur(); }
  e.stopPropagation();
};

function Channel({ name, color, v, onChange }: { name: string; color: string; v: number; onChange: (x: number) => void }) {
  const [text, setText] = useState(String(v));
  useEffect(() => setText(String(v)), [v]);
  const apply = () => {
    const n = Number(text);
    if (Number.isFinite(n)) onChange(Math.max(0, Math.min(255, Math.round(n))));
    else setText(String(v));
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 52px', gap: 6, alignItems: 'center' }}>
      <span style={{ color, fontWeight: 800, fontFamily: T.mono }}>{name}</span>
      <input type="range" min={0} max={255} step={1} value={v} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color }} aria-label={`${name} 0–255`} />
      <input type="number" min={0} max={255} value={text} aria-label={`${name} 數值`}
        onChange={(e) => setText(e.target.value)} onBlur={apply} onKeyDown={keyHandler(apply, () => setText(String(v)))}
        style={field} />
    </div>
  );
}

export function WirePalette() {
  const open = useLabUi((s) => s.paletteOpen);
  const setOpen = useLabUi((s) => s.setPaletteOpen);
  const recent = useLabUi((s) => s.recentColors);
  const color = useBoard((s) => s.wireColor);
  const selWire = useBoard((s) => s.parts.find((p) => p.id === s.selectedId)?.kind === 'wire');
  // 預設放在 3D 畫面右上（右側檢視器左邊），不要蓋住上方「檔案 / 編輯」選單
  const [pos, setPos] = useState(() => ({ x: Math.max(10, (typeof window === 'undefined' ? 1600 : window.innerWidth) - 268 - 330), y: 120 }));
  const [hexText, setHexText] = useState(color);
  useEffect(() => setHexText(color), [color]);

  // 選了杜邦線工具就自動打開
  useEffect(() => useBoard.subscribe((s, p) => { if (s.tool === 'wire' && p.tool !== 'wire') useLabUi.getState().setPaletteOpen(true); }), []);

  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 270, ev.clientX - drag.current.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - drag.current.dy)),
      });
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!open) return null;
  const rgb = parseHex(color) ?? [0, 0, 0];
  const setRgb = (i: number, x: number) => { const n = [...rgb]; n[i] = x; applyColor(toHex(n[0], n[1], n[2])); };
  const commit = (c: string) => { applyColor(c); useLabUi.getState().addRecentColor(c.toLowerCase()); };
  const applyHex = () => { const p = parseHex(hexText); if (p) commit(toHex(...p)); else setHexText(color); };
  const bad = !parseHex(hexText);

  return (
    <div style={{ ...win, left: pos.x, top: pos.y }} role="dialog" aria-label="杜邦線顏色">
      <div style={head} onPointerDown={onHeadDown}>
        <span>🎨 杜邦線顏色</span>
        <button style={closeBtn} onClick={() => setOpen(false)} title="關閉（工具列的色塊按鈕可以再打開）">✕</button>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: color, border: '2px solid #555' }} />
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            {selWire ? '正在幫「選取的杜邦線」換色，之後放的新線也用這個顏色' : '之後放的杜邦線用這個顏色（先選取一條杜邦線可以直接換色）'}
          </div>
        </div>
        <div style={label}>常用顏色</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {PRESETS.map((c) => <Swatch key={c} c={c} active={c === color} onClick={() => applyColor(c)} />)}
        </div>
        <div style={label}>R / G / B（0–255）</div>
        <Channel name="R" color="#ff5a5a" v={rgb[0]} onChange={(x) => setRgb(0, x)} />
        <Channel name="G" color="#3cdc6a" v={rgb[1]} onChange={(x) => setRgb(1, x)} />
        <Channel name="B" color="#4a8aff" v={rgb[2]} onChange={(x) => setRgb(2, x)} />
        <div style={label}>16 進位色碼 / 系統調色盤</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={hexText} spellCheck={false} maxLength={7} aria-label="16 進位色碼"
            onChange={(e) => setHexText(e.target.value)} onBlur={applyHex} onKeyDown={keyHandler(applyHex, () => setHexText(color))}
            style={{ ...field, flex: 1, borderColor: bad ? '#d23b3b' : T.border }} placeholder="#RRGGBB" />
          <input type="color" value={color} aria-label="系統調色盤" onChange={(e) => applyColor(e.target.value)}
            onBlur={() => useLabUi.getState().addRecentColor(color)}
            style={{ width: 40, height: 30, padding: 0, border: `1px solid ${T.border}`, background: 'none', cursor: 'pointer' }} />
        </div>
        {bad && <span style={{ fontSize: 11, color: '#ff8a7a' }}>色碼格式：#RRGGBB 或 #RGB（例如 #ff8800、#f80），按 Enter 套用</span>}
        {recent.length > 0 && (
          <>
            <div style={label}>最近用過</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {recent.map((c) => <Swatch key={c} c={c} active={c === color} onClick={() => applyColor(c)} small />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Swatch({ c, active, onClick, small }: { c: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={onClick} title={c} style={{
      height: small ? 18 : 24, minWidth: small ? 24 : 0, borderRadius: 4, background: c, cursor: 'pointer',
      border: active ? `2px solid ${T.accent}` : '1px solid #2a2a5a',
    }} />
  );
}

const win: CSSProperties = {
  position: 'fixed', zIndex: 30, width: 268, // 比選單下拉（40）低：打開選單時選單在上面 background: T.panel, border: `1px solid ${T.accent}`, borderRadius: 10,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)', fontFamily: T.font, color: T.text,
};
const head: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', cursor: 'move',
  borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.accent, userSelect: 'none',
};
const closeBtn: CSSProperties = { background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14 };
const label: CSSProperties = { fontSize: 11, color: T.muted, marginTop: 2 };
const field: CSSProperties = {
  background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 6px',
  fontFamily: T.mono, fontSize: 13, minWidth: 0,
};
