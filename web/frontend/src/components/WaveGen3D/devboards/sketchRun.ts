// 草稿碼直譯器：用 generator 執行 AST，delay() 會 yield 讓出時間，不會卡住瀏覽器；每幀有指令數上限避免無窮迴圈當掉
import { parseSketch, SketchError, type Expr, type Stmt, type Program, type FuncDef, type VarDecl } from './sketchLang.js';

export const MODE = { INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN: 3 } as const;

/** 直譯器跟開發板硬體之間的介面（腳位電氣行為由 devStore / 電路求解器實作） */
export interface Hal {
  intBits: 16 | 32;
  consts: Record<string, number>;
  pinMode(pin: number, mode: number, line: number): void;
  digitalWrite(pin: number, v: number, line: number): void;
  digitalRead(pin: number, line: number): number;
  analogWrite(pin: number, duty: number, line: number): void; // duty 0..1
  analogRead(pin: number, line: number): number;
  print(text: string): void;
  millis(): number;
}

type Val = number | string | Val[];
interface Var { type: string; v: Val }
type Flow = { f: 'break' } | { f: 'continue' } | { f: 'return'; v: Val } | undefined;
/** yield 的值：要睡多少毫秒（0 = 只是讓出這一幀） */
type Gen<T> = Generator<number, T, void>;

const FLOAT_FNS = new Set(['sqrt', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'exp', 'log', 'log10', 'fabs', 'floor', 'ceil', 'toFloat', 'radians', 'degrees']);
const DEC = 10, HEX = 16, OCT = 8, BIN = 2;

class Fault extends SketchError {}

export class Interp {
  private globals = new Map<string, Var>();
  private frames: Map<string, Var>[][] = [];
  private depth = 0;
  ops = 0;
  private seed = 1;

  constructor(private prog: Program, private hal: Hal) {}

  // ---- 型別處理 ----
  private isFloatType(t: string) { return /\b(float|double)\b/.test(t); }
  private wrap(type: string, v: Val, line: number): Val {
    if (Array.isArray(v)) return v;
    const t = type.replace('[]', '').trim();
    if (t === 'String') return typeof v === 'string' ? v : this.str(v, false);
    if (typeof v === 'string') {
      if (t === 'char' && v.length === 1) return v.charCodeAt(0);
      throw new Fault(`不能把字串存進 ${t} 變數`, line);
    }
    if (this.isFloatType(t) || t === 'auto') return v;
    if (t === 'bool' || t === 'boolean') return v ? 1 : 0;
    const n = Math.trunc(v);
    const B = this.hal.intBits;
    const bits: Record<string, [number, boolean]> = {
      char: [8, true], int8_t: [8, true], byte: [8, false], uint8_t: [8, false], 'unsigned char': [8, false],
      short: [16, true], int16_t: [16, true], uint16_t: [16, false], word: [16, false], 'unsigned short': [16, false],
      int: [B, true], 'unsigned int': [B, false], unsigned: [B, false],
      long: [32, true], int32_t: [32, true], 'long int': [32, true], 'unsigned long': [32, false], uint32_t: [32, false], size_t: [32, false],
    };
    const [w, signed] = bits[t] ?? [32, true];
    const m = 2 ** w;
    let r = ((n % m) + m) % m;
    if (signed && r >= m / 2) r -= m;
    return r;
  }
  private isFloatExpr(e: Expr): boolean {
    switch (e.k) {
      case 'num': return e.float;
      case 'id': { const v = this.lookup(e.name); return v ? this.isFloatType(v.type) : e.name === 'PI'; }
      case 'call': {
        if (FLOAT_FNS.has(e.name)) return true;
        const f = this.prog.funcs.get(e.name);
        if (f) return this.isFloatType(f.type);
        return ['map', 'constrain', 'min', 'max', 'abs'].includes(e.name) && e.args.some((a) => this.isFloatExpr(a));
      }
      case 'bin': return ['+', '-', '*', '/', '%'].includes(e.op) && (this.isFloatExpr(e.a) || this.isFloatExpr(e.b));
      case 'un': return e.op === '-' || e.op === '+' ? this.isFloatExpr(e.a) : false;
      case 'cast': return this.isFloatType(e.type);
      case 'assign': return this.isFloatExpr(e.target);
      case 'cond': return this.isFloatExpr(e.a) || this.isFloatExpr(e.b);
      case 'index': { const base = e.a.k === 'id' ? this.lookup(e.a.name) : undefined; return !!base && this.isFloatType(base.type); }
      default: return false;
    }
  }

