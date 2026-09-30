// 開發板相關介面：左側元件庫「開發板」、右側檢視器的開發板卡片、下方「程式碼」與「序列埠」分頁
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { DEV_BOARDS, DEV_KINDS, devNet, type DevKind } from './boardDefs.js';
import { useDev, isPowered } from './devStore.js';
import { MODE } from './sketchRun.js';
import { useBoard } from '../boardStore.js';
import { useBench } from '../bench.js';
import { useLabUi } from '../labUi.js';
import { Section, chip, row, help, warn, T } from '../panelUi.js';

const ICON: Record<DevKind, string> = { uno: '∞', esp32: '📶', stm32: '▣', pi5: 'π' };
const STATUS: Record<string, [string, string]> = {
  off: ['未上電', '#7a7ab0'], running: ['執行中', '#3cff7a'], sleeping: ['執行中', '#3cff7a'],
  done: ['程式結束', '#8fb4d0'], stopped: ['已停止', '#ffb020'], error: ['錯誤', '#ff4d3a'],
};
const MODE_NAME = ['INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN'];

export function DevLibrary() {
  const conf = useDev((s) => s.conf);
  const selected = useDev((s) => s.selected);
  const { setPresent, select } = useDev.getState();
  return (
    <Section title="開發板">
      {DEV_KINDS.map((k) => {
        const d = DEV_BOARDS[k], on = conf[k].present;
        return (
          <div key={k} style={{
            display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, padding: '6px 8px',
            background: selected === k ? '#0b3550' : 'transparent', border: `1px solid ${selected === k ? T.accent : 'transparent'}`,
          }}>
            <span style={{ width: 28, textAlign: 'center', color: T.accent, fontWeight: 700 }}>{ICON[k]}</span>
            <button onClick={() => { if (on) { select(k); useBoard.getState().selectPart(null); useLabUi.getState().focus('devboards'); } }}
              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: T.text, cursor: on ? 'pointer' : 'default', padding: 0, fontFamily: T.font }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{d.mcu}</div>
            </button>
            <button style={{ ...chip(on, '#5a2030'), flex: 'none', padding: '3px 8px', fontSize: 12 }}
              onClick={() => { setPresent(k, !on); if (!on) useLabUi.getState().focus('devboards'); }}>
              {on ? '移除' : '加入'}
            </button>
          </div>
        );
      })}
    </Section>
  );
}

