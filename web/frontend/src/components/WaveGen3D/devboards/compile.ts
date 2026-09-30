// 依開發板的語言編譯程式：Arduino / ESP32 / STM32 用 C 子集、Raspberry Pi 5 用 MicroPython 子集
import { SketchError } from './sketchLang.js';
import { parseC, startC, type Hal } from './sketchRun.js';
import { compilePython, PyInterp } from './pyRun.js';

export type Language = 'c' | 'python';
export interface Compiled { start: (hal: Hal) => Generator<number, void, void> }
export type CompileResult = { ok: Compiled; error?: undefined } | { ok?: undefined; error: { msg: string; line: number } };

export function compile(src: string, lang: Language): CompileResult {
  try {
    if (lang === 'python') {
      // 常見誤用：把 C 程式貼到 Pi 5
      if (/^\s*#include\s*</m.test(src) || /\bint\s+main\s*\(/.test(src)) {
        throw new SketchError('這看起來是 C 程式；Raspberry Pi 5 請用 MicroPython（按「載入範例」看寫法）', 1);
      }
      const prog = compilePython(src);
      return { ok: { start: (hal) => new PyInterp(prog, hal).run() } };
    }
    const prog = parseC(src);
    return { ok: { start: (hal) => startC(prog, hal) } };
  } catch (err) {
    return { error: err instanceof SketchError ? { msg: err.message, line: err.line } : { msg: String(err), line: 0 } };
  }
}
