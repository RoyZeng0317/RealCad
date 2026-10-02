// Verilog（可合成子集）詞法 + 語法分析：給 FPGA 板模擬用。純函式產生 AST，不執行任何使用者程式碼
export class HdlError extends Error {
  constructor(msg: string, public line: number, public file = '') { super(msg); }
}

type TokT = 'id' | 'num' | 'str' | 'op' | 'sys' | 'eof';
interface Tok { t: TokT; v: string; line: number; num?: VNum }
export interface VNum { value: number; width: number | null; xz: boolean }

const OPS = [
  '<<<', '>>>', '===', '!==',
  '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '~&', '~|', '~^', '^~', '**', '+:', '-:', '->',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ',', ';', '(', ')', '[', ']', '{', '}', '.', '@', '#',
];
const KEYWORDS = new Set([
  'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'integer', 'parameter', 'localparam', 'assign', 'always',
  'initial', 'begin', 'end', 'if', 'else', 'case', 'casez', 'casex', 'endcase', 'default', 'for', 'posedge', 'negedge', 'or',
  'signed', 'function', 'endfunction', 'task', 'endtask', 'generate', 'endgenerate', 'genvar', 'while', 'repeat', 'forever', 'tri',
  'supply0', 'supply1', 'logic', 'always_ff', 'always_comb',
]);

function parseNumber(raw: string, line: number): VNum {
  const s = raw.replace(/_/g, '');
  const m = /^(\d*)'([sS]?)([bBoOdDhH])([0-9a-fA-FxXzZ?]+)$/.exec(s);
  if (!m) {
    if (!/^\d+$/.test(s)) throw new HdlError(`數字格式錯誤：${raw}`, line);
    return { value: Number(s), width: null, xz: false };
  }
  const width = m[1] ? Number(m[1]) : null;
  const base = { b: 2, o: 8, d: 10, h: 16 }[m[3].toLowerCase() as 'b' | 'o' | 'd' | 'h'];
  const digits = m[4];
  const xz = /[xXzZ?]/.test(digits);
  // x / z / ? 在可合成電路裡當 0 處理（casez 的 ? 另外處理成遮罩）
  const value = parseInt(digits.replace(/[xXzZ?]/g, '0'), base);
  if (width !== null && (width < 1 || width > 32)) throw new HdlError(`模擬器最多支援 32 位元的常數（${raw}）`, line);
  if (width !== null && value >= 2 ** width) throw new HdlError(`常數 ${raw} 超過 ${width} 位元`, line);
  return { value, width, xz };
}