  // ---- 變數 ----
  private lookup(name: string): Var | undefined {
    const fr = this.frames[this.frames.length - 1];
    if (fr) for (let i = fr.length - 1; i >= 0; i--) { const v = fr[i].get(name); if (v) return v; }
    return this.globals.get(name);
  }
  private declare(d: VarDecl, value: Val) {
    const fr = this.frames[this.frames.length - 1];
    const scope = fr ? fr[fr.length - 1] : this.globals;
    scope.set(d.name, { type: d.type, v: value });
  }
  private *initVar(d: VarDecl): Gen<Val> {
    if (d.type.endsWith('[]')) {
      const size = d.size ? Number(yield* this.ev(d.size)) : undefined;
      const items = d.init && d.init.k === 'list' ? d.init.items : [];
      if (d.init && d.init.k === 'str') return [...d.init.v].map((c) => c.charCodeAt(0)).concat(0);
      const n = size ?? items.length;
      if (!(n >= 0) || n > 4096) throw new Fault(`陣列大小 ${n} 不合法（上限 4096）`, d.line);
      const arr: Val[] = new Array(n).fill(0);
      for (let i = 0; i < Math.min(n, items.length); i++) arr[i] = this.wrap(d.type, (yield* this.ev(items[i])) as Val, d.line);
      return arr;
    }
    const v = d.init ? yield* this.ev(d.init) : (d.type === 'String' ? '' : 0);
    return this.wrap(d.type, v, d.line);
  }

  // ---- 執行 ----
  *run(): Gen<void> {
    for (const g of this.prog.globals) this.globals.set(g.name, { type: g.type, v: yield* this.initVar(g) });
    if (this.prog.funcs.has('setup')) {
      yield* this.callUser('setup', [], 0);
      if (!this.prog.funcs.has('loop')) throw new Fault('找不到 loop()', 1);
      for (;;) { yield* this.callUser('loop', [], 0); yield 0; }
    } else {
      yield* this.callUser('main', [], 0);
    }
  }

  private *callUser(name: string, args: Val[], line: number): Gen<Val> {
    const f = this.prog.funcs.get(name) as FuncDef;
    if (++this.depth > 200) throw new Fault('遞迴太深（超過 200 層）', line);
    if (args.length !== f.params.length) throw new Fault(`${name}() 需要 ${f.params.length} 個參數，但給了 ${args.length} 個`, line);
    const scope = new Map<string, Var>();
    f.params.forEach((p, i) => scope.set(p.name, { type: p.type + (p.array ? '[]' : ''), v: p.array ? args[i] : this.wrap(p.type, args[i], line) }));
    this.frames.push([scope]);
    try {
      const r = yield* this.exec(f.body);
      return r && r.f === 'return' ? (f.type === 'void' ? 0 : this.wrap(f.type, r.v, line)) : 0;
    } finally {
      this.frames.pop();
      this.depth--;
    }
  }

