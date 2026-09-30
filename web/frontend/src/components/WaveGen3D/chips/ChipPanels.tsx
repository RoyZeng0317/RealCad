// 麵包板 IC 的介面：右側檢視器卡片（電源、狀態、上傳、腳位表）、下方「程式碼」與「序列埠」分頁（ATmega328P）
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useBoard } from '../boardStore.js';
import { useBench } from '../bench.js';
import { holeName } from '../boardModel.js';
import type { BoardPart } from '../boardParts.js';
import { MODE } from '../devboards/sketchRun.js';
import { BoardTabs } from '../devboards/DevPanels.js';
import { useLabUi } from '../labUi.js';
import { Section, chip, row, help, warn, T } from '../panelUi.js';
import { useChips, chipRt } from './chipStore.js';
import { CHIP_PINS, CHIP_NAME, AT, CH, ATMEGA_EXAMPLE } from './chipDefs.js';

const MODE_NAME = ['INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN'];
const STATUS: Record<string, [string, string]> = {
  off: ['未上電', '#7a7ab0'], reset: ['重置中（RESET 為低電位）', '#ffb020'], empty: ['Flash 是空的（還沒上傳程式）', '#ffb020'],
  running: ['執行中', '#3cff7a'], sleeping: ['執行中', '#3cff7a'], done: ['程式結束', '#8fb4d0'], error: ['執行錯誤', '#ff4d3a'],
};
const openCode = (id: string) => { useChips.getState().setTab(id); useLabUi.getState().setDockTab('code'); };