/** casez 用：把 ? / z（casex 再加 x）的位元變成不比較的遮罩 */
export function caseMask(raw: string, kind: 'case' | 'casez' | 'casex'): number | null {
  if (kind === 'case') return null;
  const m = /'[sS]?([bBhHoO])([0-9a-fA-FxXzZ?_]+)$/.exec(raw);
  if (!m) return null;
  const bits = { b: 1, o: 3, h: 4 }[m[1].toLowerCase() as 'b' | 'o' | 'h'];
  let mask = 0;
  for (const ch of m[2].replace(/_/g, '')) {
    const dc = ch === '?' || /[zZ]/.test(ch) || (kind === 'casex' && /[xX]/.test(ch));
    mask = mask * 2 ** bits + (dc ? 0 : 2 ** bits - 1);
  }
  return mask;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  const defines = new Map<string, Tok[]>();
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) {
      const e = src.indexOf('*/', i + 2);
      const stop = e < 0 ? src.length : e + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '`') {
      const m = /^`(\w+)/.exec(src.slice(i))!;
      const dir = m[1];
      let e = i;
      while (e < src.length && src[e] !== '\n') e++;
      const rest = src.slice(i + m[0].length, e).trim();
      if (dir === 'define') {
        const dm = /^(\w+)\s*(.*)$/.exec(rest);
        if (!dm) throw new HdlError('`define 格式錯誤', line);
        if (dm[2].startsWith('(')) throw new HdlError('不支援帶參數的 `define', line);
        defines.set(dm[1], lex(dm[2].replace(/\/\/.*$/, '')).slice(0, -1).map((t) => ({ ...t, line })));
        i = e;
      } else if (['timescale', 'default_nettype', 'resetall', 'celldefine', 'endcelldefine'].includes(dir)) {
        i = e;
      } else if (defines.has(dir)) {
        defines.get(dir)!.forEach((t) => toks.push({ ...t, line }));
        i += m[0].length;
      } else {
        throw new HdlError(dir === 'include' ? '不支援 `include，請把檔案一起上傳（每個 module 一個或多個 .v 都可以）' : `不支援的編譯指令 \`${dir}`, line);
      }
      continue;
    }
    if (c === '"') {
      let k = i + 1;
      while (k < src.length && src[k] !== '"' && src[k] !== '\n') k += src[k] === '\\' ? 2 : 1;
      toks.push({ t: 'str', v: src.slice(i + 1, k), line });
      i = k + 1;
      continue;
    }
    const nm = /^(\d[\d_]*)?\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+|^\d[\d_]*/.exec(src.slice(i));
    if (nm && (/[0-9]/.test(c) || c === "'")) {
      const raw = nm[0].replace(/\s+/g, '');
      toks.push({ t: 'num', v: raw, line, num: parseNumber(raw, line) });
      i += nm[0].length;
      continue;
    }
    if (c === "'" ) {
      const m2 = /^'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+/.exec(src.slice(i));
      if (m2) { const raw = m2[0].replace(/\s+/g, ''); toks.push({ t: 'num', v: raw, line, num: parseNumber(raw, line) }); i += m2[0].length; continue; }
    }
    if (c === '$') {
      const m = /^\$\w+/.exec(src.slice(i))!;
      toks.push({ t: 'sys', v: m[0], line });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w$]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0], line });
      i += m[0].length;
      continue;
    }
    if (c === '\\') throw new HdlError('不支援跳脫識別字（\\name）', line);
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new HdlError(`無法辨識的字元「${c}」`, line);
    toks.push({ t: 'op', v: op, line });
    i += op.length;
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

// ---- AST ----
export type VExpr =
  | { k: 'num'; n: VNum; raw: string; line: number }
  | { k: 'id'; name: string; line: number }
  | { k: 'bit'; name: string; idx: VExpr; line: number }
  | { k: 'part'; name: string; msb: VExpr; lsb: VExpr; line: number }
  | { k: 'ipart'; name: string; base: VExpr; width: VExpr; dir: '+' | '-'; line: number }
  | { k: 'mem'; name: string; idx: VExpr; sel?: VExpr; line: number }
  | { k: 'concat'; items: VExpr[]; line: number }
  | { k: 'repl'; count: VExpr; items: VExpr[]; line: number }
  | { k: 'un'; op: string; a: VExpr; line: number }
  | { k: 'bin'; op: string; a: VExpr; b: VExpr; line: number }
  | { k: 'cond'; c: VExpr; a: VExpr; b: VExpr; line: number }
  | { k: 'call'; name: string; args: VExpr[]; line: number };

export type VStmt =
  | { k: 'block'; body: VStmt[] }
  | { k: 'if'; c: VExpr; a: VStmt; b?: VStmt; line: number }
  | { k: 'case'; kind: 'case' | 'casez' | 'casex'; e: VExpr; items: { labels: VExpr[]; masks: (number | null)[]; body: VStmt }[]; dflt?: VStmt; line: number }
  | { k: 'asg'; lhs: VExpr; rhs: VExpr; nb: boolean; line: number }
  | { k: 'for'; init: VStmt; c: VExpr; step: VStmt; body: VStmt; line: number }
  // $readmemh / $readmemb：從資料檔載入記憶體初始內容（EAB 的 RAM / ROM）
  | { k: 'readmem'; hex: boolean; file: string; mem: string; start?: VExpr; end?: VExpr; line: number }
  | { k: 'nop' };

