// FPGA 介面：下方「程式碼」分頁的 Quartus 專案工作台（上傳 / 編輯 / 編譯報告 / Pin Planner / Programmer）
// 與右側檢視器的 FPGA 板卡片（電源、指撥開關、按鍵、CLK_SEL、模擬速度）
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useFpga, readFpgaFiles, type ProgMode } from './fpgaStore.js';
import { ext, type FpgaFile } from './fpgaBuild.js';
import { SLOW_CLOCKS, RESOURCES, boardPinTemplate } from './fpgaBoard.js';
import { DEV_BOARDS } from '../boardDefs.js';
import { useDev, isPowered } from '../devStore.js';
import { BoardTabs, BoardHealth } from '../DevPanels.js';
import { useLabUi } from '../../labUi.js';
import { Section, chip, row, help, warn, selectStyle, T } from '../../panelUi.js';

const d = DEV_BOARDS.fpga;
const btn = (bg = '#1a1a3e'): CSSProperties => ({ ...chip(false, '', bg), flex: 'none' });
const hz = (f: number) => (f >= 1e6 ? `${(f / 1e6).toFixed(2)} MHz` : f >= 1e3 ? `${(f / 1e3).toFixed(1)} kHz` : `${Math.round(f)} Hz`);

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 一鍵：編譯 + JTAG 燒錄（給檢視器卡片用） */
function quickProgram() {
  const f = useFpga.getState();
  f.setProg({ mode: 'jtag', source: 'build' });
  f.compile();
  f.program(isPowered(useDev.getState(), 'fpga'));
}

export function FpgaWorkbench() {
  const files = useFpga((s) => s.files);
  const active = useFpga((s) => s.active);
  const build = useFpga((s) => s.build);
  const [side, setSide] = useState<'report' | 'pins' | 'prog'>('report');
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const f = useFpga.getState();

  const add = async (list: FileList | File[]) => {
    const { files: got, skipped } = await readFpgaFiles(list);
    if (got.length) f.addFiles(got);
    setMsg([got.length ? `已加入 ${got.map((x) => x.name).join('、')}` : '', skipped.length ? `略過：${skipped.join('、')}` : ''].filter(Boolean).join('　'));
    if (got.some((x) => ['sof', 'pof'].includes(ext(x.name)))) setSide('prog');
  };
  const compile = () => { f.compile(); setSide('report'); };
  const errs = build?.report.filter((r) => r.sev === 'error').length ?? 0;
  const warns = build?.report.filter((r) => r.sev === 'warn').length ?? 0;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, position: 'relative' }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <BoardTabs />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: T.muted }}>Quartus II 專案・{d.mcu.split('・')[1]}</span>
        <input ref={input} type="file" multiple hidden accept=".v,.sv,.vh,.qsf,.qpf,.sof,.pof,.vhd,.vhdl,.bdf"
          onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
        <button style={btn('#12345a')} onClick={() => input.current?.click()}>📂 上傳 Quartus 檔案</button>
        <button style={btn()} onClick={() => { if (confirm('用範例專案（8 位元計數器）取代目前的檔案？')) f.loadExample(); }}>載入範例</button>
        <button style={btn('#12345a')} onClick={compile}>▶ 編譯（Ctrl+Enter）</button>
        <button style={btn('#5a3a12')} onClick={() => setSide('prog')}>⚡ Programmer</button>
      </div>
      {msg && <p style={help}>{msg}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {files.map((x) => (
              <span key={x.name} style={{ ...chip(active === x.name), flex: 'none', display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 8px', fontSize: 12 }}
                onClick={() => f.setActive(x.name)}>
                {x.name}
                <b title="移除檔案" style={{ color: '#ff8a8a', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); if (confirm(`從專案移除 ${x.name}？`)) f.removeFile(x.name); }}>×</b>
              </span>
            ))}
            {!files.length && <span style={help}>專案是空的：上傳 .v / .qsf，或把檔案拖曳到這裡</span>}
          </div>
          <FileView file={files.find((x) => x.name === active)} onCompile={compile} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={chip(side === 'report')} onClick={() => setSide('report')}>
              編譯報告{build ? (errs ? ` ✖${errs}` : ' ✔') : ''}{warns ? ` ⚠${warns}` : ''}
            </button>
            <button style={chip(side === 'pins')} onClick={() => setSide('pins')}>Pin Planner</button>
            <button style={chip(side === 'prog')} onClick={() => setSide('prog')}>Programmer</button>
          </div>
          {side === 'report' && <Report />}
          {side === 'pins' && <PinPlanner />}
          {side === 'prog' && <Programmer />}
        </div>
      </div>
      <p style={help}>
        支援 Verilog-2001 可合成子集：module / parameter / wire / reg / assign / always @(*) / always @(posedge clk or negedge rst) / if / case(z) / for / 模組實例化 / 記憶體陣列。
        .qsf 的 set_location_assignment 決定接到板上哪個裝置；.sof / .pof 為 Intel 封閉格式，燒錄時檢查元件型號，電路由同專案的原始碼重建。
      </p>
      {drag && <div style={dropOverlay}>放開以加入 Quartus 檔案（.v .qsf .qpf .sof .pof）</div>}
    </div>
  );
}

