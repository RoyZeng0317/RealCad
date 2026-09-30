// 電阻值輸入框：可以直接打數值（330、4.7k、4k7、1M…），也可以從常用的 E12 清單挑；Enter 或離開輸入框時套用
import { useEffect, useState } from 'react';
import { RESISTOR_VALUES, fmtOhm, parseOhm, R_MIN, R_MAX } from './boardParts.js';
import { T, selectStyle } from './panelUi.js';

/** 顯示用：4700 → 4.7k（不含 Ω，方便直接再編輯） */
const plain = (r: number) => fmtOhm(r).replace(' Ω', '').replace(' kΩ', 'k').replace(' MΩ', 'M');

export function ResistorInput({ value, onChange, id }: { value: number; onChange: (ohms: number) => void; id: string }) {
  const [text, setText] = useState(plain(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(plain(value)); setBad(false); }, [value]);
  const apply = () => {
    const r = parseOhm(text);
    if (r === null) { setBad(true); return; }
    setBad(false);
    if (r !== value) onChange(r);
    else setText(plain(r));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          list={`${id}-e12`} value={text} spellCheck={false} aria-label="電阻值"
          onChange={(e) => { setText(e.target.value); setBad(false); }}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); apply(); }
            if (e.key === 'Escape') { setText(plain(value)); setBad(false); }
            e.stopPropagation(); // 打字時不要觸發 S / W / X / Delete 快捷鍵
          }}
          style={{ ...selectStyle, flex: 1, minWidth: 0, fontFamily: T.mono, borderColor: bad ? '#d23b3b' : T.border }}
        />
        <span style={{ color: T.muted, fontSize: 13 }}>Ω</span>
      </div>
      <datalist id={`${id}-e12`}>
        {RESISTOR_VALUES.map((v) => <option key={v} value={plain(v)}>{fmtOhm(v)}</option>)}
      </datalist>
      <span style={{ fontSize: 11, color: bad ? '#ff8a7a' : T.muted }}>
        {bad ? `看不懂這個數值，範圍 ${fmtOhm(R_MIN)} ~ ${fmtOhm(R_MAX)}` : '可輸入 330、4.7k、4k7、1M；按 Enter 套用，也可以從清單挑常用值'}
      </span>
    </div>
  );
}