export interface VRange { msb: VExpr; lsb: VExpr }
export interface VDecl { kind: 'input' | 'output' | 'inout' | 'wire' | 'reg' | 'integer'; name: string; range?: VRange; arr?: VRange; init?: VExpr; isReg: boolean; line: number }
export type VItem =
  | { k: 'decl'; d: VDecl }
  | { k: 'param'; name: string; value: VExpr; local: boolean; line: number }
  | { k: 'assign'; lhs: VExpr; rhs: VExpr; line: number }
  | { k: 'always'; sens: 'star' | { edge: 'pos' | 'neg' | 'any'; sig: string }[]; body: VStmt; line: number }
  | { k: 'initial'; body: VStmt; line: number }
  | { k: 'inst'; mod: string; name: string; params: { name?: string; value: VExpr }[]; conns: { port?: string; e?: VExpr }[]; line: number };

export interface VModule { name: string; ports: string[]; items: VItem[]; file: string; line: number }

class Parser {
  i = 0;
  constructor(private toks: Tok[], private file: string) {}
  peek(o = 0) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next() { return this.toks[this.i++]; }
  is(v: string, o = 0) { const t = this.peek(o); return (t.t === 'op' || t.t === 'id') && t.v === v; }
  eat(v: string) { if (this.is(v)) { this.i++; return true; } return false; }
  fail(msg: string, t = this.peek()): never { throw new HdlError(msg, t.line, this.file); }
  expect(v: string) {
    if (!this.eat(v)) {
      const t = this.peek();
      this.fail(`這裡需要「${v}」，但看到「${t.t === 'eof' ? '檔案結尾' : t.v}」${v === ';' ? '（是不是少了分號？）' : ''}`,
        v === ';' && this.i > 0 ? this.toks[this.i - 1] : t);
    }
  }
  ident(): string {
    const t = this.next();
    if (t.t !== 'id' || KEYWORDS.has(t.v)) this.fail(`這裡需要名稱，但看到「${t.v || '檔案結尾'}」`, t);
    return t.v;
  }

  file_(): VModule[] {
    const mods: VModule[] = [];
    while (this.peek().t !== 'eof') {
      if (this.eat('module')) mods.push(this.module());
      else this.fail(`檔案裡只能有 module … endmodule，但看到「${this.peek().v}」`);
    }
    return mods;
  }

  range(): VRange | undefined {
    if (!this.eat('[')) return undefined;
    const msb = this.expr();
    this.expect(':');
    const lsb = this.expr();
    this.expect(']');
    return { msb, lsb };
  }