  private *exec(s: Stmt): Gen<Flow> {
    if (++this.ops % 4000 === 0) yield 0;
    switch (s.k) {
      case 'block': {
        const fr = this.frames[this.frames.length - 1];
        fr.push(new Map());
        try {
          for (const st of s.body) { const r = yield* this.exec(st); if (r) return r; }
        } finally { fr.pop(); }
        return;
      }
      case 'decl': for (const d of s.vars) this.declare(d, yield* this.initVar(d)); return;
      case 'expr': yield* this.ev(s.e); return;
      case 'if': return (yield* this.truthy(s.c)) ? yield* this.exec(s.a) : s.b ? yield* this.exec(s.b) : undefined;
      case 'while':
        while (yield* this.truthy(s.c)) {
          const r = yield* this.exec(s.body);
          if (r?.f === 'break') break;
          if (r?.f === 'return') return r;
          if (++this.ops % 4000 === 0) yield 0;
        }
        return;
      case 'do':
        do {
          const r = yield* this.exec(s.body);
          if (r?.f === 'break') break;
          if (r?.f === 'return') return r;
          if (++this.ops % 4000 === 0) yield 0;
        } while (yield* this.truthy(s.c));
        return;
      case 'for': {
        const fr = this.frames[this.frames.length - 1];
        fr.push(new Map());
        try {
          if (s.init) yield* this.exec(s.init);
          while (!s.c || (yield* this.truthy(s.c))) {
            const r = yield* this.exec(s.body);
            if (r?.f === 'break') break;
            if (r?.f === 'return') return r;
            if (s.step) yield* this.ev(s.step);
            if (++this.ops % 4000 === 0) yield 0;
          }
        } finally { fr.pop(); }
        return;
      }
      case 'switch': {
        const v = yield* this.ev(s.e);
        let hit = -1;
        for (let i = 0; i < s.cases.length && hit < 0; i++) {
          const c = s.cases[i];
          if (c.v && (yield* this.ev(c.v)) === v) hit = i;
        }
        if (hit < 0) hit = s.cases.findIndex((c) => c.v === null);
        if (hit < 0) return;
        for (let i = hit; i < s.cases.length; i++) {
          for (const st of s.cases[i].body) {
            const r = yield* this.exec(st);
            if (r?.f === 'break') return;
            if (r) return r;
          }
        }
        return;
      }
      case 'return': return { f: 'return', v: s.e ? yield* this.ev(s.e) : 0 };
      case 'break': return { f: 'break' };
      case 'continue': return { f: 'continue' };
    }
  }

  private *truthy(e: Expr): Gen<boolean> {
    const v = yield* this.ev(e);
    return typeof v === 'string' ? v.length > 0 : !!v;
  }
  private num(v: Val, line: number): number {
    if (typeof v === 'number') return v;
    throw new Fault('這裡需要數字，但拿到字串或陣列', line);
  }

  private str(v: Val, float: boolean, digits = 2): string {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[array]';
    return float || !Number.isInteger(v) ? v.toFixed(digits) : String(v);
  }

