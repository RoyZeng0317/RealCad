// 下方面板「函數波產生器」分頁：波形、參數、輸出三張卡片（與 3D 面板上的按鍵/旋鈕共用狀態）
import { useWaveLab } from './waveStore.js';
import { type Waveform, FREQ_MIN, FREQ_MAX, OUTPUT_LIMIT, formatSI } from './waveform.js';
import { Section, Slider, chip, row, grid3, help } from './panelUi.js';
import { LeadControl } from './LeadControls.js';

const WAVES: [Waveform, string][] = [
  ['sine', '正弦'], ['square', '方波'], ['triangle', '三角'],
  ['ramp', '鋸齒'], ['pulse', '脈波'], ['noise', '雜訊'],
];

export function GeneratorControls() {
  const { gen, setGen, setWaveform } = useWaveLab();
  return (
    <>
      <Section title="波形">
        <div style={grid3}>
          {WAVES.map(([w, t]) => (
            <button key={w} style={chip(gen.waveform === w)} onClick={() => setWaveform(w)}>{t}</button>
          ))}
        </div>
        <p style={help}>FG-2000：0.1 Hz – 10 MHz，輸出上限 ±10 V（超過會削峰），BNC 輸出可直接接示波器 CH1，或接到麵包板。</p>
      </Section>
      <Section title="參數">
        <Slider label="頻率" value={formatSI(gen.frequency, 'Hz', 4)}
          min={Math.log10(FREQ_MIN)} max={Math.log10(FREQ_MAX)} step={0.01} v={Math.log10(gen.frequency)}
          onChange={(x) => setGen({ frequency: 10 ** x })} />
        <Slider label="振幅" value={`${gen.amplitude.toFixed(2)} Vpp`}
          min={0.01} max={2 * OUTPUT_LIMIT} step={0.01} v={gen.amplitude}
          onChange={(x) => setGen({ amplitude: x })} />
        <Slider label="直流偏移" value={`${gen.offset.toFixed(2)} V`}
          min={-OUTPUT_LIMIT} max={OUTPUT_LIMIT} step={0.01} v={gen.offset}
          onChange={(x) => setGen({ offset: x })} />
        {gen.waveform === 'pulse' && (
          <Slider label="工作週期" value={`${gen.duty} %`} min={1} max={99} step={1} v={gen.duty}
            onChange={(x) => setGen({ duty: x })} />
        )}
      </Section>
      <Section title="電源 / 輸出">
        <div style={row}>
          <button style={chip(gen.power, '#b32d2d')} onClick={() => setGen({ power: !gen.power })}>電源 {gen.power ? 'ON' : 'OFF'}</button>
          <button style={chip(gen.output, '#1f8f3c')} onClick={() => setGen({ output: !gen.output })}>輸出 {gen.output ? 'ON' : 'OFF'}</button>
        </div>
        <p style={help}>3D 面板上的 ADJUST 旋鈕：拖曳或滾輪調整目前選取的參數（FREQ / AMPL / OFFSET / DUTY），按住 Shift 微調。</p>
      </Section>
      <Section title="輸出接線">
        <LeadControl kind="fg" />
        <p style={help}>接到麵包板後，產生器就是電路裡的訊號源（輸出內阻 50 Ω），三用電表量到的是平均值。產生器的黑線（−）和示波器的接地夾都經過儀器外殼接大地，彼此是相通的（共地），跟真的實驗室一樣：接地夾只能夾在地的位置，夾到別的點會經由大地短路。</p>
      </Section>
    </>
  );
}
