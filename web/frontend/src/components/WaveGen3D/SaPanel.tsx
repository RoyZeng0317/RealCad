// 下方面板「頻譜分析儀」分頁：頻率 / 準位設定、標記、諧波表與 THD、探棒接線
//   這裡刻意不用文字輸入框（全部用滑桿 / 按鈕 / 下拉選單），避免焦點停在輸入框讓快捷鍵失效（見 SHORTCUTS.md）
import { useEffect, useState } from 'react';
import { useSa } from './saStore.js';
import { useWaveLab } from './waveStore.js';
import { useBoard } from './boardStore.js';
import { getSaInput, peakSearch, nextPeak, saPreset, markerLevel } from './saSignal.js';
import { RBW_CHOICES, effectiveRbw, harmonicDb, thd, fmtHz, SA_FMAX } from './spectrum.js';
import { Section, Slider, Stat, chip, row, help, selectStyle, T } from './panelUi.js';
import { LeadControl } from './LeadControls.js';

const lg = Math.log10;

/** 產生器 / 電路改變時諧波表要跟著更新（getSaInput 有快取，輪詢很便宜） */
function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

function HarmonicTable() {
  const unit = useSa((s) => s.sa.unit);
  const inp = getSaInput();
  const h1 = inp.harmonics.find((x) => x.k === 1);
  const rows = inp.harmonics.filter((x) => x.k >= 1 && x.k <= 10);
  const d = thd(inp.harmonics);
  if (!h1) return <p style={help}>沒有週期訊號（產生器關閉、選 NOISE，或探棒沒接到電路）。</p>;
  const ref = harmonicDb(h1, unit);
  return (
    <>
      <table style={{ width: '100%', fontFamily: T.mono, fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: T.muted }}>
            <th style={{ textAlign: 'left' }}>次</th><th style={{ textAlign: 'right' }}>頻率</th>
            <th style={{ textAlign: 'right' }}>{unit}</th><th style={{ textAlign: 'right' }}>dBc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => {
            const db = harmonicDb(x, unit);
            return (
              <tr key={x.k} style={{ color: db - ref < -80 ? T.muted : T.value }}>
                <td>{x.k}</td><td style={{ textAlign: 'right' }}>{fmtHz(x.f)}</td>
                <td style={{ textAlign: 'right' }}>{db.toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{x.k === 1 ? '0' : (db - ref).toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={row}>
        <Stat k="THD（到第 50 次）" v={d === null ? '—' : `${(d * 100).toFixed(3)} %`} color="#c48bff" />
        <Stat k="直流成分" v={`${(inp.harmonics[0]?.vpk ?? 0).toFixed(3)} V`} />
      </div>
    </>
  );
}

export function SaControls() {
  useTick(400);
  const sa = useSa((s) => s.sa);
  const setSa = useSa((s) => s.setSa);
  const f0 = useWaveLab((s) => s.gen.frequency);
  const hasProbe = useBoard((s) => !!s.leads.sa);
  const mk = markerLevel();
  const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();

  return (
    <>
      <Section title="頻率">
        <Slider label="中心頻率 CENTER" value={fmtHz(sa.center)} min={1} max={lg(SA_FMAX)} step={0.005} v={lg(Math.max(10, sa.center))}
          onChange={(x) => setSa({ center: Number((10 ** x).toPrecision(4)) })} />
        <Slider label="頻寬 SPAN" value={fmtHz(sa.span)} min={2} max={lg(SA_FMAX)} step={0.005} v={lg(sa.span)}
          onChange={(x) => setSa({ span: Number((10 ** x).toPrecision(3)) })} />
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span>解析頻寬 RBW</span>
          <select style={selectStyle} value={sa.rbw} onChange={(e) => { setSa({ rbw: Number(e.target.value) }); blur(e); }}>
            <option value={0}>自動（{fmtHz(effectiveRbw({ ...sa, rbw: 0 }))}）</option>
            {RBW_CHOICES.map((r) => <option key={r} value={r}>{fmtHz(r)}</option>)}
          </select>
        </label>
        <div style={row}>
          <button style={chip(false, '', '#5a4a1a')} onClick={() => saPreset('fund')}>對準基頻 {fmtHz(f0)}</button>
          <button style={chip(false, '', '#5a3a1a')} onClick={() => saPreset('harm')}>看前 10 次諧波</button>
        </div>
      </Section>
      <Section title="準位 / 輸入">
        <Slider label="參考準位 REF（最上面那條線）" value={`${sa.ref.toFixed(0)} ${sa.unit}`} min={-80} max={40} step={1} v={sa.ref}
          onChange={(x) => setSa({ ref: x })} />
        <div style={row}>
          {(['dBm', 'dBV'] as const).map((u) => (
            <button key={u} style={chip(sa.unit === u)} onClick={() => setSa({ unit: u })}>{u}</button>
          ))}
        </div>
        <div style={row}>
          <button style={chip(sa.z50)} onClick={() => setSa({ z50: true })}>50 Ω</button>
          <button style={chip(!sa.z50)} onClick={() => setSa({ z50: false })}>1 MΩ</button>
          <button style={chip(sa.running, '#1f8f3c')} onClick={() => setSa({ running: !sa.running })}>{sa.running ? 'RUN' : 'HOLD'}</button>
        </div>
        <p style={help}>
          dBm 以 50 Ω 為基準（0 dBm = 1 mW = 0.2236 Vrms）；dBV 以 1 Vrms 為 0 dB。
          BNC 直接接產生器且輸入 50 Ω 時，產生器 50 Ω 內阻分掉一半電壓（−6 dB），跟真機一樣。
        </p>
      </Section>
      <Section title="標記 MARKER">
        <div style={row}>
          <button style={chip(false, '', '#1f5a3a')} onClick={peakSearch}>峰值搜尋</button>
          <button style={chip(false, '', '#1f4a5a')} onClick={nextPeak}>下一個峰值</button>
          <button style={chip(false)} onClick={() => setSa({ marker: null })}>清除</button>
        </div>
        <div style={row}>
          <Stat k="標記頻率" v={sa.marker === null ? '—' : fmtHz(sa.marker)} color="#39ff6a" />
          <Stat k="標記準位" v={mk ? `${mk.db.toFixed(2)} ${sa.unit}` : '—'} color="#39ff6a" />
        </div>
      </Section>
      <Section title="諧波分析">
        <HarmonicTable />
      </Section>
      <Section title={hasProbe ? '輸入（探棒量麵包板）' : '輸入（BNC 接產生器）'}>
        <LeadControl kind="sa" />
        <p style={help}>沒接探棒時量的是產生器輸出；接上探棒（+ / −）就量麵包板上那兩點，整流、削波產生的諧波都看得到。</p>
      </Section>
    </>
  );
}