  module(): VModule {
    const line = this.peek().line;
    const name = this.ident();
    const items: VItem[] = [];
    const ports: string[] = [];
    if (this.eat('#')) {
      this.expect('(');
      while (!this.is(')')) {
        this.eat('parameter');
        if (this.is('[')) this.range();
        const pn = this.ident();
        this.expect('=');
        items.push({ k: 'param', name: pn, value: this.expr(), local: false, line });
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    if (this.eat('(')) {
      // ANSI 風格（input wire [3:0] a, ...）或舊式（只有名字）
      let dir: VDecl['kind'] | null = null, isReg = false, rng: VRange | undefined;
      while (!this.is(')')) {
        const t = this.peek();
        if (this.is('input') || this.is('output') || this.is('inout')) {
          dir = this.next().v as VDecl['kind'];
          isReg = false; rng = undefined;
          if (this.eat('reg') || this.eat('logic')) isReg = true; else this.eat('wire');
          this.eat('signed');
          rng = this.range();
        }
        const pn = this.ident();
        ports.push(pn);
        if (dir) items.push({ k: 'decl', d: { kind: dir, name: pn, range: rng, isReg, line: t.line } });
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    this.expect(';');
    while (!this.eat('endmodule')) {
      if (this.peek().t === 'eof') this.fail(`module ${name} 缺少 endmodule`);
      items.push(...this.item());
    }
    return { name, ports, items, file: this.file, line };
  }

  item(): VItem[] {
    const t = this.peek();
    const line = t.line;
    if (t.t === 'id') {
      switch (t.v) {
        case 'input': case 'output': case 'inout': case 'wire': case 'reg': case 'integer': case 'tri': case 'logic': {
          this.next();
          let kind = (t.v === 'tri' ? 'wire' : t.v === 'logic' ? 'reg' : t.v) as VDecl['kind'];
          let isReg = kind === 'reg' || kind === 'integer';
          if (kind !== 'reg' && kind !== 'wire' && kind !== 'integer') {
            if (this.eat('reg') || this.eat('logic')) isReg = true; else this.eat('wire');
          }
          this.eat('signed');
          const range = kind === 'integer' ? { msb: num(31), lsb: num(0) } : this.range();
          const out: VItem[] = [];
          do {
            const dline = this.peek().line;
            const n = this.ident();
            const arr = this.range();
            const init = this.eat('=') ? this.expr() : undefined;
            out.push({ k: 'decl', d: { kind, name: n, range, arr, init, isReg, line: dline } });
          } while (this.eat(','));
          this.expect(';');
          if (kind === 'integer') kind = 'reg';
          return out;
        }
        case 'parameter': case 'localparam': {
          this.next();
          this.eat('signed');
          if (this.is('[')) this.range();
          if (this.eat('integer')) { /* parameter integer */ }
          const out: VItem[] = [];
          do {
            const n = this.ident();
            this.expect('=');
            out.push({ k: 'param', name: n, value: this.expr(), local: t.v === 'localparam', line });
          } while (this.eat(','));
          this.expect(';');
          return out;
        }
        case 'assign': {
          this.next();
          const out: VItem[] = [];
          do {
            const lhs = this.lvalue();
            this.expect('=');
            out.push({ k: 'assign', lhs, rhs: this.expr(), line });
          } while (this.eat(','));
          this.expect(';');
          return out;
        }
        case 'always': case 'always_ff': case 'always_comb': {
          this.next();
          if (t.v === 'always_comb') return [{ k: 'always', sens: 'star', body: this.stmt(), line }];
          this.expect('@');
          let sens: 'star' | { edge: 'pos' | 'neg' | 'any'; sig: string }[];
          if (this.eat('*')) sens = 'star';
          else {
            this.expect('(');
            if (this.eat('*')) { this.expect(')'); sens = 'star'; }
            else {
              const list: { edge: 'pos' | 'neg' | 'any'; sig: string }[] = [];
              do {
                const edge = this.eat('posedge') ? 'pos' : this.eat('negedge') ? 'neg' : 'any';
                list.push({ edge, sig: this.ident() });
                if (this.is('[')) this.fail('敏感列表不支援位元選取，請改用 always @(*)');
              } while (this.eat('or') || this.eat(','));
              this.expect(')');
              const edges = list.filter((x) => x.edge !== 'any');
              sens = edges.length ? edges : 'star';
              if (edges.length && edges.length !== list.length) this.fail('敏感列表不能混用 posedge/negedge 和一般訊號');
            }
          }
          return [{ k: 'always', sens, body: this.stmt(), line }];
        }
        case 'initial': this.next(); return [{ k: 'initial', body: this.stmt(), line }];
        case 'function': case 'task': this.fail(`目前不支援 ${t.v}（請改寫成 always / assign 或子模組）`);
        // eslint-disable-next-line no-fallthrough
        case 'generate': case 'genvar': this.fail('目前不支援 generate / genvar');
        // eslint-disable-next-line no-fallthrough
        case 'supply0': case 'supply1': this.fail('不支援 supply0 / supply1，請用 assign x = 0 / 1');
      }
      if (!KEYWORDS.has(t.v)) return [this.instance()];
    }
    this.fail(`module 裡看不懂「${t.v || '檔案結尾'}」`);
  }

  instance(): VItem {
    const line = this.peek().line;
    const mod = this.ident();
    const params: { name?: string; value: VExpr }[] = [];
    if (this.eat('#')) {
      this.expect('(');
      while (!this.is(')')) {
        if (this.eat('.')) { const n = this.ident(); this.expect('('); params.push({ name: n, value: this.expr() }); this.expect(')'); }
        else params.push({ value: this.expr() });
        if (!this.eat(',')) break;
      }
      this.expect(')');
    }
    const name = this.ident();
    if (this.is('[')) this.fail('不支援實例陣列');
    this.expect('(');
    const conns: { port?: string; e?: VExpr }[] = [];
    while (!this.is(')')) {
      if (this.eat('.')) {
        const port = this.ident();
        this.expect('(');
        const e = this.is(')') ? undefined : this.expr();
        this.expect(')');
        conns.push({ port, e });
      } else conns.push({ e: this.expr() });
      if (!this.eat(',')) break;
    }
    this.expect(')');
    this.expect(';');
    return { k: 'inst', mod, name, params, conns, line };
  }

  stmt(): VStmt {
    const t = this.peek();
    const line = t.line;
    if (this.eat(';')) return { k: 'nop' };
    if (this.eat('begin')) {
      if (this.eat(':')) this.ident();
      const body: VStmt[] = [];
      while (!this.eat('end')) {
        if (this.peek().t === 'eof') this.fail('缺少 end');
        body.push(this.stmt());
      }
      return { k: 'block', body };
    }
    if (this.eat('if')) {
      this.expect('(');
      const c = this.expr();
      this.expect(')');
      const a = this.stmt();
      return { k: 'if', c, a, b: this.eat('else') ? this.stmt() : undefined, line };
    }
    if (this.is('case') || this.is('casez') || this.is('casex')) {
      const kind = this.next().v as 'case' | 'casez' | 'casex';
      this.expect('(');
      const e = this.expr();
      this.expect(')');
      const items: { labels: VExpr[]; masks: (number | null)[]; body: VStmt }[] = [];
      let dflt: VStmt | undefined;
      while (!this.eat('endcase')) {
        if (this.peek().t === 'eof') this.fail('case 缺少 endcase');
        if (this.eat('default')) { this.eat(':'); dflt = this.stmt(); continue; }
        const labels: VExpr[] = [], masks: (number | null)[] = [];
        do {
          const lt = this.peek();
          labels.push(this.expr());
          masks.push(lt.t === 'num' ? caseMask(lt.v, kind) : null);
        } while (this.eat(','));
        this.expect(':');
        items.push({ labels, masks, body: this.stmt() });
      }
      return { k: 'case', kind, e, items, dflt, line };
    }
    if (this.eat('for')) {
      this.expect('(');
      const init = this.simpleAsg(false);
      this.expect(';');
      const c = this.expr();
      this.expect(';');
      const step = this.simpleAsg(false);
      this.expect(')');
      return { k: 'for', init, c, step, body: this.stmt(), line };
    }
    if (this.is('while') || this.is('repeat') || this.is('forever')) this.fail(`不支援 ${t.v}（不可合成或請改用 for）`);
    if (t.t === 'sys' && (t.v === '$readmemh' || t.v === '$readmemb')) {
      this.next();
      this.expect('(');
      const f = this.next();
      if (f.t !== 'str') this.fail(`${t.v} 的第一個參數要是檔名字串，例如 ${t.v}("rom.hex", mem);`);
      this.expect(',');
      const m = this.next();
      if (m.t !== 'id') this.fail(`${t.v} 的第二個參數要是記憶體名稱`);
      const start = this.eat(',') ? this.expr() : undefined;
      const end = start && this.eat(',') ? this.expr() : undefined;
      this.expect(')');
      this.expect(';');
      return { k: 'readmem', hex: t.v === '$readmemh', file: f.v.replace(/^"|"$/g, ''), mem: m.v, start, end, line };
    }
    if (t.t === 'sys') {
      // $display / $finish 等模擬指令：略過
      this.next();
      if (this.eat('(')) { let d = 1; while (d && this.peek().t !== 'eof') { const x = this.next(); if (x.v === '(') d++; if (x.v === ')') d--; } }
      this.expect(';');
      return { k: 'nop' };
    }
    if (this.is('#')) this.fail('不支援延遲（#10）：延遲不可合成');
    const s = this.simpleAsg(true);
    this.expect(';');
    return s;
  }
  simpleAsg(allowNb: boolean): VStmt {
    const line = this.peek().line;
    const lhs = this.lvalue();
    let nb = false;
    if (allowNb && this.eat('<=')) nb = true;
    else if (!this.eat('=')) this.fail('這裡需要 = 或 <=');
    if (this.is('#')) this.fail('不支援延遲（#10）');
    return { k: 'asg', lhs, rhs: this.expr(), nb, line };
  }
  lvalue(): VExpr {
    const e = this.primary();
    if (!['id', 'bit', 'part', 'ipart', 'mem', 'concat'].includes(e.k)) this.fail('等號左邊必須是訊號');
    return e;
  }

  expr(): VExpr {
    const c = this.bin(0);
    if (this.is('?')) {
      const line = this.next().line;
      const a = this.expr();
      this.expect(':');
      return { k: 'cond', c, a, b: this.expr(), line };
    }
    return c;
  }
  static LEVELS = [['||'], ['&&'], ['|', '~|'], ['^', '~^', '^~'], ['&', '~&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>='], ['<<', '>>', '<<<', '>>>'], ['+', '-'], ['*', '/', '%'], ['**']];
  bin(level: number): VExpr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let a = this.bin(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && Parser.LEVELS[level].includes(t.v)) {
        this.next();
        const op = t.v === '===' ? '==' : t.v === '!==' ? '!=' : t.v === '<<<' ? '<<' : t.v === '>>>' ? '>>' : t.v === '^~' ? '~^' : t.v;
        a = { k: 'bin', op, a, b: this.bin(level + 1), line: t.line };
      } else return a;
    }
  }
  unary(): VExpr {
    const t = this.peek();
    if (t.t === 'op' && ['!', '~', '-', '+', '&', '|', '^', '~&', '~|', '~^', '^~'].includes(t.v)) {
      this.next();
      return { k: 'un', op: t.v === '^~' ? '~^' : t.v, a: this.unary(), line: t.line };
    }
    return this.primary();
  }
  primary(): VExpr {
    const t = this.next();
    const line = t.line;
    if (t.t === 'num') return { k: 'num', n: t.num!, raw: t.v, line };
    if (t.t === 'sys') {
      if (t.v === '$signed' || t.v === '$unsigned') { this.expect('('); const e = this.expr(); this.expect(')'); return e; }
      if (t.v === '$clog2') { this.expect('('); const e = this.expr(); this.expect(')'); return { k: 'call', name: '$clog2', args: [e], line }; }
      this.fail(`不支援 ${t.v}`, t);
    }
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expect(')'); return e; }
    if (t.t === 'op' && t.v === '{') {
      const first = this.expr();
      if (this.is('{')) {
        this.next();
        const items = [this.expr()];
        while (this.eat(',')) items.push(this.expr());
        this.expect('}');
        this.expect('}');
        return { k: 'repl', count: first, items, line };
      }
      const items = [first];
      while (this.eat(',')) items.push(this.expr());
      this.expect('}');
      return { k: 'concat', items, line };
    }
    if (t.t === 'id' && !KEYWORDS.has(t.v)) {
      if (this.eat('[')) {
        const a = this.expr();
        if (this.eat(':')) { const b = this.expr(); this.expect(']'); return { k: 'part', name: t.v, msb: a, lsb: b, line }; }
        if (this.is('+:') || this.is('-:')) { const dir = this.next().v[0] as '+' | '-'; const w = this.expr(); this.expect(']'); return { k: 'ipart', name: t.v, base: a, width: w, dir, line }; }
        this.expect(']');
        // mem[i][b]：記憶體字組再取位元
        if (this.eat('[')) { const sel = this.expr(); this.expect(']'); return { k: 'mem', name: t.v, idx: a, sel, line }; }
        return { k: 'bit', name: t.v, idx: a, line };
      }
      if (this.is('(')) this.fail(`不支援呼叫函式 ${t.v}()`);
      return { k: 'id', name: t.v, line };
    }
    this.fail(`這裡看不懂「${t.v || '檔案結尾'}」`, t);
  }
}

const num = (v: number): VExpr => ({ k: 'num', n: { value: v, width: null, xz: false }, raw: String(v), line: 0 });

export function parseVerilog(src: string, file: string): VModule[] {
  try {
    return new Parser(lex(src), file).file_();
  } catch (e) {
    if (e instanceof HdlError) { e.file = e.file || file; throw e; }
    throw e;
  }
}