function FileView({ file, onCompile }: { file?: FpgaFile; onCompile: () => void }) {
  const build = useFpga((s) => s.build);
  const text = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && text.current) { text.current.selectionStart = text.current.selectionEnd = caret.current; caret.current = null; }
  });
  if (!file) return null;
  if (file.text === null) {
    return (
      <div style={{ ...box, padding: 12, fontSize: 13, lineHeight: 1.7 }}>
        <b style={{ color: T.accent }}>{file.name}</b>（{ext(file.name) === 'sof' ? 'SRAM Object File' : 'Programmer Object File'}，{(file.size / 1024).toFixed(1)} KB）<br />
        元件型號：<span style={{ color: T.value }}>{file.device ?? '檔案裡沒有找到'}</span><br />
        <span style={{ color: T.muted }}>二進位燒錄檔，請到右邊 Programmer 選擇這個檔案燒錄。</span>
      </div>
    );
  }
  const code = file.text;
  const lines = code.split('\n').length;
  const errLine = build?.report.find((r) => r.sev === 'error' && r.file === file.name)?.line;
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
    if (e.key === 'Tab') {
      e.preventDefault();
      caret.current = a + 2;
      useFpga.getState().setText(file.name, code.slice(0, a) + '  ' + code.slice(b));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onCompile(); }
    e.stopPropagation();
  };
  return (
    <div style={{ ...box, display: 'flex', minHeight: 200, maxHeight: 440 }}>
      <div ref={gutter} style={{ overflow: 'hidden', padding: '8px 0', textAlign: 'right', color: '#44447a', fontFamily: T.mono, fontSize: 13, lineHeight: '19px', userSelect: 'none', minWidth: 38 }}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} style={{ padding: '0 8px', background: i + 1 === errLine ? 'rgba(210,59,59,0.4)' : undefined, color: i + 1 === errLine ? '#fff' : undefined }}>{i + 1}</div>
        ))}
      </div>
      <textarea ref={text} value={code} spellCheck={false}
        onChange={(e) => useFpga.getState().setText(file.name, e.target.value)} onKeyDown={onKey}
        onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
        style={{
          flex: 1, resize: 'none', background: 'transparent', color: '#d8e0ff', border: 'none', outline: 'none',
          fontFamily: T.mono, fontSize: 13, lineHeight: '19px', padding: 8, whiteSpace: 'pre', overflow: 'auto', tabSize: 2,
        }} />
    </div>
  );
}

