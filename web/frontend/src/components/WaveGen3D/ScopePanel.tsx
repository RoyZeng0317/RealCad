// 下方面板「示波器」分頁：CH1、CH2、水平/觸發、操作四張卡片
import { useWaveLab } from './waveStore.js';
import { TIME_DIVS, VOLT_DIVS, OUTPUT_LIMIT, formatSI } from './waveform.js';
import { V_MAX } from './psu.js';
import { Section, Slider, chip, row, help } from './panelUi.js';
import { LeadControl } from './LeadControls.js';
import { useBoard } from './boardStore.js';
import { useEffect, useState } from 'react';
import { scopeMeas } from './Oscilloscope3D.js';
import { measItems, CH1_COLOR, CH2_COLOR } from './scopeDisplay.js';
import { T } from './panelUi.js';

/** 量測 MEASURE：兩個通道的全部參數（每 0.3 秒更新，跟螢幕同一份資料） */
function MeasureTable() {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 300); return () => clearInterval(id); }, []);
  const a = scopeMeas.ch1 ? measItems(scopeMeas.ch1) : [], b = scopeMeas.ch2 ? measItems(scopeMeas.ch2) : [];
  if (!a.length) return <p style={help}>示波器畫面還沒更新（切到示波器或全景視角）。</p>;
  return (
    <table style={{ width: '100%', fontFamily: T.mono, fontSize: 12, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: T.muted }}><th style={{ textAlign: 'left' }}>參數</th><th style={{ textAlign: 'right', color: CH1_COLOR }}>CH1</th><th style={{ textAlign: 'right', color: CH2_COLOR }}>CH2</th></tr>
      </thead>
      <tbody>
        {a.map(([k, v], i) => (
          <tr key={k}><td style={{ color: T.muted }}>{k}</td><td style={{ textAlign: 'right', color: CH1_COLOR }}>{v}</td><td style={{ textAlign: 'right', color: CH2_COLOR }}>{b[i]?.[1] ?? '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScopeControls() {
  const { scope, setScope, autoSet } = useWaveLab();
  const leads = useBoard((s) => s.leads);
  return (
    <>
      <Section title={leads.ch1 ? 'CH1（探棒量麵包板）' : 'CH1（函數波產生器）'}>
        <Slider label="VOLTS/DIV" value={formatSI(VOLT_DIVS[scope.voltDivIdx], 'V')}
          min={0} max={VOLT_DIVS.length - 1} step={1} v={scope.voltDivIdx}
          onChange={(x) => setScope({ voltDivIdx: x })} />
        <Slider label="垂直位置" value={`${scope.position.toFixed(1)} div`} min={-4} max={4} step={0.1} v={scope.position}
          onChange={(x) => setScope({ position: x })} />
        <button style={chip(scope.coupling === 'AC')} onClick={() => setScope({ coupling: scope.coupling === 'DC' ? 'AC' : 'DC' })}>
          {scope.coupling} 耦合
        </button>
        <LeadControl kind="ch1" />
      </Section>
      <Section title={leads.ch2 ? 'CH2（探棒量麵包板）' : 'CH2（探棒量電源供應器）'} right={
        <button style={{ ...chip(scope.ch2On, '#1a9fc4'), flex: 'none', padding: '2px 10px' }} onClick={() => setScope({ ch2On: !scope.ch2On })}>
          {scope.ch2On ? 'ON' : 'OFF'}
        </button>
      }>
        <Slider label="VOLTS/DIV" value={formatSI(VOLT_DIVS[scope.ch2VoltDivIdx], 'V')}
          min={0} max={VOLT_DIVS.length - 1} step={1} v={scope.ch2VoltDivIdx}
          onChange={(x) => setScope({ ch2VoltDivIdx: x })} />
        <Slider label="垂直位置" value={`${scope.ch2Position.toFixed(1)} div`} min={-4} max={4} step={0.1} v={scope.ch2Position}
          onChange={(x) => setScope({ ch2Position: x })} />
        <LeadControl kind="ch2" />
      </Section>
      <Section title="水平 / 觸發">
        <Slider label="TIME/DIV" value={formatSI(TIME_DIVS[scope.timeDivIdx], 's')}
          min={0} max={TIME_DIVS.length - 1} step={1} v={scope.timeDivIdx}
          onChange={(x) => setScope({ timeDivIdx: x })} />
        <div style={row}>
          {(['CH1', 'CH2'] as const).map((src) => (
            <button key={src} style={chip(scope.trigSource === src, '#b8621f')} onClick={() => setScope({ trigSource: src })}>觸發 {src}</button>
          ))}
        </div>
        <Slider label={`觸發準位（${scope.trigSource}）`} value={formatSI(scope.trigLevel, 'V')}
          min={scope.trigSource === 'CH2' ? -V_MAX : -OUTPUT_LIMIT}
          max={scope.trigSource === 'CH2' ? V_MAX : OUTPUT_LIMIT}
          step={0.01} v={scope.trigLevel}
          onChange={(x) => setScope({ trigLevel: x })} />
      </Section>
      <Section title="量測 MEASURE" right={
        <span style={{ display: 'flex', gap: 4 }}>
          {(['基本', 'CH1', 'CH2'] as const).map((t, i) => (
            <button key={t} style={{ ...chip(scope.measPage === i, '#1f7f9f'), flex: 'none', padding: '2px 8px' }}
              onClick={() => setScope({ measPage: i as 0 | 1 | 2 })}>{t}</button>
          ))}
        </span>
      }>
        <MeasureTable />
        <p style={help}>上排按鈕（或 3D 面板的 MEAS 鍵）切換螢幕上顯示哪個通道的全部參數；量的是螢幕上的波形，TIME/DIV 調到能看到 2 個以上週期，頻率、工作週期才量得到。</p>
      </Section>
      <Section title="操作">
        <div style={row}>
          <button style={chip(false, '', '#5a4a1a')} onClick={autoSet}>AUTO SET</button>
          <button style={chip(scope.running, '#1f8f3c')} onClick={() => setScope({ running: !scope.running })}>
            {scope.running ? 'RUN' : 'STOP'}
          </button>
        </div>
        <p style={help}>CH2 是直流：觸發選 CH2、TIME/DIV 調到 1–5 ms，再開關電源輸出就能抓到電壓上升曲線（畫面保留 5 秒）。</p>
      </Section>
    </>
  );
}