export function DevBoardCard({ kind }: { kind: DevKind }) {
  const d = DEV_BOARDS[kind];
  const conf = useDev((s) => s.conf[kind]);
  const rt = useDev((s) => s.rt[kind]);
  const powered = useDev((s) => isPowered(s, kind));
  const parts = useBoard((s) => s.parts);
  const bench = useBench();
  const s = useDev.getState();
  const [label, color] = rt.tripped ? ['USB 保險絲跳脫', '#ff4d3a'] : STATUS[rt.status] ?? ['—', T.muted];

  // 表列有在用的腳：程式設定過、或有接杜邦線
  const wired = new Set(parts.flatMap((p) => p.pins).filter((h) => h.startsWith(`h:${kind}:`)).map((h) => h.split(':')[2]));
  const gnd = d.pins.find((p) => p.kind === 'GND')!.id;
  const gV = bench.sol.nodeV[bench.netOfHole(`h:${kind}:${gnd}`)] ?? 0;
  const used = d.pins.filter((p) => rt.pins[p.id] || wired.has(p.id) || rt.dead.includes(p.id));

  return (
    <Section title={d.name} right={<span style={{ fontSize: 12, color, fontWeight: 700 }}>● {label}</span>}>
      <p style={help}>{d.mcu}・{d.lang}・GPIO 上限 {d.iMax * 1000} mA</p>
      <div style={row}>
        <button style={chip(conf.usb, '#1f8f3c')} onClick={() => s.setUsb(kind, !conf.usb)}>USB 供電 {conf.usb ? 'ON' : 'OFF'}</button>
        <button style={chip(false)} onClick={() => { s.setCodeTab(kind); useLabUi.getState().setDockTab('code'); }}>程式碼</button>
      </div>
      <div style={row}>
        <button style={chip(false, '', '#12345a')} onClick={() => s.upload(kind)} disabled={!powered}>上傳</button>
        <button style={chip(false, '', '#5a4a1a')} onClick={() => s.stop(kind)}>停止</button>
        <button style={chip(false)} onClick={() => s.reboot(kind)}>重新開機</button>
      </div>
      {rt.compileError && <div style={warn}>編譯錯誤（第 {rt.compileError.line} 行）：{rt.compileError.msg}</div>}
      {rt.runtimeError && <div style={warn}>執行錯誤（第 {rt.runtimeError.line} 行）：{rt.runtimeError.msg}</div>}
      {rt.issues.map((i) => (
        <div key={i.key} style={{ ...warn, ...(i.severity === 'warn' ? { color: '#ffd9a0', background: 'rgba(210,150,40,0.12)', borderColor: '#6b5a2a' } : {}) }}>
          {i.severity === 'error' ? '⚠ ERROR：' : '注意：'}{i.msg}
        </div>
      ))}
      {(rt.dead.length > 0 || rt.tripped) && (
        <button style={chip(false, '', '#5a4a1a')} onClick={() => s.repair(kind)}>更換新板子（修復燒毀的腳位）</button>
      )}
      {used.length > 0 && (
        <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono }}>
          <thead><tr style={{ color: T.muted }}><td style={td}>腳</td><td style={td}>模式</td><td style={td}>電壓</td><td style={td}>電流</td></tr></thead>
          <tbody>
            {used.map((p) => {
              const st = rt.pins[p.id];
              const v = bench.sol.nodeV[bench.netOfHole(`h:${kind}:${p.id}`)];
              const el = bench.sol.el[`dev:${kind}:${p.id}`] ?? (p.kind === '5V' ? bench.sol.el[`dev:${kind}:5V`] : p.kind === '3V3' ? bench.sol.el[`dev:${kind}:3V3`] : undefined);
              const dead = rt.dead.includes(p.id);
              return (
                <tr key={p.id}>
                  <td style={{ ...td, color: T.accent }}>{p.label}</td>
                  <td style={{ ...td, color: dead ? '#ff4d3a' : T.text }}>
                    {dead ? '燒毀' : p.kind !== 'gpio' ? p.kind : st ? `${MODE_NAME[st.mode]}${st.mode === MODE.OUTPUT ? (st.level === 1 ? ' H' : st.level === 0 ? ' L' : ` ${Math.round(st.level * 100)}%`) : ''}` : '—'}
                  </td>
                  <td style={{ ...td, color: '#7dffb0' }}>{v === undefined ? '—' : `${(v - gV).toFixed(2)} V`}</td>
                  <td style={{ ...td, color: T.value }}>{el ? `${(el.i * 1000).toFixed(1)} mA` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button style={chip(false, '', '#3a1a2a')} onClick={() => s.setPresent(kind, false)}>從實驗桌移除</button>
    </Section>
  );
}
const td: CSSProperties = { padding: '2px 6px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };

function BoardTabs() {
  const conf = useDev((s) => s.conf);
  const tab = useDev((s) => s.codeTab);
  const present = DEV_KINDS.filter((k) => conf[k].present);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {present.map((k) => (
        <button key={k} style={{ ...chip(tab === k), flex: 'none' }} onClick={() => useDev.getState().setCodeTab(k)}>{DEV_BOARDS[k].name}</button>
      ))}
    </div>
  );
}

function NoBoards() {
  return (
    <Section title="還沒有開發板">
      <p style={help}>從左側元件庫的「開發板」加入 Arduino Uno、ESP32、STM32 Blue Pill 或 Raspberry Pi 5。</p>
    </Section>
  );
}

export function CodePanel() {
  const conf = useDev((s) => s.conf);
  const tab = useDev((s) => s.codeTab);
  const rt = useDev((s) => s.rt[tab]);
  const s = useDev.getState();
  const text = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  // 程式插入縮排後，要在 React 更新完文字的同一輪就把游標放回去（不能等下一幀，否則快速打字會錯位）
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && text.current) {
      text.current.selectionStart = text.current.selectionEnd = caret.current;
      caret.current = null;
    }
  });
  const present = DEV_KINDS.filter((k) => conf[k].present);
  useEffect(() => { if (present.length && !present.includes(tab)) s.setCodeTab(present[0]); });
  if (!present.length) return <NoBoards />;
  const d = DEV_BOARDS[tab];
  const code = conf[tab].code;
  const lines = code.split('\n').length;
  const errLine = rt.compileError?.line ?? rt.runtimeError?.line;

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
    const py = d.language === 'python';
    const insert = (text: string) => {
      caret.current = a + text.length;
      s.setCode(tab, code.slice(0, a) + text + code.slice(b));
    };
    if (e.key === 'Tab') { e.preventDefault(); insert(py ? '    ' : '  '); }
    // Python：Enter 保留上一行縮排，行尾是冒號就再多縮一層
    if (py && e.key === 'Enter' && !e.ctrlKey && !e.metaKey && a === b) {
      e.preventDefault();
      const lineStart = code.lastIndexOf('\n', a - 1) + 1;
      const cur = code.slice(lineStart, a);
      const indent = /^\s*/.exec(cur)![0];
      insert('\n' + indent + (/:\s*(#.*)?$/.test(cur) ? '    ' : ''));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); s.upload(tab); }
    e.stopPropagation(); // 不要觸發 Delete 刪零件等全域快捷鍵
  };

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <BoardTabs />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted }}>{d.lang}</span>
        <button style={{ ...chip(false, '', '#12345a'), flex: 'none' }} onClick={() => s.upload(tab)}>▶ 上傳並執行（Ctrl+Enter）</button>
        <button style={{ ...chip(false, '', '#5a4a1a'), flex: 'none' }} onClick={() => s.stop(tab)}>■ 停止</button>
        <button style={{ ...chip(false), flex: 'none' }} onClick={() => s.reboot(tab)}>↻ 重新開機</button>
        <button style={{ ...chip(false), flex: 'none' }} onClick={() => { if (confirm('用範例程式取代目前的程式碼？')) s.setCode(tab, d.example); }}>載入範例</button>
      </div>
      {(rt.compileError || rt.runtimeError) && (
        <div style={warn}>{rt.compileError ? '編譯錯誤' : '執行錯誤'}（第 {errLine} 行）：{(rt.compileError ?? rt.runtimeError)!.msg}</div>
      )}
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: 6, background: '#07071a', minHeight: 180, maxHeight: 420 }}>
        <div ref={gutter} style={{ overflow: 'hidden', padding: '8px 0', textAlign: 'right', color: '#44447a', fontFamily: T.mono, fontSize: 13, lineHeight: '19px', userSelect: 'none', minWidth: 38 }}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} style={{ padding: '0 8px', background: i + 1 === errLine ? 'rgba(210,59,59,0.4)' : undefined, color: i + 1 === errLine ? '#fff' : undefined }}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={text}
          value={code}
          spellCheck={false}
          onChange={(e) => s.setCode(tab, e.target.value)}
          onKeyDown={onKey}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          style={{
            flex: 1, resize: 'none', background: 'transparent', color: '#d8e0ff', border: 'none', outline: 'none',
            fontFamily: T.mono, fontSize: 13, lineHeight: '19px', padding: 8, whiteSpace: 'pre', overflow: 'auto', tabSize: 2,
          }}
        />
      </div>
      <p style={help}>
        {d.language === 'python'
          ? 'MicroPython：from machine import Pin, PWM、Pin(17, Pin.OUT)、.on() / .off() / .value() / .toggle()、Pin(27, Pin.IN, Pin.PULL_UP)、PWM(Pin(18), freq=1000, duty_u16=32768)、time.sleep / sleep_ms / ticks_ms、print、f-string、if / for / while / def / try、list / dict。腳位用 BCM GPIO 編號（Pi 5 沒有 ADC）。'
          : '支援：pinMode / digitalWrite / digitalRead / analogWrite / analogRead / delay / millis / Serial.print(ln)、if / for / while / switch、函式、陣列、#define。'}
        {tab === 'uno' ? ' Uno 的 int 是 16 位元。' : ''}{tab === 'stm32' ? ' 腳位寫 PA0、PB12、PC13…' : ''}
      </p>
    </div>
  );
}

export function SerialPanel() {
  const conf = useDev((s) => s.conf);
  const tab = useDev((s) => s.codeTab);
  const rt = useDev((s) => s.rt[tab]);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [rt.serial]);
  if (!DEV_KINDS.some((k) => conf[k].present)) return <NoBoards />;
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BoardTabs />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted }}>{DEV_BOARDS[tab].kind === 'pi5' ? 'stdout' : '115200 baud'}</span>
        <button style={{ ...chip(false), flex: 'none' }} onClick={() => useDev.getState().clearSerial(tab)}>清除</button>
      </div>
      <pre ref={pre} style={{
        margin: 0, minHeight: 160, maxHeight: 360, overflow: 'auto', background: '#050510', border: `1px solid ${T.border}`,
        borderRadius: 6, padding: 10, color: '#7dffb0', fontFamily: T.mono, fontSize: 12, whiteSpace: 'pre-wrap',
      }}>{rt.serial || '（沒有輸出）'}</pre>
    </div>
  );
}

/** 用在電路節點表：開發板腳位對應的網路名稱 */
export const devNetLabel = (kind: DevKind, id: string) => {
  const p = DEV_BOARDS[kind].pins.find((x) => x.id === id);
  return p ? devNet(kind, p) : '';
};