function Report() {
  const build = useFpga((s) => s.build);
  if (!build) return <div style={{ ...box, padding: 10 }}><p style={help}>還沒有編譯：按「▶ 編譯」執行 Analysis & Synthesis、Fitter、Assembler。</p></div>;
  const color = { info: '#8fb4d0', warn: '#ffd9a0', error: '#ff8a7a' };
  const icon = { info: 'Info', warn: 'Warning', error: 'Error' };
  return (
    <div style={{ ...box, padding: 8, maxHeight: 440, overflow: 'auto', fontFamily: T.mono, fontSize: 12, lineHeight: 1.6 }}>
      <div style={{ color: build.ok ? '#3cff7a' : '#ff4d3a', fontWeight: 700, marginBottom: 4 }}>
        {build.ok ? `✔ 編譯成功：${build.top}` : '✖ 編譯失敗'}　<span style={{ color: T.muted, fontWeight: 400 }}>{new Date(build.at).toLocaleTimeString()}</span>
      </div>
      {build.report.map((r, i) => (
        <div key={i} style={{ color: color[r.sev], cursor: r.file ? 'pointer' : 'default' }}
          onClick={() => { if (r.file && useFpga.getState().files.some((f) => f.name === r.file)) useFpga.getState().setActive(r.file); }}>
          {icon[r.sev]}: {r.msg}{r.file ? `（${r.file}${r.line ? ` 第 ${r.line} 行` : ''}）` : ''}
        </div>
      ))}
    </div>
  );
}

