// 下方面板「示波器」分頁：CH1、CH2、水平/觸發、操作四張卡片
import { useWaveLab } from './waveStore.js';
import { TIME_DIVS, VOLT_DIVS, OUTPUT_LIMIT, formatSI } from './waveform.js';
import { V_MAX } from './psu.js';
import { Section, Slider, chip, row, help } from './panelUi.js';
import { LeadControl } from './LeadControls.js';
import { useBoard } from './boardStore.js';

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