  private *ev(e: Expr): Gen<Val> {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'list': throw new Fault('大括號 { } 只能用在陣列初始值', e.line);
      case 'id': {
        const v = this.lookup(e.name);
        if (v) return v.v;
        if (e.name in this.hal.consts) return this.hal.consts[e.name];
        const k = CONSTS[e.name];
        if (k !== undefined) return k;
        throw new Fault(`「${e.name}」沒有宣告`, e.line);
      }
      case 'cast': {
        const v = yield* this.ev(e.a);
        return this.isFloatType(e.type) ? this.num(v, e.line) : this.wrap(e.type, v, e.line);
      }
      case 'cond': return (yield* this.truthy(e.c)) ? yield* this.ev(e.a) : yield* this.ev(e.b);
      case 'un': {
        if (e.op === '++' || e.op === '--') {
          const cur = this.num(yield* this.ev(e.a), e.line);
          return yield* this.store(e.a, cur + (e.op === '++' ? 1 : -1), e.line);
        }
        const v = yield* this.ev(e.a);
        if (e.op === '!') return typeof v === 'string' ? (v ? 0 : 1) : v ? 0 : 1;
        const n = this.num(v, e.line);
        return e.op === '-' ? -n : e.op === '~' ? ~n : n;
      }
      case 'post': {
        const cur = this.num(yield* this.ev(e.a), e.line);
        yield* this.store(e.a, cur + (e.op === '++' ? 1 : -1), e.line);
        return cur;
      }
      case 'assign': {
        let v = yield* this.ev(e.v);
        if (e.op !== '=') v = this.binop(e.op.slice(0, -1), yield* this.ev(e.target), v, e.target, e.v, e.line);
        return yield* this.store(e.target, v, e.line);
      }
      case 'index': {
        const arr = yield* this.ev(e.a);
        const i = this.num(yield* this.ev(e.i), e.line);
        if (typeof arr === 'string') return arr.charCodeAt(i) || 0;
        if (!Array.isArray(arr)) throw new Fault('只有陣列可以用 [ ]', e.line);
        if (i < 0 || i >= arr.length) throw new Fault(`陣列索引 ${i} 超出範圍（大小 ${arr.length}）`, e.line);
        return arr[Math.trunc(i)];
      }
      case 'bin': {
        if (e.op === '&&') return (yield* this.truthy(e.a)) && (yield* this.truthy(e.b)) ? 1 : 0;
        if (e.op === '||') return (yield* this.truthy(e.a)) || (yield* this.truthy(e.b)) ? 1 : 0;
        if (e.op === ',') { yield* this.ev(e.a); return yield* this.ev(e.b); }
        const a = yield* this.ev(e.a);
        const b = yield* this.ev(e.b);
        return this.binop(e.op, a, b, e.a, e.b, e.line);
      }
      case 'call': return yield* this.call(e);
    }
  }

  private binop(op: string, a: Val, b: Val, ea: Expr, eb: Expr, line: number): Val {
    if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
      return this.str(a, this.isFloatExpr(ea)) + this.str(b, this.isFloatExpr(eb));
    }
    if (typeof a === 'string' && typeof b === 'string') {
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
    }
    const x = this.num(a, line), y = this.num(b, line);
    const intMath = !this.isFloatExpr(ea) && !this.isFloatExpr(eb);
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/':
        if (y === 0) { if (intMath) throw new Fault('除以 0', line); return x / y; }
        return intMath ? Math.trunc(x / y) : x / y;
      case '%': if (y === 0) throw new Fault('對 0 取餘數', line); return intMath ? Math.trunc(x) % Math.trunc(y) : x % y;
      case '==': return x === y ? 1 : 0;
      case '!=': return x !== y ? 1 : 0;
      case '<': return x < y ? 1 : 0;
      case '>': return x > y ? 1 : 0;
      case '<=': return x <= y ? 1 : 0;
      case '>=': return x >= y ? 1 : 0;
      case '&': return x & y;
      case '|': return x | y;
      case '^': return x ^ y;
      case '<<': return x << y;
      case '>>': return x >> y;
    }
    throw new Fault(`不支援的運算子 ${op}`, line);
  }

  private *store(target: Expr, v: Val, line: number): Gen<Val> {
    if (target.k === 'id') {
      const x = this.lookup(target.name);
      if (!x) throw new Fault(`「${target.name}」沒有宣告`, line);
      x.v = this.wrap(x.type, v, line);
      return x.v;
    }
    if (target.k === 'index' && target.a.k === 'id') {
      const x = this.lookup(target.a.name);
      if (!x || !Array.isArray(x.v)) throw new Fault(`「${target.a.name}」不是陣列`, line);
      const i = this.num(yield* this.ev(target.i), line);
      if (i < 0 || i >= x.v.length) throw new Fault(`陣列索引 ${i} 超出範圍（大小 ${x.v.length}）`, line);
      x.v[Math.trunc(i)] = this.wrap(x.type, v, line);
      return x.v[Math.trunc(i)];
    }
    throw new Fault('不能指定值給這個運算式', line);
  }

  private *call(e: Extract<Expr, { k: 'call' }>): Gen<Val> {
    const args: Val[] = [];
    for (const a of e.args) args.push(yield* this.ev(a));
    const n = (i: number) => this.num(args[i] ?? 0, e.line);
    const L = e.line;
    const hal = this.hal;

    if (e.obj === 'Serial' || e.obj === 'Serial1' || e.obj === 'Serial2') {
      switch (e.name) {
        case 'begin': case 'flush': case 'end': case 'setTimeout': return 0;
        case 'available': return 0;
        case 'read': case 'peek': return -1;
        case 'print': case 'println': case 'write': {
          let text = '';
          if (args.length) {
            const a = args[0];
            const fmt = args[1];
            if (typeof a === 'number' && typeof fmt === 'number') {
              text = [HEX, BIN, OCT].includes(fmt) && Number.isInteger(a) && !this.isFloatExpr(e.args[0])
                ? (a >>> 0).toString(fmt).toUpperCase()
                : this.isFloatExpr(e.args[0]) ? a.toFixed(fmt) : String(a);
            } else text = e.name === 'write' && typeof a === 'number' ? String.fromCharCode(a) : this.str(a, this.isFloatExpr(e.args[0]));
          }
          hal.print(text + (e.name === 'println' ? '\n' : ''));
          return text.length;
        }
        case 'printf': hal.print(this.printf(args, L)); return 0;
      }
      throw new Fault(`Serial.${e.name}() 不支援`, L);
    }
    if (e.obj) {
      const v = this.lookup(e.obj);
      if (v && typeof v.v === 'string') {
        const s = v.v;
        switch (e.name) {
          case 'length': return s.length;
          case 'toInt': return parseInt(s, 10) || 0;
          case 'toFloat': return parseFloat(s) || 0;
          case 'charAt': return s.charCodeAt(n(0)) || 0;
          case 'indexOf': return s.indexOf(String(args[0]));
          case 'substring': return s.substring(n(0), args[1] === undefined ? undefined : n(1));
          case 'toUpperCase': v.v = s.toUpperCase(); return 0;
          case 'toLowerCase': v.v = s.toLowerCase(); return 0;
          case 'trim': v.v = s.trim(); return 0;
        }
      }
      throw new Fault(`${e.obj}.${e.name}() 不支援`, L);
    }

    if (this.prog.funcs.has(e.name)) return yield* this.callUser(e.name, args, L);

    switch (e.name) {
      case 'pinMode': hal.pinMode(n(0), n(1), L); return 0;
      case 'digitalWrite': hal.digitalWrite(n(0), n(1) ? 1 : 0, L); return 0;
      case 'digitalRead': return hal.digitalRead(n(0), L);
      case 'analogWrite': hal.analogWrite(n(0), Math.max(0, Math.min(255, n(1))) / 255, L); return 0;
      case 'analogRead': return hal.analogRead(n(0), L);
      case 'delay': yield Math.max(0, n(0)); return 0;
      case 'delayMicroseconds': yield Math.max(0, n(0)) / 1000; return 0;
      case 'millis': return Math.floor(hal.millis()) >>> 0;
      case 'micros': return Math.floor(hal.millis() * 1000) >>> 0;
      case 'yield': yield 0; return 0;
      case 'map': return Math.trunc((n(0) - n(1)) * (n(4) - n(3)) / (n(2) - n(1)) + n(3));
      case 'constrain': return Math.min(Math.max(n(0), n(1)), n(2));
      case 'min': return Math.min(n(0), n(1));
      case 'max': return Math.max(n(0), n(1));
      case 'abs': case 'fabs': return Math.abs(n(0));
      case 'sq': return n(0) * n(0);
      case 'sqrt': return Math.sqrt(n(0));
      case 'pow': return Math.pow(n(0), n(1));
      case 'sin': return Math.sin(n(0));
      case 'cos': return Math.cos(n(0));
      case 'tan': return Math.tan(n(0));
      case 'atan': return Math.atan(n(0));
      case 'atan2': return Math.atan2(n(0), n(1));
      case 'exp': return Math.exp(n(0));
      case 'log': return Math.log(n(0));
      case 'log10': return Math.log10(n(0));
      case 'floor': return Math.floor(n(0));
      case 'ceil': return Math.ceil(n(0));
      case 'round': return Math.round(n(0));
      case 'radians': return n(0) * Math.PI / 180;
      case 'degrees': return n(0) * 180 / Math.PI;
      case 'randomSeed': this.seed = n(0) || 1; return 0;
      case 'random': {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        const [lo, hi] = args.length >= 2 ? [n(0), n(1)] : [0, n(0)];
        return lo + (hi > lo ? this.seed % (hi - lo) : 0);
      }
      case 'bitRead': return (n(0) >> n(1)) & 1;
      case 'bit': return 1 << n(0);
      case 'highByte': return (n(0) >> 8) & 0xff;
      case 'lowByte': return n(0) & 0xff;
      case 'String': return this.str(args[0] ?? '', this.isFloatExpr(e.args[0] ?? { k: 'num', v: 0, float: false, line: L }), args[1] === undefined ? 2 : n(1));
      case 'int': return this.wrap('int', args[0] ?? 0, L);
      case 'float': return n(0);
      // WiringPi（Raspberry Pi）
      case 'wiringPiSetup': case 'wiringPiSetupGpio': case 'wiringPiSetupPhys': return 0;
      case 'pullUpDnControl': hal.pinMode(n(0), n(1) === 2 ? MODE.INPUT_PULLUP : n(1) === 1 ? MODE.INPUT_PULLDOWN : MODE.INPUT, L); return 0;
      case 'softPwmCreate': hal.pinMode(n(0), MODE.OUTPUT, L); hal.analogWrite(n(0), n(1) / (n(2) || 100), L); this.softRange.set(n(0), n(2) || 100); return 0;
      case 'softPwmWrite': hal.analogWrite(n(0), Math.max(0, Math.min(1, n(1) / (this.softRange.get(n(0)) ?? 100))), L); return 0;
      case 'pwmWrite': hal.analogWrite(n(0), Math.max(0, Math.min(1, n(1) / 1024)), L); return 0;
      case 'printf': hal.print(this.printf(args, L)); return 0;
      case 'puts': hal.print(String(args[0] ?? '') + '\n'); return 0;
      case 'tone': case 'noTone': return 0;
    }
    throw new Fault(`函式 ${e.name}() 沒有定義`, L);
  }
  private softRange = new Map<number, number>();

  private printf(args: Val[], line: number): string {
    const fmt = String(args[0] ?? '');
    let k = 1;
    return fmt.replace(/%(-?\d*)(?:\.(\d+))?(l{0,2})([diufsxXc%])/g, (_m, w: string, prec: string, _l, t: string) => {
      if (t === '%') return '%';
      const a = args[k++];
      let s: string;
      if (t === 's') s = String(a ?? '');
      else {
        const x = this.num(a ?? 0, line);
        s = t === 'f' ? x.toFixed(prec ? +prec : 6) : t === 'x' ? (x >>> 0).toString(16) : t === 'X' ? (x >>> 0).toString(16).toUpperCase()
          : t === 'c' ? String.fromCharCode(x) : t === 'u' ? String(Math.trunc(x) >>> 0) : String(Math.trunc(x));
      }
      const width = Math.abs(parseInt(w || '0', 10));
      return w.startsWith('-') ? s.padEnd(width) : s.padStart(width, w.startsWith('0') ? '0' : ' ');
    });
  }
}

