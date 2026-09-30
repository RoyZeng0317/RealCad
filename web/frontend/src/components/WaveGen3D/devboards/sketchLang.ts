// Arduino / WiringPi 風格 C 子集的詞法 + 語法分析（純函式，產生 AST；不使用 eval，開別人的 .rc 檔也不會執行任意 JS）
export class SketchError extends Error {
  constructor(msg: string, public line: number) { super(msg); }
}

type TokT = 'num' | 'str' | 'id' | 'op' | 'eof';
interface Tok { t: TokT; v: string; n?: number; float?: boolean; line: number }

const OPS = [
  '<<=', '>>=', '++', '--', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '<<', '>>', '::', '->',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ',', ';', '(', ')', '{', '}', '[', ']', '.',
];

export const TYPE_WORDS = new Set([
  'void', 'int', 'long', 'short', 'float', 'double', 'bool', 'boolean', 'byte', 'char', 'unsigned', 'signed', 'const',
  'static', 'volatile', 'String', 'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'size_t', 'word', 'auto',
]);

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  const macros = new Map<string, Tok[]>();
  let i = 0, line = 1;
  const push = (t: Tok) => {
    const m = t.t === 'id' ? macros.get(t.v) : undefined;
    if (m) m.forEach((x) => toks.push({ ...x, line: t.line }));
    else toks.push(t);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '#') {
      // 前置處理：#define NAME 值（簡單文字替換），#include / #pragma 略過
      let e = i;
      while (e < src.length && src[e] !== '\n') e++;
      const text = src.slice(i + 1, e).trim();
      const m = /^define\s+([A-Za-z_]\w*)\s*(.*)$/.exec(text);
      if (m) {
        if (m[2].includes('(') && /^\w+\(/.test(text.slice(7).trim())) throw new SketchError('不支援帶參數的 #define 巨集', line);
        const body = m[2] ? lex(m[2]).slice(0, -1).map((t) => ({ ...t, line })) : [];
        macros.set(m[1], body);
      } else if (!/^(include|pragma|ifndef|ifdef|endif|else|if|undef)\b/.test(text)) {
        throw new SketchError(`不支援的前置指令 #${text.split(/\s/)[0]}`, line);
      }
      i = e;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let m = /^0[xX][0-9a-fA-F]+|^0[bB][01]+|^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
      let raw = m[0];
      let n: number, float = false;
      if (/^0[xX]/.test(raw)) n = parseInt(raw.slice(2), 16);
      else if (/^0[bB]/.test(raw)) n = parseInt(raw.slice(2), 2);
      else { n = parseFloat(raw); float = /[.eE]/.test(raw); }
      i += raw.length;
      const suf = /^[uUlLfF]+/.exec(src.slice(i));
      if (suf) { if (/[fF]/.test(suf[0])) float = true; i += suf[0].length; }
      push({ t: 'num', v: raw, n, float, line });
      continue;
    }
    if (c === '"') {
      let s = '', k = i + 1;
      while (k < src.length && src[k] !== '"') {
        if (src[k] === '\n') throw new SketchError('字串沒有結尾的 "', line);
        if (src[k] === '\\') {
          const e = src[k + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'r' ? '\r' : e === '0' ? '\0' : e;
          k += 2;
        } else s += src[k++];
      }
      i = k + 1;
      push({ t: 'str', v: s, line });
      continue;
    }
    if (c === "'") {
      let ch = src[i + 1], len = 3;
      if (ch === '\\') { const e = src[i + 2]; ch = e === 'n' ? '\n' : e === 't' ? '\t' : e === '0' ? '\0' : e; len = 4; }
      if (src[i + len - 1] !== "'") throw new SketchError("字元常數格式錯誤", line);
      push({ t: 'num', v: ch, n: ch.charCodeAt(0), line });
      i += len;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(src.slice(i))!;
      push({ t: 'id', v: m[0], line });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new SketchError(`無法辨識的字元「${c}」`, line);
    toks.push({ t: 'op', v: op, line });
    i += op.length;
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

// ---- AST ----
export type Expr =
  | { k: 'num'; v: number; float: boolean; line: number }
  | { k: 'str'; v: string; line: number }
  | { k: 'id'; name: string; line: number }
  | { k: 'bin'; op: string; a: Expr; b: Expr; line: number }
  | { k: 'un'; op: string; a: Expr; line: number }
  | { k: 'post'; op: string; a: Expr; line: number }
  | { k: 'assign'; op: string; target: Expr; v: Expr; line: number }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr; line: number }
  | { k: 'call'; name: string; obj?: string; args: Expr[]; line: number }
  | { k: 'index'; a: Expr; i: Expr; line: number }
  | { k: 'cast'; type: string; a: Expr; line: number }
  | { k: 'list'; items: Expr[]; line: number };

export interface VarDecl { name: string; type: string; size?: Expr; init?: Expr; line: number }

export type Stmt =
  | { k: 'block'; body: Stmt[] }
  | { k: 'decl'; vars: VarDecl[] }
  | { k: 'expr'; e: Expr; line: number }
  | { k: 'if'; c: Expr; a: Stmt; b?: Stmt; line: number }
  | { k: 'while'; c: Expr; body: Stmt; line: number }
  | { k: 'do'; c: Expr; body: Stmt; line: number }
  | { k: 'for'; init?: Stmt; c?: Expr; step?: Expr; body: Stmt; line: number }
  | { k: 'switch'; e: Expr; cases: { v: Expr | null; body: Stmt[] }[]; line: number }
  | { k: 'return'; e?: Expr; line: number }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number };

export interface FuncDef { name: string; type: string; params: { name: string; type: string; array: boolean }[]; body: Stmt; line: number }
export interface Program { funcs: Map<string, FuncDef>; globals: VarDecl[] }

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(o = 0) { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next() { return this.toks[this.i++]; }
  is(v: string, o = 0) { const t = this.peek(o); return (t.t === 'op' || t.t === 'id') && t.v === v; }
  eat(v: string) { if (this.is(v)) { this.i++; return true; } return false; }
  expect(v: string) {
    if (!this.eat(v)) {
      const t = this.peek();
      // 少分號時錯誤應該標在「上一個字」那一行，而不是下一行
      const line = v === ';' && this.i > 0 ? this.toks[this.i - 1].line : t.line;
      throw new SketchError(`這裡需要「${v}」，但看到「${t.t === 'eof' ? '檔案結尾' : t.v}」${v === ';' ? '（是不是少了分號？）' : ''}`, line);
    }
  }
  isType(o = 0) { const t = this.peek(o); return t.t === 'id' && TYPE_WORDS.has(t.v); }
  type(): string {
    const words: string[] = [];
    while (this.isType()) words.push(this.next().v);
    if (!words.length) throw new SketchError('這裡需要型別（例如 int）', this.peek().line);
    return words.filter((w) => !['const', 'static', 'volatile', 'signed'].includes(w)).join(' ') || 'int';
  }
  ident(): string {
    const t = this.next();
    if (t.t !== 'id') throw new SketchError(`這裡需要名稱，但看到「${t.v || '檔案結尾'}」`, t.line);
    return t.v;
  }

  program(): Program {
    const funcs = new Map<string, FuncDef>();
    const globals: VarDecl[] = [];
    while (this.peek().t !== 'eof') {
      if (this.eat(';')) continue;
      const line = this.peek().line;
      const type = this.type();
      const name = this.ident();
      if (this.is('(')) {
        this.next();
        const params: FuncDef['params'] = [];
        if (!(this.is('void') && this.is(')', 1)) && !this.is(')')) {
          do {
            const pt = this.type();
            this.eat('&');
            const pn = this.ident();
            let array = false;
            if (this.eat('[')) { this.expect(']'); array = true; }
            params.push({ name: pn, type: pt, array });
          } while (this.eat(','));
        } else this.eat('void');
        this.expect(')');
        if (this.eat(';')) continue; // 函式原型宣告
        const body = this.block();
        if (funcs.has(name)) throw new SketchError(`函式 ${name}() 重複定義`, line);
        funcs.set(name, { name, type, params, body, line });
      } else {
        globals.push(...this.declRest(type, name, line));
        this.expect(';');
      }
    }
    return { funcs, globals };
  }

  declRest(type: string, first: string, line: number): VarDecl[] {
    const out: VarDecl[] = [];
    let name = first;
    for (;;) {
      const d: VarDecl = { name, type, line };
      if (this.eat('[')) { d.size = this.is(']') ? undefined : this.expr(); this.expect(']'); d.type += '[]'; }
      if (this.eat('=')) d.init = this.is('{') ? this.initList() : this.assign();
      out.push(d);
      if (!this.eat(',')) break;
      name = this.ident();
    }
    return out;
  }
  initList(): Expr {
    const line = this.peek().line;
    this.expect('{');
    const items: Expr[] = [];
    if (!this.is('}')) do { if (this.is('}')) break; items.push(this.is('{') ? this.initList() : this.assign()); } while (this.eat(','));
    this.expect('}');
    return { k: 'list', items, line };
  }

  block(): Stmt {
    this.expect('{');
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.peek().t === 'eof') throw new SketchError('缺少「}」', this.peek().line);
      body.push(this.stmt());
    }
    this.next();
    return { k: 'block', body };
  }

  stmt(): Stmt {
    const line = this.peek().line;
    if (this.is('{')) return this.block();
    if (this.eat(';')) return { k: 'block', body: [] };
    if (this.eat('if')) {
      this.expect('('); const c = this.expr(); this.expect(')');
      const a = this.stmt();
      const b = this.eat('else') ? this.stmt() : undefined;
      return { k: 'if', c, a, b, line };
    }
    if (this.eat('while')) { this.expect('('); const c = this.expr(); this.expect(')'); return { k: 'while', c, body: this.stmt(), line }; }
    if (this.eat('do')) {
      const body = this.stmt(); this.expect('while'); this.expect('('); const c = this.expr(); this.expect(')'); this.expect(';');
      return { k: 'do', c, body, line };
    }
    if (this.eat('for')) {
      this.expect('(');
      let init: Stmt | undefined;
      if (!this.is(';')) {
        if (this.isType()) { const t = this.type(); const n = this.ident(); init = { k: 'decl', vars: this.declRest(t, n, line) }; }
        else init = { k: 'expr', e: this.expr(), line };
      }
      this.expect(';');
      const c = this.is(';') ? undefined : this.expr();
      this.expect(';');
      const step = this.is(')') ? undefined : this.expr();
      this.expect(')');
      return { k: 'for', init, c, step, body: this.stmt(), line };
    }
    if (this.eat('switch')) {
      this.expect('('); const e = this.expr(); this.expect(')'); this.expect('{');
      const cases: { v: Expr | null; body: Stmt[] }[] = [];
      while (!this.eat('}')) {
        if (this.eat('case')) { const v = this.cond(); this.expect(':'); cases.push({ v, body: [] }); }
        else if (this.eat('default')) { this.expect(':'); cases.push({ v: null, body: [] }); }
        else {
          if (!cases.length) throw new SketchError('switch 裡要先有 case', this.peek().line);
          cases[cases.length - 1].body.push(this.stmt());
        }
      }
      return { k: 'switch', e, cases, line };
    }
    if (this.eat('return')) { const e = this.is(';') ? undefined : this.expr(); this.expect(';'); return { k: 'return', e, line }; }
    if (this.eat('break')) { this.expect(';'); return { k: 'break', line }; }
    if (this.eat('continue')) { this.expect(';'); return { k: 'continue', line }; }
    if (this.isType() && !(this.peek().v === 'String' && this.is('(', 1))) {
      const t = this.type(); const n = this.ident();
      const vars = this.declRest(t, n, line);
      this.expect(';');
      return { k: 'decl', vars };
    }
    const e = this.expr();
    this.expect(';');
    return { k: 'expr', e, line };
  }

  expr(): Expr {
    let e = this.assign();
    while (this.is(',')) { const line = this.next().line; e = { k: 'bin', op: ',', a: e, b: this.assign(), line }; }
    return e;
  }
  assign(): Expr {
    const a = this.cond();
    const t = this.peek();
    if (t.t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='].includes(t.v)) {
      this.next();
      if (a.k !== 'id' && a.k !== 'index') throw new SketchError('等號左邊必須是變數', t.line);
      return { k: 'assign', op: t.v, target: a, v: this.assign(), line: t.line };
    }
    return a;
  }
  cond(): Expr {
    const c = this.bin(0);
    if (this.is('?')) {
      const line = this.next().line; const a = this.assign(); this.expect(':');
      return { k: 'cond', c, a, b: this.assign(), line };
    }
    return c;
  }
  static LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  bin(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let a = this.bin(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && Parser.LEVELS[level].includes(t.v)) {
        this.next();
        a = { k: 'bin', op: t.v, a, b: this.bin(level + 1), line: t.line };
      } else return a;
    }
  }
  unary(): Expr {
    const t = this.peek();
    if (t.t === 'op' && ['!', '-', '+', '~', '++', '--'].includes(t.v)) {
      this.next();
      return { k: 'un', op: t.v, a: this.unary(), line: t.line };
    }
    // 型別轉換 (int)x / (float)x
    if (this.is('(') && this.isType(1)) {
      let k = 1;
      while (this.isType(k)) k++;
      if (this.is(')', k)) {
        this.next();
        const type = this.type();
        this.expect(')');
        return { k: 'cast', type, a: this.unary(), line: t.line };
      }
    }
    return this.postfix();
  }
  postfix(): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (this.is('[')) { this.next(); const i = this.expr(); this.expect(']'); e = { k: 'index', a: e, i, line: t.line }; }
      else if (this.is('++') || this.is('--')) { this.next(); e = { k: 'post', op: t.v, a: e, line: t.line }; }
      else return e;
    }
  }
  args(): Expr[] {
    this.expect('(');
    const args: Expr[] = [];
    if (!this.is(')')) do args.push(this.assign()); while (this.eat(','));
    this.expect(')');
    return args;
  }
  primary(): Expr {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.n!, float: !!t.float, line: t.line };
    if (t.t === 'str') {
      let v = t.v;
      while (this.peek().t === 'str') v += this.next().v; // "a" "b" 相鄰字串合併
      return { k: 'str', v, line: t.line };
    }
    if (t.t === 'id') {
      if (this.is('.') || this.is('::') || this.is('->')) {
        this.next();
        const member = this.ident();
        return { k: 'call', obj: t.v, name: member, args: this.is('(') ? this.args() : [], line: t.line };
      }
      if (t.v === 'F' && this.is('(')) { const a = this.args(); return a[0]; } // F("...") 巨集
      if (this.is('(')) return { k: 'call', name: t.v, args: this.args(), line: t.line };
      return { k: 'id', name: t.v, line: t.line };
    }
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expect(')'); return e; }
    throw new SketchError(`這裡看不懂「${t.v || '檔案結尾'}」`, t.line);
  }
}

export function parseSketch(src: string): Program {
  const p = new Parser(lex(src)).program();
  if (!p.funcs.has('setup') && !p.funcs.has('main')) throw new SketchError('找不到 setup()（Pi 也可以寫 main()）', 1);
  return p;
}
