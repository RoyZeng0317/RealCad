// MicroPython 子集直譯器（Raspberry Pi 5 用）：machine.Pin / PWM、time.sleep、print、f-string…
// 用 generator 執行，time.sleep 會 yield 讓出時間；跟 C 直譯器共用同一個 Hal（腳位電氣行為）
import { SketchError } from './sketchLang.js';
import { parsePython, type PyExpr, type PyStmt, type FPart } from './pyLang.js';
import { MODE, type Hal } from './sketchRun.js';

type Gen<T> = Generator<number, T, void>;

// ---- Python 值 ----
/** 整數值的浮點數（例如 2.0）要跟整數 2 分開，print 才會印出 2.0 */
class PyFloat { constructor(public v: number) {} }
class PyTuple { constructor(public items: PyVal[]) {} }
class PyRange { constructor(public start: number, public stop: number, public step: number) {} }
class PyDict { m = new Map<string, [PyVal, PyVal]>(); }
interface PyFunc { kind: 'func'; name: string; params: { name: string; dflt?: PyVal }[]; body: PyStmt[]; closure: Scope }
interface Builtin { kind: 'builtin'; name: string; fn: (args: PyVal[], kw: Record<string, PyVal>, line: number) => Gen<PyVal> }
interface PyObj { kind: 'obj'; cls: string; attrs: Record<string, PyVal>; call?: Builtin }
type PyVal = number | boolean | string | null | PyFloat | PyTuple | PyRange | PyDict | PyVal[] | PyFunc | Builtin | PyObj;

class PyErr extends SketchError {
  constructor(public type: string, public raw: string, line: number) { super(raw ? `${type}: ${raw}` : type, line); }
}
class Flow { constructor(public f: 'break' | 'continue' | 'return', public v: PyVal = null) {} }

const isFloat = (x: PyVal) => x instanceof PyFloat || (typeof x === 'number' && !Number.isInteger(x));
const mkFloat = (v: number): PyVal => (Number.isInteger(v) ? new PyFloat(v) : v);
const isNum = (x: PyVal): x is number | boolean | PyFloat => typeof x === 'number' || typeof x === 'boolean' || x instanceof PyFloat;
const typeName = (x: PyVal): string =>
  x === null ? 'NoneType' : typeof x === 'boolean' ? 'bool' : typeof x === 'string' ? 'str' : isFloat(x) ? 'float' : typeof x === 'number' ? 'int'
    : Array.isArray(x) ? 'list' : x instanceof PyTuple ? 'tuple' : x instanceof PyDict ? 'dict' : x instanceof PyRange ? 'range'
      : (x as PyObj).kind === 'obj' ? (x as PyObj).cls : 'function';