export function ChipCard({ part }: { part: BoardPart }) {
  const rt = useChips((s) => chipRt(s, part.id));
  const bench = useBench();
  const s = useBoard.getState();
  const atmega = part.kind === 'atmega';
  const defs = CHIP_PINS[part.kind as 'atmega' | 'ch340'];
  const gnd = bench.holeV(part.pins[atmega ? AT.GND : CH.GND]) ?? 0;
  const [label, color] = atmega ? STATUS[rt.status] ?? ['—', T.muted] : rt.vcc >= 3.0 ? ['已連到電腦（COM3）', '#3cff7a'] : ['未上電', '#7a7ab0'];
  // 表列有接東西的腳
  const used = defs.map((d, i) => ({ d, i, v: bench.holeV(part.pins[i]) })).filter((x) => x.v !== null || rt.pins[x.i]);
  return (
    <Section title={`選取：${CHIP_NAME[part.kind as 'atmega' | 'ch340']}`} right={<span style={{ fontSize: 12, color, fontWeight: 700 }}>● {label}</span>}>
      <p style={help}>
        {atmega
          ? `8 位元 AVR・32 KB Flash・2 KB SRAM・DIP-28。VCC ${rt.vcc.toFixed(2)} V（需要 2.7–5.5 V）。`
          : `USB 轉 UART（Micro USB 已接電腦）・DIP-16 轉接板。VCC ${rt.vcc.toFixed(2)} V。`}
        第 1 腳：{holeName(part.pins[0])}
      </p>
      {atmega && (
        <>
          <div style={row}>
            <button style={chip(false, '', '#12345a')} onClick={() => useChips.getState().upload(part.id)} disabled={rt.progress !== null}>▶ 上傳（經 CH340）</button>
            <button style={chip(false)} onClick={() => openCode(part.id)}>程式碼</button>
          </div>
          {rt.progress !== null && <Progress v={rt.progress} />}
          {rt.log.length > 0 && <pre style={logBox}>{rt.log.join('\n')}</pre>}
          {rt.error && <div style={warn}>{rt.status === 'error' ? '執行錯誤' : '編譯錯誤'}（第 {rt.error.line} 行）：{rt.error.msg}</div>}
          {rt.status !== 'off' && !rt.txLinked && Object.keys(rt.pins).includes(String(AT.TXD)) && (
            <p style={{ ...help, color: '#ffd9a0' }}>程式有用序列埠，但第 3 腳 TXD 沒接到 CH340 的 RXD，電腦收不到輸出</p>
          )}
        </>
      )}
      {!atmega && <p style={help}>接法：TXD（2）→ ATmega 第 2 腳 RXD、RXD（3）← ATmega 第 3 腳 TXD、DTR#（13）→ RESET（1）、VCC（16）接 5 V、GND（1）接地、兩顆共地。</p>}
      {used.length > 0 && (
        <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono }}>
          <thead><tr style={{ color: T.muted }}><td style={td}>腳</td><td style={td}>名稱</td><td style={td}>狀態</td><td style={td}>電壓</td></tr></thead>
          <tbody>{used.map(({ d, i, v }) => {
            const st = rt.pins[i];
            return (
              <tr key={i}>
                <td style={{ ...td, color: T.accent }}>{i + 1}</td>
                <td style={td}>{d.name}</td>
                <td style={td}>{st ? `${MODE_NAME[st.mode]}${st.mode === MODE.OUTPUT ? (st.level === 1 ? ' H' : st.level === 0 ? ' L' : ` ${Math.round(st.level * 100)}%`) : ''}` : '—'}</td>
                <td style={{ ...td, color: '#7dffb0' }}>{v === null ? '未接' : `${(v - gnd).toFixed(2)} V`}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <div style={row}>
        <button style={chip(false, '', '#5a2030')} onClick={() => s.removePart(part.id)}>刪除</button>
        <button style={chip(false)} onClick={() => s.selectPart(null)}>取消選取</button>
      </div>
    </Section>
  );
}

function Progress({ v }: { v: number }) {
  return (
    <div style={{ height: 8, background: '#07071a', border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${v * 100}%`, background: '#1fbf4a' }} />
    </div>
  );
}

export function ChipCodePanel({ id }: { id: string }) {
  const part = useBoard((s) => s.parts.find((p) => p.id === id));
  const rt = useChips((s) => chipRt(s, id));
  const text = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && text.current) { text.current.selectionStart = text.current.selectionEnd = caret.current; caret.current = null; }
  });
  if (!part) return null;
  const code = part.code ?? '';
  const c = useChips.getState();
  const lines = code.split('\n').length;
  const errLine = rt.error?.line;
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const a = e.currentTarget.selectionStart, b = e.currentTarget.selectionEnd;
    if (e.key === 'Tab') { e.preventDefault(); caret.current = a + 2; c.setCode(id, code.slice(0, a) + '  ' + code.slice(b)); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); c.upload(id); }
    e.stopPropagation();
  };
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <BoardTabs />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted }}>ATmega328P・Arduino C（腳位 D0–D13、A0–A5）</span>
        <button style={{ ...chip(false, '', '#12345a'), flex: 'none' }} onClick={() => c.upload(id)} disabled={rt.progress !== null}>▶ 上傳（Ctrl+Enter）</button>
        <button style={{ ...chip(false), flex: 'none' }} onClick={() => { if (confirm('用範例程式取代目前的程式碼？')) c.setCode(id, ATMEGA_EXAMPLE); }}>載入範例</button>
      </div>
      {rt.progress !== null && <Progress v={rt.progress} />}
      {rt.log.length > 0 && <pre style={logBox}>{rt.log.join('\n')}</pre>}
      {rt.error && <div style={warn}>{rt.status === 'error' ? '執行錯誤' : '編譯錯誤'}（第 {errLine} 行）：{rt.error.msg}</div>}
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: 6, background: '#07071a', minHeight: 180, maxHeight: 420 }}>
        <div ref={gutter} style={{ overflow: 'hidden', padding: '8px 0', textAlign: 'right', color: '#44447a', fontFamily: T.mono, fontSize: 13, lineHeight: '19px', userSelect: 'none', minWidth: 38 }}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} style={{ padding: '0 8px', background: i + 1 === errLine ? 'rgba(210,59,59,0.4)' : undefined, color: i + 1 === errLine ? '#fff' : undefined }}>{i + 1}</div>
          ))}
        </div>
        <textarea ref={text} value={code} spellCheck={false} onChange={(e) => c.setCode(id, e.target.value)} onKeyDown={onKey}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          style={{
            flex: 1, resize: 'none', background: 'transparent', color: '#d8e0ff', border: 'none', outline: 'none',
            fontFamily: T.mono, fontSize: 13, lineHeight: '19px', padding: 8, whiteSpace: 'pre', overflow: 'auto', tabSize: 2,
          }} />
      </div>
      <p style={help}>
        上傳會經過麵包板上的 CH340：TXD → 第 2 腳、RXD ← 第 3 腳、DTR# → 第 1 腳 RESET、共地；晶片要有 VCC（7、20 腳）與 GND（8、22 腳）。
        腳位對照：D0–D7 = 第 2、3、4、5、6、11、12、13 腳；D8–D13 = 第 14–19 腳；A0–A5 = 第 23–28 腳。Flash 燒進去的程式斷電後還在。
      </p>
    </div>
  );
}

export function ChipSerialPanel({ id }: { id: string }) {
  const rt = useChips((s) => chipRt(s, id));
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [rt.serial]);
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BoardTabs />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: rt.txLinked ? T.muted : '#ffd9a0' }}>{rt.txLinked ? 'CH340（COM3）・9600 baud' : 'TXD 沒接到 CH340'}</span>
        <button style={{ ...chip(false), flex: 'none' }} onClick={() => useChips.getState().patch(id, { serial: '' })}>清除</button>
      </div>
      <pre style={{
        margin: 0, minHeight: 160, maxHeight: 360, overflow: 'auto', background: '#050510', border: `1px solid ${T.border}`,
        borderRadius: 6, padding: 10, color: '#7dffb0', fontFamily: T.mono, fontSize: 12, whiteSpace: 'pre-wrap',
      }}>{rt.serial || '（沒有輸出）'}</pre>
    </div>
  );
}

const td: CSSProperties = { padding: '2px 6px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const logBox: CSSProperties = {
  margin: 0, fontFamily: T.mono, fontSize: 11, color: '#9fd0ff', whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto',
  background: '#07071a', border: `1px solid ${T.border}`, borderRadius: 6, padding: 6,
};