function PinPlanner() {
  const build = useFpga((s) => s.build);
  const bits = build?.image?.bits;
  const [all, setAll] = useState(false);
  return (
    <div style={{ ...box, padding: 8, maxHeight: 440, overflow: 'auto' }}>
      <div style={{ ...row, marginBottom: 6 }}>
        <button style={chip(!all)} onClick={() => setAll(false)}>專案腳位</button>
        <button style={chip(all)} onClick={() => setAll(true)}>板子腳位總表</button>
        <button style={btn()} onClick={() => download('RealCad_FLEX10K_pins.txt', boardPinTemplate())}>⬇</button>
      </div>
      {all ? (
        <table style={table}>
          <thead><tr style={{ color: T.muted }}><td style={td}>Location</td><td style={td}>板上裝置</td><td style={td}>方向</td></tr></thead>
          <tbody>{RESOURCES.map((r) => (
            <tr key={r.pin}><td style={{ ...td, color: T.value }}>PIN_{r.pin}</td><td style={td}>{r.label}</td><td style={td}>{r.dir}</td></tr>
          ))}</tbody>
        </table>
      ) : !bits ? <p style={help}>編譯成功後會列出每個埠的腳位（來自 .qsf 的 set_location_assignment）。</p> : (
        <table style={table}>
          <thead><tr style={{ color: T.muted }}><td style={td}>Node Name</td><td style={td}>Direction</td><td style={td}>Location</td><td style={td}>板上裝置</td></tr></thead>
          <tbody>{bits.map((b) => (
            <tr key={b.name}>
              <td style={{ ...td, color: T.accent }}>{b.name}</td><td style={td}>{b.dir}</td>
              <td style={{ ...td, color: T.value }}>PIN_{b.pin}</td><td style={{ ...td, color: b.res ? T.text : '#ffb020' }}>{b.res?.label ?? '（沒有接東西）'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function Programmer() {
  const files = useFpga((s) => s.files);
  const prog = useFpga((s) => s.prog);
  const build = useFpga((s) => s.build);
  const sram = useFpga((s) => s.sram);
  const epc = useFpga((s) => s.epc);
  const powered = useDev((s) => isPowered(s, 'fpga'));
  const f = useFpga.getState();
  const bins = files.filter((x) => ext(x.name) === (prog.mode === 'jtag' ? 'sof' : 'pof'));
  const top = build?.top || 'output';
  return (
    <div style={{ ...box, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <div>Hardware Setup：<b style={{ color: powered ? '#3cff7a' : '#ff8a7a' }}>USB-Blaster [USB-0]{powered ? '' : '（板子未上電）'}</b></div>
      <div style={row}>
        {(['jtag', 'as'] as ProgMode[]).map((m) => (
          <button key={m} style={chip(prog.mode === m)} onClick={() => f.setProg({ mode: m, source: 'build' })}>
            {m === 'jtag' ? 'JTAG（.sof → FPGA）' : 'Active Serial（.pof → EPC2）'}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>檔案
        <select style={{ ...selectStyle, flex: 1 }} value={prog.source} onChange={(e) => f.setProg({ source: e.target.value })}>
          <option value="build">output_files/{top}.{prog.mode === 'jtag' ? 'sof' : 'pof'}（編譯結果）</option>
          {bins.map((b) => <option key={b.name} value={b.name}>{b.name}（上傳，{b.device ?? '未知型號'}）</option>)}
        </select>
      </label>
      <div style={{ color: T.muted, fontSize: 12 }}>Device：{prog.mode === 'jtag' ? 'EPF10K50EQC240-1' : 'EPC2（設定 EPF10K50EQC240-1）'}・Program / Configure ☑ Verify ☑</div>
      <button style={{ ...chip(false, '', '#1f6a2a'), opacity: prog.progress !== null ? 0.5 : 1 }} disabled={prog.progress !== null}
        onClick={() => f.program(powered)}>▶ Start</button>
      <div style={{ height: 10, background: '#07071a', border: `1px solid ${T.border}`, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(prog.progress ?? (prog.log.some((l) => l.startsWith('✔')) ? 1 : 0)) * 100}%`, background: '#1fbf4a', transition: 'width 0.1s' }} />
      </div>
      <pre style={{ margin: 0, fontFamily: T.mono, fontSize: 12, color: '#9fd0ff', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>
        {prog.log.join('\n') || '選好模式與檔案後按 Start。'}
      </pre>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
        FPGA（SRAM）：<span style={{ color: sram ? '#3cff7a' : T.muted }}>{sram ? `已設定 ${sram.name}` : '未設定'}</span>
        EPC2：<span style={{ color: epc ? T.value : T.muted }}>{epc ? epc.name : '空白'}</span>
        {epc && <button style={{ ...btn(), marginLeft: 8, padding: '1px 8px', fontSize: 11 }} onClick={() => { if (confirm('清除 EPC2 設定晶片？')) f.patch({ epc: null }); }}>Erase</button>}
      </div>
    </div>
  );
}

export function FpgaCard() {
  const conf = useDev((s) => s.conf.fpga);
  const rt = useDev((s) => s.rt.fpga);
  const powered = useDev((s) => isPowered(s, 'fpga'));
  const sw = useFpga((s) => s.sw);
  const keys = useFpga((s) => s.keys);
  const reset = useFpga((s) => s.reset);
  const slides = useFpga((s) => s.slides);
  const sdCard = useFpga((s) => s.sdCard);
  const tfCard = useFpga((s) => s.tfCard);
  const speaker = useFpga((s) => s.speaker);
  const spkHz = useFpga((s) => s.spkHz);
  const slowHz = useFpga((s) => s.slowHz);
  const sram = useFpga((s) => s.sram);
  const stats = useFpga((s) => s.stats);
  const runtimeError = useFpga((s) => s.runtimeError);
  const busy = useFpga((s) => s.prog.progress !== null);
  const f = useFpga.getState();
  const s = useDev.getState();
  const uses50 = sram?.bits.some((b) => b.res?.kind === 'clk50');
  const [label, color] = rt.tripped ? ['電源保護跳脫', '#ff4d3a'] : !powered ? ['未上電', '#7a7ab0'] : runtimeError ? ['錯誤', '#ff4d3a']
    : busy ? ['燒錄中…', '#ffb020'] : sram ? ['執行中', '#3cff7a'] : ['未設定（CONF_DONE = 0）', '#ffb020'];
  return (
    <Section title={d.name} right={<span style={{ fontSize: 12, color, fontWeight: 700 }}>● {label}</span>}>
      <p style={help}>{d.mcu}・I/O 上限 {d.iMax * 1000} mA・J1 排針 5 V 耐壓{sram ? `・目前電路：${sram.name}` : ''}</p>
      <div style={row}>
        <button style={chip(conf.usb, '#1f8f3c')} onClick={() => s.setUsb('fpga', !conf.usb)}>電源 {conf.usb ? 'ON' : 'OFF'}</button>
        <button style={chip(false)} onClick={() => { s.setCodeTab('fpga'); useLabUi.getState().setDockTab('code'); }}>Quartus 專案</button>
      </div>
      <div style={row}>
        <button style={chip(false, '', '#12345a')} onClick={quickProgram} disabled={!powered || busy}>編譯並燒錄（JTAG）</button>
        <button style={chip(false)} onClick={() => f.reconfigure()} title="重新從 EPC2 載入">nCONFIG</button>
      </div>
      {runtimeError && <div style={warn}>模擬錯誤：{runtimeError}</div>}
      <div style={{ fontSize: 12, color: T.muted }}>指撥開關（上 = 1）</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
          <button key={i} style={{ ...chip(!!((sw >> i) & 1), '#8a1f24'), padding: '4px 0', fontSize: 11 }} onClick={() => f.toggleSw(i)}>SW{i}<br />{(sw >> i) & 1}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>按鍵（按住 = 0）</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[3, 2, 1, 0].map((i) => (
          <button key={i} style={{ ...chip(!!((keys >> i) & 1)), touchAction: 'none' }}
            onPointerDown={() => f.setKey(i, true)} onPointerUp={() => f.setKey(i, false)} onPointerLeave={() => f.setKey(i, false)}>KEY{i}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={{ ...chip(reset, '#8a1414', '#5a1a1a'), touchAction: 'none' }}
          onPointerDown={() => f.setReset(true)} onPointerUp={() => f.setReset(false)} onPointerLeave={() => f.setReset(false)}>● RESET</button>
        {[1, 0].map((i) => (
          <button key={i} style={chip(!!((slides >> i) & 1))} onClick={() => f.toggleSlide(i)}>SLD{i}：{(slides >> i) & 1}</button>
        ))}
      </div>
      <div style={row}>
        <button style={chip(sdCard, '#1d4fb8')} onClick={() => f.toggleCard('sd')}>SD 卡：{sdCard ? '已插入' : '未插'}</button>
        <button style={chip(tfCard, '#1d4fb8')} onClick={() => f.toggleCard('tf')}>TF 卡：{tfCard ? '已插入' : '未插'}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <button style={{ ...chip(speaker, '#1f6a2a'), flex: 'none' }} onClick={() => f.toggleSpeaker()}>{speaker ? '🔊 喇叭' : '🔇 靜音'}</button>
        <span style={{ color: T.muted, fontSize: 12 }}>
          {!sram || !powered ? '—' : !spkHz ? '喇叭沒有聲音' : spkHz < 20 ? `${spkHz} Hz（低於可聽範圍）` : spkHz > 20000 ? `${hz(spkHz)}（超過可聽範圍）` : `發聲 ${hz(spkHz)}`}
        </span>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>CLK_SEL（PIN_92）
        <select style={{ ...selectStyle, flex: 1 }} value={slowHz} onChange={(e) => f.setSlowHz(Number(e.target.value))}>
          {SLOW_CLOCKS.map((h) => <option key={h} value={h}>{hz(h)}</option>)}
        </select>
      </label>
      {sram && powered && (
        <p style={help}>
          {uses50 ? `CLK_50MHz（PIN_91）實際模擬 ${hz(stats.rate)}（約慢 ${Math.max(1, Math.round(50e6 / Math.max(stats.rate, 1)))} 倍）・` : ''}
          {`已跑 ${stats.cycles.toLocaleString()} 個 50 MHz 週期、${stats.slowTicks.toLocaleString()} 個 CLK_SEL 週期`}
        </p>
      )}
      <BoardHealth kind="fpga" />
    </Section>
  );
}

const box: CSSProperties = { border: `1px solid ${T.border}`, borderRadius: 6, background: '#07071a' };
const table: CSSProperties = { borderCollapse: 'collapse', fontSize: 11, fontFamily: T.mono, width: '100%' };
const td: CSSProperties = { padding: '2px 6px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' };
const dropOverlay: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(0,134,179,0.25)', border: `2px dashed ${T.accent}`, borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 700, pointerEvents: 'none',
};
