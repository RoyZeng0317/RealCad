// 下方面板「萬用電表」分頁：功能選擇、大字讀值、HOLD / REL、電流插座與保險絲、紅黑測試線接線
//   沒有文字輸入框（避免快捷鍵失效，見 SHORTCUTS.md）
import { useEffect, useState } from 'react';
import { useDm, DM_MODES, DM_MODE_NAME, isCurrentMode } from './dmStore.js';
import { dmRead } from './benchMeter.js';
import { useBench } from './bench.js';
import { LeadControl } from './LeadControls.js';
import { Section, chip, row, help, warn, T } from './panelUi.js';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
}

export function DmControls() {
  useTick(250);
  useBench();
  const dm = useDm((s) => s.dm);
  const setDm = useDm((s) => s.setDm);
  const r = dmRead();
  const cur = isCurrentMode(dm.mode);
  return (
    <>
      <Section title="DM-5050 讀值" right={
        <button style={{ ...chip(dm.power, '#b32d2d'), flex: 'none', padding: '2px 10px' }} onClick={() => setDm({ power: !dm.power })}>
          {dm.power ? 'ON' : 'OFF'}
        </button>
      }>
        <div style={{
          background: '#04100e', border: '1px solid #1f5a4a', borderRadius: 6, padding: '8px 12px',
          fontFamily: T.mono, color: '#5dffd8', textAlign: 'right',
        }}>
          <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>{DM_MODE_NAME[dm.mode]}</span>
            <span>{[dm.hold && 'HOLD', dm.rel !== null && 'REL', r.beep && '•))) 嗶'].filter(Boolean).join('  ')}</span>
          </div>
          <div style={{ fontSize: 30, letterSpacing: 1 }}>{dm.power ? `${r.main} ${r.unit}` : ''}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{r.sub}</div>
        </div>
        {r.note && <p style={{ ...help, color: '#ffd9a0' }}>{r.note}</p>}
      </Section>
      <Section title="功能">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {DM_MODES.map(([m, t]) => (
            <button key={m} title={DM_MODE_NAME[m]} style={chip(dm.mode === m, '#1f7f9f')} onClick={() => setDm({ mode: m })}>{t}</button>
          ))}
        </div>
        <div style={row}>
          <button style={chip(dm.hold, '#b8621f')} onClick={() => setDm({ hold: !dm.hold })}>HOLD 鎖定讀值</button>
          <button style={chip(dm.rel !== null, '#8a3ad4')} onClick={() => setDm({ rel: dm.rel !== null || r.value === null ? null : r.value })}>REL 歸零</button>
        </div>
        <p style={help}>REL：記下目前讀值當基準，之後顯示的是差值（例如扣掉測試線電阻）。</p>
      </Section>
      <Section title="電流插座 / 保險絲">
        <div style={row}>
          <button style={chip(dm.jack === 'mA')} onClick={() => setDm({ jack: 'mA' })}>mA 插座（1 Ω，0.5 A 保險絲）</button>
          <button style={chip(dm.jack === '10A')} onClick={() => setDm({ jack: '10A' })}>10A 插座（0.01 Ω）</button>
        </div>
        {!dm.fuseOk && (
          <div style={warn}>
            mA 插座的保險絲燒斷了（電流超過 0.5 A，常見原因：電流檔直接並聯在電源兩端）。
            <button style={{ ...chip(false, '', '#5a4a1a'), marginTop: 6, width: '100%' }} onClick={() => setDm({ fuseOk: true })}>更換保險絲</button>
          </div>
        )}
        <p style={help}>{cur ? '電流檔：紅色插頭插在電流插座，電表串在電路裡；內部分流電阻會讓電路多一點電阻（負載效應）。' : '電壓 / 電阻檔：紅色插頭插在 HI 插座，輸入阻抗很高，不影響電路。'}</p>
      </Section>
      <Section title="紅黑測試線">
        <LeadControl kind="dm" />
        <p style={help}>電壓：紅棒接要量的點、黑棒接 GND（並聯）。電流：把線路斷開，紅棒接電流流進來那端、黑棒接流出去那端（串聯）。電阻 / 二極體：先關掉電路電源。</p>
      </Section>
    </>
  );
}