const CONSTS: Record<string, number> = {
  HIGH: 1, LOW: 0, INPUT: MODE.INPUT, OUTPUT: MODE.OUTPUT, INPUT_PULLUP: MODE.INPUT_PULLUP, INPUT_PULLDOWN: MODE.INPUT_PULLDOWN,
  true: 1, false: 0, PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2, DEC, HEX, OCT, BIN,
  PUD_OFF: 0, PUD_DOWN: 1, PUD_UP: 2, PWM_OUTPUT: MODE.OUTPUT, NULL: 0, LSBFIRST: 0, MSBFIRST: 1,
};

export type RunState = 'running' | 'sleeping' | 'done' | 'error';

/** 每幀呼叫 step()：到了喚醒時間就往下執行，直到 delay 或用完這一幀的指令額度 */
export class SketchRunner {
  private gen: Gen<void>;
  private wakeAt = 0;
  state: RunState = 'running';
  error: { msg: string; line: number } | null = null;
  constructor(prog: Program, hal: Hal, private start: number) {
    this.gen = new Interp(prog, hal).run();
  }
  step(now: number, maxYields = 12): RunState {
    if (this.state === 'done' || this.state === 'error') return this.state;
    if (now < this.wakeAt) return (this.state = 'sleeping');
    try {
      for (let k = 0; k < maxYields; k++) {
        const r = this.gen.next();
        if (r.done) return (this.state = 'done');
        if (r.value > 0) { this.wakeAt = now + r.value; return (this.state = 'sleeping'); }
      }
      return (this.state = 'running');
    } catch (err) {
      this.state = 'error';
      this.error = err instanceof SketchError ? { msg: err.message, line: err.line } : { msg: String(err), line: 0 };
      return this.state;
    }
  }
  get startedAt() { return this.start; }
}

/** 編譯（只做語法分析），錯誤時回傳行號與訊息 */
export function compile(src: string): { prog?: Program; error?: { msg: string; line: number } } {
  try { return { prog: parseSketch(src) }; }
  catch (err) { return { error: err instanceof SketchError ? { msg: err.message, line: err.line } : { msg: String(err), line: 0 } }; }
}