function fmtFloat(v: number): string {
  if (!isFinite(v)) return isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
  if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1);
  const s = String(v);
  return s.includes('e') ? s.replace(/e([+-])(\d)$/, 'e$10$2') : s;
}
function str(x: PyVal): string {
  if (x === null) return 'None';
  if (x === true) return 'True';
  if (x === false) return 'False';
  if (typeof x === 'string') return x;
  if (x instanceof PyFloat) return fmtFloat(x.v);
  if (typeof x === 'number') return Number.isInteger(x) ? String(x) : fmtFloat(x);
  return repr(x);
}
function repr(x: PyVal): string {
  if (typeof x === 'string') return `'${x.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  if (Array.isArray(x)) return `[${x.map(repr).join(', ')}]`;
  if (x instanceof PyTuple) return x.items.length === 1 ? `(${repr(x.items[0])},)` : `(${x.items.map(repr).join(', ')})`;
  if (x instanceof PyDict) return `{${[...x.m.values()].map(([k, v]) => `${repr(k)}: ${repr(v)}`).join(', ')}}`;
  if (x instanceof PyRange) return `range(${x.start}, ${x.stop}${x.step !== 1 ? `, ${x.step}` : ''})`;
  if (x && typeof x === 'object' && 'kind' in x) {
    if (x.kind === 'obj') return x.cls === 'Pin' ? `Pin(${str(x.attrs.id)})` : `<${x.cls}>`;
    return `<function ${x.name}>`;
  }
  return str(x);
}
const truthy = (x: PyVal): boolean =>
  x === null ? false : typeof x === 'boolean' ? x : typeof x === 'number' ? x !== 0 : x instanceof PyFloat ? x.v !== 0
    : typeof x === 'string' ? x.length > 0 : Array.isArray(x) ? x.length > 0 : x instanceof PyTuple ? x.items.length > 0
      : x instanceof PyDict ? x.m.size > 0 : x instanceof PyRange ? rangeLen(x) > 0 : true;
const rangeLen = (r: PyRange) => Math.max(0, Math.ceil((r.stop - r.start) / r.step));
const keyOf = (k: PyVal) => `${typeName(k) === 'bool' ? 'int' : isNum(k) ? 'num' : typeName(k)}:${isNum(k) ? toNum(k) : str(k)}`;
function toNum(x: PyVal): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (x instanceof PyFloat) return x.v;
  throw new PyErr('TypeError', `需要數字，但拿到 ${typeName(x)}`, 0);
}

/** 格式規格：f"{x:.2f}"、f"{n:05d}"、f"{s:>8}"、f"{v:x}" */
function format(v: PyVal, spec: string): string {
  if (!spec) return str(v);
  const m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?(,)?(?:\.(\d+))?([bcdeEfFgGosxX%])?$/.exec(spec);
  if (!m) return str(v);
  const [, fillCh, align, sign, alt, zero, width, comma, prec, type] = m;
  let s: string;
  const n = isNum(v) ? toNum(v) : NaN;
  switch (type) {
    case 'f': case 'F': s = n.toFixed(prec ? +prec : 6); break;
    case 'e': case 'E': s = n.toExponential(prec ? +prec : 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (type === 'E') s = s.toUpperCase(); break;
    case '%': s = (n * 100).toFixed(prec ? +prec : 6) + '%'; break;
    case 'd': s = String(Math.trunc(n)); break;
    case 'x': s = Math.trunc(n).toString(16); break;
    case 'X': s = Math.trunc(n).toString(16).toUpperCase(); break;
    case 'b': s = Math.trunc(n).toString(2); break;
    case 'o': s = Math.trunc(n).toString(8); break;
    case 'c': s = String.fromCharCode(n); break;
    case 'g': case 'G': s = String(+n.toPrecision(prec ? +prec : 6)); break;
    default: s = prec && isNum(v) ? n.toFixed(+prec) : prec ? str(v).slice(0, +prec) : str(v);
  }
  if (alt && type && 'xXob'.includes(type)) s = (type === 'o' ? '0o' : type === 'b' ? '0b' : type === 'X' ? '0X' : '0x') + s;
  if (comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (sign === '+' && n >= 0) s = '+' + s;
  const w = width ? +width : 0;
  if (s.length >= w) return s;
  if (zero && !align) return (s[0] === '-' || s[0] === '+' ? s[0] + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0'));
  const fill = fillCh ?? ' ';
  const a = align ?? (isNum(v) ? '>' : '<');
  if (a === '<') return s + fill.repeat(w - s.length);
  if (a === '^') { const l = Math.floor((w - s.length) / 2); return fill.repeat(l) + s + fill.repeat(w - s.length - l); }
  return fill.repeat(w - s.length) + s;
}

class Scope {
  vars = new Map<string, PyVal>();
  globals = new Set<string>();
  constructor(public parent: Scope | null, public isFunc: boolean) {}
}

export class PyInterp {
  private g = new Scope(null, false);
  private builtins = new Map<string, PyVal>();
  private modules: Record<string, () => PyObj>;
  private depth = 0;
  ops = 0;
  private seed = 12345;

  constructor(private prog: PyStmt[], hal: Hal) {
    const B = (name: string, fn: Builtin['fn']): Builtin => ({ kind: 'builtin', name, fn });
    const bi = (name: string, fn: (a: PyVal[], kw: Record<string, PyVal>, line: number) => PyVal) =>
      this.builtins.set(name, B(name, function* (a, kw, l) { return fn(a, kw, l); }));
    const self = this;

    bi('print', (a, kw) => {
      const sep = kw.sep === undefined ? ' ' : str(kw.sep), end = kw.end === undefined ? '\n' : str(kw.end);
      hal.print(a.map(str).join(sep) + end);
      return null;
    });
    bi('range', (a, _kw, l) => {
      const n = a.map((x) => this.int(x, l));
      if (!n.length || n.length > 3) throw new PyErr('TypeError', 'range() 需要 1~3 個參數', l);
      const [start, stop, step] = n.length === 1 ? [0, n[0], 1] : [n[0], n[1], n[2] ?? 1];
      if (step === 0) throw new PyErr('ValueError', 'range() 的 step 不能是 0', l);
      return new PyRange(start, stop, step);
    });
    bi('len', (a, _kw, l) => {
      const x = a[0];
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (x instanceof PyTuple) return x.items.length;
      if (x instanceof PyDict) return x.m.size;
      if (x instanceof PyRange) return rangeLen(x);
      throw new PyErr('TypeError', `${typeName(x)} 沒有 len()`, l);
    });
    bi('int', (a, kw, l) => {
      const x = a[0] ?? 0;
      if (typeof x === 'string') {
        const base = a[1] !== undefined ? toNum(a[1]) : kw.base !== undefined ? toNum(kw.base) : 10;
        const v = parseInt(x.trim(), base);
        if (isNaN(v)) throw new PyErr('ValueError', `int() 無法轉換 ${repr(x)}`, l);
        return v;
      }
      return Math.trunc(this.num(x, l));
    });
    bi('float', (a, _kw, l) => {
      const x = a[0] ?? 0;
      if (typeof x === 'string') { const v = parseFloat(x); if (isNaN(v)) throw new PyErr('ValueError', `float() 無法轉換 ${repr(x)}`, l); return mkFloat(v); }
      return mkFloat(this.num(x, l));
    });
    bi('str', (a) => (a.length ? str(a[0]) : ''));
    bi('repr', (a) => repr(a[0]));
    bi('bool', (a) => (a.length ? truthy(a[0]) : false));
    bi('abs', (a, _kw, l) => { const x = a[0]; const v = Math.abs(this.num(x, l)); return isFloat(x) ? mkFloat(v) : v; });
    bi('round', (a, _kw, l) => {
      const v = this.num(a[0], l);
      if (a[1] === undefined || a[1] === null) { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 ? r - 1 : r; }
      const p = 10 ** this.int(a[1], l);
      return mkFloat(Math.round(v * p) / p);
    });
    const minmax = (isMax: boolean) => (a: PyVal[], _kw: Record<string, PyVal>, l: number) => {
      const xs = a.length === 1 ? this.toList(a[0], l) : a;
      if (!xs.length) throw new PyErr('ValueError', `${isMax ? 'max' : 'min'}() 的參數是空的`, l);
      return xs.reduce((m, x) => (this.compare(isMax ? '>' : '<', x, m, l) ? x : m));
    };
    bi('max', minmax(true));
    bi('min', minmax(false));
    bi('sum', (a, _kw, l) => this.toList(a[0], l).reduce<PyVal>((s, x) => this.arith('+', s, x, l), a[1] ?? 0));
    bi('list', (a, _kw, l) => (a.length ? [...this.toList(a[0], l)] : []));
    bi('tuple', (a, _kw, l) => new PyTuple(a.length ? [...this.toList(a[0], l)] : []));
    bi('sorted', (a, kw, l) => {
      const xs = [...this.toList(a[0], l)].sort((x, y) => (this.compare('<', x, y, l) ? -1 : this.compare('>', x, y, l) ? 1 : 0));
      return truthy(kw.reverse ?? false) ? xs.reverse() : xs;
    });
    bi('enumerate', (a, kw, l) => this.toList(a[0], l).map((x, i) => new PyTuple([i + (a[1] !== undefined ? this.int(a[1], l) : kw.start !== undefined ? this.int(kw.start, l) : 0), x])));
    bi('zip', (a, _kw, l) => {
      const ls = a.map((x) => this.toList(x, l));
      const n = Math.min(...ls.map((x) => x.length));
      return Array.from({ length: n }, (_, i) => new PyTuple(ls.map((x) => x[i])));
    });
    bi('isinstance', (a) => {
      const t = a[1] as PyObj | Builtin;
      const name = t && typeof t === 'object' && 'name' in t ? t.name : '';
      return typeName(a[0]) === name || (name === 'int' && typeName(a[0]) === 'bool');
    });
    bi('hex', (a, _kw, l) => (this.int(a[0], l) < 0 ? '-0x' + (-this.int(a[0], l)).toString(16) : '0x' + this.int(a[0], l).toString(16)));
    bi('bin', (a, _kw, l) => '0b' + this.int(a[0], l).toString(2));
    bi('chr', (a, _kw, l) => String.fromCharCode(this.int(a[0], l)));
    bi('ord', (a, _kw, l) => { const s = a[0]; if (typeof s !== 'string' || s.length !== 1) throw new PyErr('TypeError', 'ord() 需要單一字元', l); return s.charCodeAt(0); });
    bi('input', (_a, _kw, l) => { throw new PyErr('RuntimeError', '模擬環境沒有鍵盤輸入，input() 無法使用', l); });
    bi('type', (a) => ({ kind: 'obj', cls: 'type', attrs: { __name__: typeName(a[0]) } }));
    for (const e of ['Exception', 'ValueError', 'TypeError', 'KeyboardInterrupt', 'RuntimeError', 'ZeroDivisionError', 'IndexError', 'KeyError', 'OSError']) {
      this.builtins.set(e, B(e, function* (a) { return { kind: 'obj', cls: e, attrs: { msg: a.length ? str(a[0]) : '' } } as PyObj; }));
    }

    // ---- MicroPython 模組 ----
    const obj = (cls: string, attrs: Record<string, PyVal>, call?: Builtin): PyObj => ({ kind: 'obj', cls, attrs, call });
    const method = (name: string, fn: Builtin['fn']) => B(name, fn);
    const timeMod = () => obj('module', {
      sleep: method('sleep', function* (a, _kw, l) { yield Math.max(0, self.num(a[0], l)) * 1000; return null; }),
      sleep_ms: method('sleep_ms', function* (a, _kw, l) { yield Math.max(0, self.num(a[0], l)); return null; }),
      sleep_us: method('sleep_us', function* (a, _kw, l) { yield Math.max(0, self.num(a[0], l)) / 1000; return null; }),
      ticks_ms: method('ticks_ms', function* () { return Math.floor(hal.millis()); }),
      ticks_us: method('ticks_us', function* () { return Math.floor(hal.millis() * 1000); }),
      ticks_diff: method('ticks_diff', function* (a, _kw, l) { return self.int(a[0], l) - self.int(a[1], l); }),
      ticks_add: method('ticks_add', function* (a, _kw, l) { return self.int(a[0], l) + self.int(a[1], l); }),
      time: method('time', function* () { return mkFloat(hal.millis() / 1000); }),
      monotonic: method('monotonic', function* () { return mkFloat(hal.millis() / 1000); }),
      time_ns: method('time_ns', function* () { return Math.floor(hal.millis() * 1e6); }),
    });
    const pinObj = (id: number, line: number): PyObj => {
      const p = obj('Pin', { id });
      const setMode = (mode: number, pull: number, l: number) => {
        const m = mode === MODE.OUTPUT ? MODE.OUTPUT : pull === MODE.INPUT_PULLUP ? MODE.INPUT_PULLUP : pull === MODE.INPUT_PULLDOWN ? MODE.INPUT_PULLDOWN : MODE.INPUT;
        p.attrs.__mode = m;
        hal.pinMode(id, m, l);
      };
      const write = (v: PyVal, l: number) => {
        if (p.attrs.__mode !== MODE.OUTPUT) throw new PyErr('OSError', `GPIO${id} 不是輸出模式，請用 Pin(${id}, Pin.OUT)`, l);
        p.attrs.__level = truthy(v) ? 1 : 0;
        hal.digitalWrite(id, truthy(v) ? 1 : 0, l);
      };
      const value = function* (a: PyVal[], _kw: Record<string, PyVal>, l: number): Gen<PyVal> {
        if (a.length) { write(a[0], l); return null; }
        return p.attrs.__mode === MODE.OUTPUT ? (p.attrs.__level as number) ?? 0 : hal.digitalRead(id, l);
      };
      Object.assign(p.attrs, {
        value: method('value', value),
        on: method('on', function* (_a, _kw, l) { write(1, l); return null; }),
        off: method('off', function* (_a, _kw, l) { write(0, l); return null; }),
        high: method('high', function* (_a, _kw, l) { write(1, l); return null; }),
        low: method('low', function* (_a, _kw, l) { write(0, l); return null; }),
        toggle: method('toggle', function* (_a, _kw, l) { write((p.attrs.__level as number) ? 0 : 1, l); return null; }),
        init: method('init', function* (a, kw, l) {
          setMode(self.int(a[0] ?? kw.mode ?? MODE.INPUT, l), self.int(a[1] ?? kw.pull ?? -1, l), l);
          if (kw.value !== undefined && kw.value !== null) write(kw.value, l);
          return null;
        }),
      });
      p.call = method('Pin', value);
      p.attrs.__setMode = method('_', function* (a, _kw, l) { setMode(self.int(a[0], l), self.int(a[1], l), l); return null; });
      void line;
      return p;
    };
    const PinCls = obj('class', { IN: MODE.INPUT, OUT: MODE.OUTPUT, PULL_UP: MODE.INPUT_PULLUP, PULL_DOWN: MODE.INPUT_PULLDOWN, OPEN_DRAIN: 4, IRQ_RISING: 1, IRQ_FALLING: 2 },
      method('Pin', function* (a, kw, l) {
        if (a[0] === undefined) throw new PyErr('TypeError', 'Pin() 需要腳位編號（BCM GPIO 編號）', l);
        const id = self.int(a[0], l);
        const p = pinObj(id, l);
        const mode = a[1] ?? kw.mode;
        if (mode !== undefined && mode !== null) {
          if (self.int(mode, l) === 4) throw new PyErr('ValueError', '模擬不支援 OPEN_DRAIN', l);
          yield* (p.attrs.__setMode as Builtin).fn([mode, a[2] ?? kw.pull ?? -1], {}, l);
          const v = a[3] ?? kw.value;
          if (v !== undefined && v !== null) yield* (p.attrs.value as Builtin).fn([v], {}, l);
        }
        return p;
      }));
    const PwmCls = obj('class', {}, method('PWM', function* (a, kw, l) {
      const pin = a[0] as PyObj;
      if (!pin || pin.kind !== 'obj' || pin.cls !== 'Pin') throw new PyErr('TypeError', 'PWM() 的第一個參數要是 Pin 物件，例如 PWM(Pin(18))', l);
      const id = pin.attrs.id as number;
      let duty = 0, freq = 1000;
      const apply = () => hal.analogWrite(id, duty, l);
      hal.pinMode(id, MODE.OUTPUT, l);
      const pwm = obj('PWM', {
        freq: method('freq', function* (b) { if (b.length) { freq = self.num(b[0], l); return null; } return freq; }),
        duty_u16: method('duty_u16', function* (b) { if (b.length) { duty = Math.max(0, Math.min(65535, self.num(b[0], l))) / 65535; apply(); return null; } return Math.round(duty * 65535); }),
        duty: method('duty', function* (b) { if (b.length) { duty = Math.max(0, Math.min(1023, self.num(b[0], l))) / 1023; apply(); return null; } return Math.round(duty * 1023); }),
        duty_ns: method('duty_ns', function* (b) { if (b.length) { duty = Math.max(0, Math.min(1, self.num(b[0], l) * freq / 1e9)); apply(); return null; } return Math.round(duty * 1e9 / freq); }),
        deinit: method('deinit', function* () { duty = 0; apply(); return null; }),
      });
      if (kw.freq !== undefined) freq = self.num(kw.freq, l);
      if (kw.duty_u16 !== undefined) duty = Math.max(0, Math.min(65535, self.num(kw.duty_u16, l))) / 65535;
      if (kw.duty !== undefined) duty = Math.max(0, Math.min(1023, self.num(kw.duty, l))) / 1023;
      apply();
      return pwm;
    }));
    const noAdc = method('ADC', function* (a, _kw, l) {
      hal.analogRead(a[0] instanceof Object && (a[0] as PyObj).kind === 'obj' ? ((a[0] as PyObj).attrs.id as number) : self.int(a[0] ?? 0, l), l);
      return null;
    });
    const mathMod = () => obj('module', {
      pi: Math.PI, e: Math.E, inf: Infinity,
      ...Object.fromEntries((['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log10', 'log2', 'fabs'] as const).map((f) => [f,
        method(f, function* (a, _kw, l) { return mkFloat(Math[f === 'fabs' ? 'abs' : f](self.num(a[0], l))); })])),
      log: method('log', function* (a, _kw, l) { const v = Math.log(self.num(a[0], l)); return mkFloat(a[1] !== undefined ? v / Math.log(self.num(a[1], l)) : v); }),
      pow: method('pow', function* (a, _kw, l) { return mkFloat(self.num(a[0], l) ** self.num(a[1], l)); }),
      atan2: method('atan2', function* (a, _kw, l) { return mkFloat(Math.atan2(self.num(a[0], l), self.num(a[1], l))); }),
      floor: method('floor', function* (a, _kw, l) { return Math.floor(self.num(a[0], l)); }),
      ceil: method('ceil', function* (a, _kw, l) { return Math.ceil(self.num(a[0], l)); }),
      degrees: method('degrees', function* (a, _kw, l) { return mkFloat(self.num(a[0], l) * 180 / Math.PI); }),
      radians: method('radians', function* (a, _kw, l) { return mkFloat(self.num(a[0], l) * Math.PI / 180); }),
    });
    const rnd = () => { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x80000000; };
    const randMod = () => obj('module', {
      random: method('random', function* () { return mkFloat(rnd()); }),
      randint: method('randint', function* (a, _kw, l) { const lo = self.int(a[0], l), hi = self.int(a[1], l); return lo + Math.floor(rnd() * (hi - lo + 1)); }),
      randrange: method('randrange', function* (a, _kw, l) { const [lo, hi] = a.length > 1 ? [self.int(a[0], l), self.int(a[1], l)] : [0, self.int(a[0], l)]; return lo + Math.floor(rnd() * (hi - lo)); }),
      uniform: method('uniform', function* (a, _kw, l) { const lo = self.num(a[0], l), hi = self.num(a[1], l); return mkFloat(lo + rnd() * (hi - lo)); }),
      choice: method('choice', function* (a, _kw, l) { const xs = self.toList(a[0], l); if (!xs.length) throw new PyErr('IndexError', 'choice() 的序列是空的', l); return xs[Math.floor(rnd() * xs.length)]; }),
      getrandbits: method('getrandbits', function* (a, _kw, l) { return Math.floor(rnd() * 2 ** Math.min(31, self.int(a[0], l))); }),
      seed: method('seed', function* (a, _kw, l) { self.seed = a.length ? self.int(a[0], l) : 12345; return null; }),
    });
    this.modules = {
      machine: () => obj('module', {
        Pin: PinCls, PWM: PwmCls, ADC: noAdc,
        freq: method('freq', function* () { return 2_400_000_000; }),
        reset: method('reset', function* (_a, _kw, l) { throw new PyErr('SystemExit', 'machine.reset()：請按「重新開機」', l); }),
        unique_id: method('unique_id', function* () { return 'RP5-SIM'; }),
      }),
      time: timeMod, utime: timeMod,
      math: mathMod, random: randMod, urandom: randMod,
      sys: () => obj('module', {
        exit: method('exit', function* (_a, _kw, l) { throw new PyErr('SystemExit', '', l); }),
        platform: 'rp5-sim', implementation: obj('module', { name: 'micropython' }),
      }),
      gc: () => obj('module', {
        collect: method('collect', function* () { return null; }),
        mem_free: method('mem_free', function* () { return 4 * 1024 * 1024; }),
      }),
    };
  }

  // ---- 小工具 ----
  private num(x: PyVal, line: number): number {
    if (isNum(x)) return toNum(x);
    throw new PyErr('TypeError', `需要數字，但拿到 ${typeName(x)}（${repr(x)}）`, line);
  }
  private int(x: PyVal, line: number): number {
    const v = this.num(x, line);
    if (!Number.isInteger(v)) throw new PyErr('TypeError', `需要整數，但拿到 ${str(x)}`, line);
    return v;
  }
  private toList(x: PyVal, line: number): PyVal[] {
    if (Array.isArray(x)) return x;
    if (x instanceof PyTuple) return x.items;
    if (typeof x === 'string') return [...x];
    if (x instanceof PyRange) { const n = rangeLen(x); if (n > 1e6) throw new PyErr('MemoryError', 'range 太大', line); return Array.from({ length: n }, (_, i) => x.start + i * x.step); }
    if (x instanceof PyDict) return [...x.m.values()].map(([k]) => k);
    throw new PyErr('TypeError', `${typeName(x)} 不能迭代`, line);
  }

  private lookup(name: string, sc: Scope, line: number): PyVal {
    for (let s: Scope | null = sc; s; s = s.parent) {
      if (s.globals.has(name)) return this.lookup(name, this.g, line);
      if (s.vars.has(name)) return s.vars.get(name)!;
    }
    if (this.builtins.has(name)) return this.builtins.get(name)!;
    throw new PyErr('NameError', `「${name}」沒有定義${this.modules[name] ? `（要先 import ${name}）` : ''}`, line);
  }
  private setVar(name: string, v: PyVal, sc: Scope) {
    (sc.globals.has(name) ? this.g : sc).vars.set(name, v);
  }

  // ---- 執行 ----
  *run(): Gen<void> {
    try {
      yield* this.block(this.prog, this.g);
    } catch (e) {
      if (e instanceof PyErr && e.type === 'SystemExit') return;
      throw e;
    }
  }

  private *block(stmts: PyStmt[], sc: Scope): Gen<Flow | undefined> {
    for (const s of stmts) {
      const r = yield* this.exec(s, sc);
      if (r) return r;
    }
    return undefined;
  }

  private *exec(s: PyStmt, sc: Scope): Gen<Flow | undefined> {
    if (++this.ops % 3000 === 0) yield 0;
    switch (s.k) {
      case 'expr': yield* this.ev(s.e, sc); return;
      case 'assign': {
        const v = yield* this.ev(s.v, sc);
        for (const t of s.targets) yield* this.assign(t, v, sc);
        return;
      }
      case 'aug': {
        const cur = yield* this.ev(s.target, sc);
        const rhs = yield* this.ev(s.v, sc);
        let v: PyVal;
        if (s.op === '+' && Array.isArray(cur)) { cur.push(...this.toList(rhs, s.line)); v = cur; }
        else v = this.arith(s.op, cur, rhs, s.line);
        yield* this.assign(s.target, v, sc);
        return;
      }
      case 'if': return (truthy(yield* this.ev(s.c, sc))) ? yield* this.block(s.body, sc) : yield* this.block(s.orelse, sc);
      case 'while':
        while (truthy(yield* this.ev(s.c, sc))) {
          const r = yield* this.block(s.body, sc);
          if (r?.f === 'break') break;
          if (r?.f === 'return') return r;
          if (++this.ops % 3000 === 0) yield 0;
        }
        return;
      case 'for': {
        const it = yield* this.ev(s.iter, sc);
        if (it instanceof PyRange) {
          for (let i = it.start; it.step > 0 ? i < it.stop : i > it.stop; i += it.step) {
            yield* this.assign(s.target, i, sc);
            const r = yield* this.block(s.body, sc);
            if (r?.f === 'break') break;
            if (r?.f === 'return') return r;
            if (++this.ops % 3000 === 0) yield 0;
          }
          return;
        }
        for (const x of [...this.toList(it, s.line)]) {
          yield* this.assign(s.target, x, sc);
          const r = yield* this.block(s.body, sc);
          if (r?.f === 'break') break;
          if (r?.f === 'return') return r;
          if (++this.ops % 3000 === 0) yield 0;
        }
        return;
      }
      case 'def': {
        const params: PyFunc['params'] = [];
        for (const p of s.params) params.push({ name: p.name, dflt: p.dflt ? yield* this.ev(p.dflt, sc) : undefined });
        this.setVar(s.name, { kind: 'func', name: s.name, params, body: s.body, closure: sc }, sc);
        return;
      }
      case 'return': return new Flow('return', s.e ? yield* this.ev(s.e, sc) : null);
      case 'break': return new Flow('break');
      case 'continue': return new Flow('continue');
      case 'pass': return;
      case 'global': s.names.forEach((n) => sc.globals.add(n)); return;
      case 'import':
        for (const n of s.names) this.setVar(n.as, this.module(n.mod, s.line), sc);
        return;
      case 'from': {
        const m = this.module(s.mod, s.line);
        for (const n of s.names) {
          if (n.name === '*') { for (const [k, v] of Object.entries(m.attrs)) this.setVar(k, v, sc); continue; }
          if (!(n.name in m.attrs)) throw new PyErr('ImportError', `${s.mod} 裡沒有 ${n.name}`, s.line);
          this.setVar(n.as, m.attrs[n.name], sc);
        }
        return;
      }
      case 'raise': {
        const e = s.e ? yield* this.ev(s.e, sc) : null;
        if (e && typeof e === 'object' && 'kind' in e) {
          if (e.kind === 'obj') throw new PyErr(e.cls, str(e.attrs.msg ?? ''), s.line);
          if (e.kind === 'builtin') throw new PyErr(e.name, '', s.line);
        }
        throw new PyErr('RuntimeError', e === null ? '重新拋出例外' : str(e), s.line);
      }
      case 'try': {
        let r: Flow | undefined;
        try {
          r = yield* this.block(s.body, sc);
        } catch (e) {
          if (!(e instanceof PyErr) || e.type === 'SystemExit') throw e;
          const h = s.handlers.find((x) => !x.type || x.type === 'Exception' || x.type === 'BaseException' || x.type === e.type);
          if (!h) throw e;
          if (h.as) this.setVar(h.as, { kind: 'obj', cls: e.type, attrs: { msg: e.raw } }, sc);
          r = yield* this.block(h.body, sc);
        } finally {
          if (s.fin.length) { const f = yield* this.block(s.fin, sc); if (f) r = f; }
        }
        return r;
      }
    }
  }

  private module(name: string, line: number): PyObj {
    const m = this.modules[name];
    if (!m) {
      const hint = name === 'RPi' || name === 'RPi.GPIO' || name === 'gpiozero' || name === 'lgpio'
        ? '（這個模擬器的 Pi 5 使用 MicroPython 的 machine 模組：from machine import Pin）' : '';
      throw new PyErr('ImportError', `沒有 ${name} 模組${hint}；支援 machine、time / utime、math、random、sys、gc`, line);
    }
    return m();
  }

  private *assign(t: PyExpr, v: PyVal, sc: Scope): Gen<void> {
    if (t.k === 'name') { this.setVar(t.id, v, sc); return; }
    if (t.k === 'tuple' || t.k === 'list') {
      const xs = this.toList(v, t.line);
      if (xs.length !== t.items.length) throw new PyErr('ValueError', `解包數量不符：左邊 ${t.items.length} 個、右邊 ${xs.length} 個`, t.line);
      for (let i = 0; i < xs.length; i++) yield* this.assign(t.items[i], xs[i], sc);
      return;
    }
    if (t.k === 'sub') {
      const o = yield* this.ev(t.obj, sc);
      const idx = yield* this.ev(t.idx, sc);
      if (Array.isArray(o)) { o[this.index(o.length, idx, t.line)] = v; return; }
      if (o instanceof PyDict) { o.m.set(keyOf(idx), [idx, v]); return; }
      throw new PyErr('TypeError', `${typeName(o)} 不能用 [ ] 指定值`, t.line);
    }
    if (t.k === 'attr') throw new PyErr('AttributeError', '不能指定物件的屬性', t.line);
  }
  private index(len: number, idx: PyVal, line: number): number {
    let i = this.int(idx, line);
    if (i < 0) i += len;
    if (i < 0 || i >= len) throw new PyErr('IndexError', `索引 ${str(idx)} 超出範圍（長度 ${len}）`, line);
    return i;
  }

  private arith(op: string, a: PyVal, b: PyVal, line: number): PyVal {
    if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
    if (op === '+' && Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
      throw new PyErr('TypeError', `字串不能直接跟 ${typeName(typeof a === 'string' ? b : a)} 相加，請用 str() 或 f-string`, line);
    }
    if (op === '*' && (typeof a === 'string' || Array.isArray(a)) && isNum(b)) return this.repeat(a, toNum(b));
    if (op === '*' && (typeof b === 'string' || Array.isArray(b)) && isNum(a)) return this.repeat(b, toNum(a));
    if (op === '%' && typeof a === 'string') return this.percent(a, b instanceof PyTuple ? b.items : [b], line);
    if (!isNum(a) || !isNum(b)) throw new PyErr('TypeError', `${typeName(a)} 和 ${typeName(b)} 不能做 ${op} 運算`, line);
    const x = toNum(a), y = toNum(b);
    const f = isFloat(a) || isFloat(b);
    const out = (v: number) => (f ? mkFloat(v) : v);
    switch (op) {
      case '+': return out(x + y);
      case '-': return out(x - y);
      case '*': return out(x * y);
      case '/': if (y === 0) throw new PyErr('ZeroDivisionError', '除以 0', line); return mkFloat(x / y);
      case '//': if (y === 0) throw new PyErr('ZeroDivisionError', '除以 0', line); return out(Math.floor(x / y));
      case '%': if (y === 0) throw new PyErr('ZeroDivisionError', '對 0 取餘數', line); return out(((x % y) + y) % y);
      case '**': return !f && y >= 0 ? x ** y : mkFloat(x ** y);
      case '&': return this.int(a, line) & this.int(b, line);
      case '|': return this.int(a, line) | this.int(b, line);
      case '^': return this.int(a, line) ^ this.int(b, line);
      case '<<': return this.int(a, line) * 2 ** this.int(b, line);
      case '>>': return Math.floor(this.int(a, line) / 2 ** this.int(b, line));
    }
    throw new PyErr('TypeError', `不支援的運算子 ${op}`, line);
  }
  private repeat(x: string | PyVal[], n: number): PyVal {
    const k = Math.max(0, Math.floor(n));
    return typeof x === 'string' ? x.repeat(k) : Array.from({ length: k }, () => x).flat();
  }
  private percent(fmt: string, args: PyVal[], line: number): string {
    let i = 0;
    return fmt.replace(/%([-+0 ]*)(\d*)(?:\.(\d+))?([sdifxXr%])/g, (_m, flags: string, w: string, p: string, t: string) => {
      if (t === '%') return '%';
      const a = args[i++];
      if (a === undefined) throw new PyErr('TypeError', '% 格式的參數不夠', line);
      const spec = `${flags.includes('-') ? '<' : ''}${flags.includes('0') ? '0' : ''}${w}${p ? '.' + p : ''}${t === 's' || t === 'r' ? '' : t === 'i' ? 'd' : t}`;
      return format(t === 'r' ? repr(a) : a, spec);
    });
  }
  private compare(op: string, a: PyVal, b: PyVal, line: number): boolean {
    switch (op) {
      case '==': return this.eq(a, b);
      case '!=': return !this.eq(a, b);
      case 'is': return a === b || (a === null && b === null);
      case 'is not': return !(a === b || (a === null && b === null));
      case 'in': case 'not in': {
        let r: boolean;
        if (typeof b === 'string') r = typeof a === 'string' && b.includes(a);
        else if (b instanceof PyDict) r = b.m.has(keyOf(a));
        else r = this.toList(b, line).some((x) => this.eq(x, a));
        return op === 'in' ? r : !r;
      }
    }
    if (typeof a === 'string' && typeof b === 'string') return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    if (!isNum(a) || !isNum(b)) throw new PyErr('TypeError', `${typeName(a)} 和 ${typeName(b)} 不能比大小`, line);
    const x = toNum(a), y = toNum(b);
    return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
  }
  private eq(a: PyVal, b: PyVal): boolean {
    if (isNum(a) && isNum(b)) return toNum(a) === toNum(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => this.eq(x, b[i]));
    if (a instanceof PyTuple && b instanceof PyTuple) return a.items.length === b.items.length && a.items.every((x, i) => this.eq(x, b.items[i]));
    return a === b;
  }

  private *ev(e: PyExpr, sc: Scope): Gen<PyVal> {
    switch (e.k) {
      case 'num': return e.float ? mkFloat(e.v) : e.v;
      case 'str': return e.v;
      case 'const': return e.v;
      case 'fstr': {
        let out = '';
        for (const p of e.parts as FPart[]) {
          if (typeof p === 'string') { out += p; continue; }
          const v = yield* this.ev(p.e, sc);
          out += p.conv === 'r' ? repr(v) : format(v, p.spec);
        }
        return out;
      }
      case 'name': return this.lookup(e.id, sc, e.line);
      case 'list': { const xs: PyVal[] = []; for (const x of e.items) xs.push(yield* this.ev(x, sc)); return xs; }
      case 'tuple': { const xs: PyVal[] = []; for (const x of e.items) xs.push(yield* this.ev(x, sc)); return new PyTuple(xs); }
      case 'dict': {
        const d = new PyDict();
        for (let i = 0; i < e.keys.length; i++) { const k = yield* this.ev(e.keys[i], sc); d.m.set(keyOf(k), [k, yield* this.ev(e.vals[i], sc)]); }
        return d;
      }
      case 'comp': {
        const inner = new Scope(sc, sc.isFunc);
        const out: PyVal[] = [];
        for (const x of [...this.toList(yield* this.ev(e.iter, sc), e.line)]) {
          yield* this.assign(e.target, x, inner);
          if (e.cond && !truthy(yield* this.ev(e.cond, inner))) continue;
          out.push(yield* this.ev(e.e, inner));
        }
        return out;
      }
      case 'attr': return this.getAttr(yield* this.ev(e.obj, sc), e.name, e.line);
      case 'sub': {
        const o = yield* this.ev(e.obj, sc);
        if (e.idx.k === 'slice') {
          const lo = e.idx.lo ? yield* this.ev(e.idx.lo, sc) : null;
          const hi = e.idx.hi ? yield* this.ev(e.idx.hi, sc) : null;
          const st = e.idx.step ? yield* this.ev(e.idx.step, sc) : null;
          return this.slice(o, lo, hi, st, e.line);
        }
        const idx = yield* this.ev(e.idx, sc);
        if (typeof o === 'string') return o[this.index(o.length, idx, e.line)];
        if (Array.isArray(o)) return o[this.index(o.length, idx, e.line)];
        if (o instanceof PyTuple) return o.items[this.index(o.items.length, idx, e.line)];
        if (o instanceof PyRange) return o.start + this.index(rangeLen(o), idx, e.line) * o.step;
        if (o instanceof PyDict) {
          const hit = o.m.get(keyOf(idx));
          if (!hit) throw new PyErr('KeyError', repr(idx), e.line);
          return hit[1];
        }
        throw new PyErr('TypeError', `${typeName(o)} 不能用 [ ] 取值`, e.line);
      }
      case 'slice': throw new PyErr('SyntaxError', '切片只能放在 [ ] 裡', e.line);
      case 'un': {
        const v = yield* this.ev(e.a, sc);
        if (e.op === 'not') return !truthy(v);
        if (e.op === '-') { const n = this.num(v, e.line); return isFloat(v) ? mkFloat(-n) : -n; }
        if (e.op === '+') return isFloat(v) ? v : this.num(v, e.line);
        return ~this.int(v, e.line);
      }
      case 'bool': {
        const a = yield* this.ev(e.a, sc);
        if (e.op === 'and' ? !truthy(a) : truthy(a)) return a;
        return yield* this.ev(e.b, sc);
      }
      case 'cmp': {
        let left = yield* this.ev(e.first, sc);
        for (let i = 0; i < e.ops.length; i++) {
          const right = yield* this.ev(e.rest[i], sc);
          if (!this.compare(e.ops[i], left, right, e.line)) return false;
          left = right;
        }
        return true;
      }
      case 'ifexp': return truthy(yield* this.ev(e.c, sc)) ? yield* this.ev(e.a, sc) : yield* this.ev(e.b, sc);
      case 'bin': return this.arith(e.op, yield* this.ev(e.a, sc), yield* this.ev(e.b, sc), e.line);
      case 'call': {
        const fn = yield* this.ev(e.fn, sc);
        const args: PyVal[] = [];
        for (const a of e.args) args.push(yield* this.ev(a, sc));
        const kw: Record<string, PyVal> = {};
        for (const [k, v] of e.kw) kw[k] = yield* this.ev(v, sc);
        return yield* this.call(fn, args, kw, e.line);
      }
    }
  }

  private *call(fn: PyVal, args: PyVal[], kw: Record<string, PyVal>, line: number): Gen<PyVal> {
    if (fn && typeof fn === 'object' && 'kind' in fn) {
      if (fn.kind === 'builtin') return yield* fn.fn(args, kw, line);
      if (fn.kind === 'obj' && fn.call) return yield* fn.call.fn(args, kw, line);
      if (fn.kind === 'func') {
        if (++this.depth > 150) throw new PyErr('RecursionError', '遞迴太深（超過 150 層）', line);
        const local = new Scope(fn.closure, true);
        fn.params.forEach((p, i) => {
          const v = i < args.length ? args[i] : p.name in kw ? kw[p.name] : p.dflt;
          if (v === undefined) throw new PyErr('TypeError', `${fn.name}() 少了參數 ${p.name}`, line);
          local.vars.set(p.name, v);
        });
        if (args.length > fn.params.length) throw new PyErr('TypeError', `${fn.name}() 最多 ${fn.params.length} 個參數，但給了 ${args.length} 個`, line);
        // Python 規則：函式裡有指定值的變數是區域變數（這裡在第一次指定時建立）
        try {
          const r = yield* this.block(fn.body, local);
          return r?.f === 'return' ? r.v : null;
        } finally { this.depth--; }
      }
    }
    throw new PyErr('TypeError', `${typeName(fn)} 不能被呼叫`, line);
  }

  private slice(o: PyVal, lo: PyVal, hi: PyVal, st: PyVal, line: number): PyVal {
    const xs = typeof o === 'string' ? [...o] : this.toList(o, line);
    const n = xs.length;
    const step = st === null ? 1 : this.int(st, line);
    if (step === 0) throw new PyErr('ValueError', '切片的 step 不能是 0', line);
    const norm = (v: PyVal, d: number) => { if (v === null) return d; let i = this.int(v, line); if (i < 0) i += n; return Math.max(step > 0 ? 0 : -1, Math.min(step > 0 ? n : n - 1, i)); };
    const a = norm(lo, step > 0 ? 0 : n - 1), b = norm(hi, step > 0 ? n : -1);
    const out: PyVal[] = [];
    for (let i = a; step > 0 ? i < b : i > b; i += step) out.push(xs[i]);
    return typeof o === 'string' ? out.join('') : o instanceof PyTuple ? new PyTuple(out) : out;
  }

  private getAttr(o: PyVal, name: string, line: number): PyVal {
    const B = (fn: Builtin['fn']): Builtin => ({ kind: 'builtin', name, fn });
    const simple = (f: (a: PyVal[], kw: Record<string, PyVal>) => PyVal) => B(function* (a, kw) { return f(a, kw); });
    if (o && typeof o === 'object' && 'kind' in o && o.kind === 'obj') {
      if (name in o.attrs && !name.startsWith('__')) return o.attrs[name];
      if (name === 'args' && 'msg' in o.attrs) return new PyTuple([o.attrs.msg]);
      throw new PyErr('AttributeError', `${o.cls === 'module' ? '模組' : o.cls} 沒有「${name}」`, line);
    }
    if (typeof o === 'string') {
      const m: Record<string, (a: PyVal[], kw: Record<string, PyVal>) => PyVal> = {
        upper: () => o.toUpperCase(), lower: () => o.toLowerCase(),
        strip: (a) => (a[0] ? o.replace(new RegExp(`^[${String(a[0]).replace(/[\]\\^-]/g, '\\$&')}]+|[${String(a[0]).replace(/[\]\\^-]/g, '\\$&')}]+$`, 'g'), '') : o.trim()),
        lstrip: () => o.trimStart(), rstrip: () => o.trimEnd(),
        split: (a) => (a[0] === undefined || a[0] === null ? o.trim().split(/\s+/).filter(Boolean) : o.split(str(a[0]))),
        join: (a) => this.toList(a[0], line).map((x) => { if (typeof x !== 'string') throw new PyErr('TypeError', 'join() 的內容必須都是字串', line); return x; }).join(o),
        replace: (a) => o.split(str(a[0])).join(str(a[1])),
        startswith: (a) => o.startsWith(str(a[0])), endswith: (a) => o.endsWith(str(a[0])),
        find: (a) => o.indexOf(str(a[0])), count: (a) => o.split(str(a[0])).length - 1,
        isdigit: () => /^\d+$/.test(o), zfill: (a) => o.padStart(this.int(a[0], line), '0'),
        format: (a, kw) => {
          let auto = 0;
          return o.replace(/\{\{|\}\}|\{([^{}:!]*)(?::([^{}]*))?\}/g, (m0, key: string, spec: string) => {
            if (m0 === '{{') return '{';
            if (m0 === '}}') return '}';
            const v = key === '' ? a[auto++] : /^\d+$/.test(key) ? a[+key] : kw[key];
            if (v === undefined) throw new PyErr('IndexError', `format() 找不到 {${key}}`, line);
            return format(v, spec ?? '');
          });
        },
      };
      if (m[name]) return simple(m[name]);
    }
    if (Array.isArray(o)) {
      const m: Record<string, (a: PyVal[]) => PyVal> = {
        append: (a) => { o.push(a[0]); return null; },
        extend: (a) => { o.push(...this.toList(a[0], line)); return null; },
        insert: (a) => { o.splice(this.int(a[0], line), 0, a[1]); return null; },
        pop: (a) => { if (!o.length) throw new PyErr('IndexError', 'pop() 空的 list', line); return a.length ? o.splice(this.index(o.length, a[0], line), 1)[0] : o.pop()!; },
        remove: (a) => { const i = o.findIndex((x) => this.eq(x, a[0])); if (i < 0) throw new PyErr('ValueError', 'remove()：list 裡沒有這個值', line); o.splice(i, 1); return null; },
        index: (a) => { const i = o.findIndex((x) => this.eq(x, a[0])); if (i < 0) throw new PyErr('ValueError', 'index()：list 裡沒有這個值', line); return i; },
        count: (a) => o.filter((x) => this.eq(x, a[0])).length,
        clear: () => { o.length = 0; return null; },
        reverse: () => { o.reverse(); return null; },
        sort: () => { o.sort((x, y) => (this.compare('<', x, y, line) ? -1 : this.compare('>', x, y, line) ? 1 : 0)); return null; },
      };
      if (m[name]) return simple(m[name]);
    }
    if (o instanceof PyDict) {
      const m: Record<string, (a: PyVal[]) => PyVal> = {
        get: (a) => o.m.get(keyOf(a[0]))?.[1] ?? (a[1] ?? null),
        keys: () => [...o.m.values()].map(([k]) => k),
        values: () => [...o.m.values()].map(([, v]) => v),
        items: () => [...o.m.values()].map(([k, v]) => new PyTuple([k, v])),
      };
      if (m[name]) return simple(m[name]);
    }
    throw new PyErr('AttributeError', `${typeName(o)} 沒有「${name}」`, line);
  }
}

export function compilePython(src: string): PyStmt[] {
  return parsePython(src);
}
