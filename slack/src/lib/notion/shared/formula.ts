import { FORMULA_MAX_DEPTH } from './constants';
import type { FormulaResult } from './database';

// ============================================================
// AST Node Types
// ============================================================

export type FormulaNode =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'property'; name: string }
  | { type: 'function'; name: string; args: FormulaNode[] }
  | { type: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
  | { type: 'unary'; op: string; operand: FormulaNode }
  | { type: 'conditional'; condition: FormulaNode; ifTrue: FormulaNode; ifFalse: FormulaNode };

// ============================================================
// Parser
// ============================================================

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

class Lexer {
  private pos = 0;

  constructor(private readonly input: string) {}

  peek(): string | null {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return null;
    return this.input[this.pos] ?? null;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos]!)) {
      this.pos++;
    }
  }

  readIdentifier(): string {
    this.skipWhitespace();
    const start = this.pos;
    while (this.pos < this.input.length && /[a-zA-Z_][a-zA-Z0-9_]*/.test(this.input[this.pos]!)) {
      this.pos++;
    }
    if (this.pos === start) throw new ParseError(`Expected identifier at position ${this.pos}`);
    return this.input.slice(start, this.pos);
  }

  readNumber(): number {
    this.skipWhitespace();
    const start = this.pos;
    if (this.input[this.pos] === '-') this.pos++;
    while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos]!)) {
      this.pos++;
    }
    if (this.pos < this.input.length && this.input[this.pos] === '.') {
      this.pos++;
      while (this.pos < this.input.length && /[0-9]/.test(this.input[this.pos]!)) {
        this.pos++;
      }
    }
    const s = this.input.slice(start, this.pos);
    const n = parseFloat(s);
    if (isNaN(n)) throw new ParseError(`Invalid number at position ${start}`);
    return n;
  }

  readString(): string {
    this.skipWhitespace();
    const quote = this.input[this.pos];
    if (quote !== '"' && quote !== "'") throw new ParseError(`Expected string at position ${this.pos}`);
    this.pos++; // consume opening quote
    let result = '';
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === '\\') {
        this.pos++;
        const esc = this.input[this.pos];
        switch (esc) {
          case '"': result += '"'; break;
          case "'": result += "'"; break;
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case '\\': result += '\\'; break;
          default: result += esc;
        }
        this.pos++;
      } else if (ch === quote) {
        this.pos++;
        return result;
      } else {
        result += ch;
        this.pos++;
      }
    }
    throw new ParseError('Unterminated string literal');
  }

  consume(expected: string): void {
    this.skipWhitespace();
    if (!this.input.startsWith(expected, this.pos)) {
      throw new ParseError(`Expected '${expected}' at position ${this.pos}, got '${this.input.slice(this.pos, this.pos + expected.length)}'`);
    }
    this.pos += expected.length;
  }

  tryConsume(token: string): boolean {
    this.skipWhitespace();
    if (this.input.startsWith(token, this.pos)) {
      // For word tokens like 'and', 'or', 'not' — must not be followed by alphanumeric
      if (/^[a-z]/.test(token)) {
        const after = this.input[this.pos + token.length];
        if (after && /[a-zA-Z0-9_]/.test(after)) return false;
      }
      this.pos += token.length;
      return true;
    }
    return false;
  }

  peekIs(token: string): boolean {
    this.skipWhitespace();
    if (!this.input.startsWith(token, this.pos)) return false;
    if (/^[a-z]/.test(token)) {
      const after = this.input[this.pos + token.length];
      if (after && /[a-zA-Z0-9_]/.test(after)) return false;
    }
    return true;
  }

  isDigit(): boolean {
    this.skipWhitespace();
    const ch = this.input[this.pos];
    return ch !== undefined && /[0-9]/.test(ch);
  }

  isString(): boolean {
    this.skipWhitespace();
    const ch = this.input[this.pos];
    return ch === '"' || ch === "'";
  }

  isIdentifier(): boolean {
    this.skipWhitespace();
    const ch = this.input[this.pos];
    return ch !== undefined && /[a-zA-Z_]/.test(ch);
  }

  atEnd(): boolean {
    this.skipWhitespace();
    return this.pos >= this.input.length;
  }
}

class Parser {
  constructor(private readonly lexer: Lexer) {}

  parse(): FormulaNode {
    const node = this.parseOr();
    if (!this.lexer.atEnd()) {
      throw new ParseError(`Unexpected characters at end of expression`);
    }
    return node;
  }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.lexer.tryConsume('or')) {
      const right = this.parseAnd();
      left = { type: 'binary', op: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): FormulaNode {
    let left = this.parseNot();
    while (this.lexer.tryConsume('and')) {
      const right = this.parseNot();
      left = { type: 'binary', op: 'and', left, right };
    }
    return left;
  }

  private parseNot(): FormulaNode {
    if (this.lexer.tryConsume('not')) {
      return { type: 'unary', op: 'not', operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): FormulaNode {
    let left = this.parseAddSub();
    const ops = ['==', '!=', '>=', '<=', '>', '<'];
    for (const op of ops) {
      if (this.lexer.tryConsume(op)) {
        const right = this.parseAddSub();
        return { type: 'binary', op, left, right };
      }
    }
    return left;
  }

  private parseAddSub(): FormulaNode {
    let left = this.parseMulDiv();
    while (true) {
      if (this.lexer.tryConsume('+')) {
        left = { type: 'binary', op: '+', left, right: this.parseMulDiv() };
      } else if (this.lexer.tryConsume('-')) {
        left = { type: 'binary', op: '-', left, right: this.parseMulDiv() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMulDiv(): FormulaNode {
    let left = this.parseUnaryMinus();
    while (true) {
      if (this.lexer.tryConsume('*')) {
        left = { type: 'binary', op: '*', left, right: this.parseUnaryMinus() };
      } else if (this.lexer.tryConsume('/')) {
        left = { type: 'binary', op: '/', left, right: this.parseUnaryMinus() };
      } else if (this.lexer.tryConsume('%')) {
        left = { type: 'binary', op: '%', left, right: this.parseUnaryMinus() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnaryMinus(): FormulaNode {
    if (this.lexer.tryConsume('-')) {
      return { type: 'unary', op: '-', operand: this.parseAtom() };
    }
    return this.parseAtom();
  }

  private parseAtom(): FormulaNode {
    // Parenthesised expression
    if (this.lexer.tryConsume('(')) {
      const node = this.parseOr();
      this.lexer.consume(')');
      return node;
    }

    // Boolean literals
    if (this.lexer.tryConsume('true')) {
      return { type: 'literal', value: true };
    }
    if (this.lexer.tryConsume('false')) {
      return { type: 'literal', value: false };
    }

    // String literal
    if (this.lexer.isString()) {
      return { type: 'literal', value: this.lexer.readString() };
    }

    // Number literal
    if (this.lexer.isDigit()) {
      return { type: 'literal', value: this.lexer.readNumber() };
    }

    // Identifier: function call or keyword
    if (this.lexer.isIdentifier()) {
      const name = this.lexer.readIdentifier();

      // prop("Property Name") — property reference
      if (name === 'prop') {
        this.lexer.consume('(');
        const propName = this.lexer.readString();
        this.lexer.consume(')');
        return { type: 'property', name: propName };
      }

      // if(condition, ifTrue, ifFalse) — ternary
      if (name === 'if') {
        this.lexer.consume('(');
        const condition = this.parseOr();
        this.lexer.consume(',');
        const ifTrue = this.parseOr();
        this.lexer.consume(',');
        const ifFalse = this.parseOr();
        this.lexer.consume(')');
        return { type: 'conditional', condition, ifTrue, ifFalse };
      }

      // Function call
      if (this.lexer.tryConsume('(')) {
        const args: FormulaNode[] = [];
        if (!this.lexer.peekIs(')')) {
          args.push(this.parseOr());
          while (this.lexer.tryConsume(',')) {
            args.push(this.parseOr());
          }
        }
        this.lexer.consume(')');
        return { type: 'function', name, args };
      }

      // Bare identifier (unexpected)
      throw new ParseError(`Unexpected identifier '${name}' — use prop("Name") for property references`);
    }

    const ch = this.lexer.peek();
    throw new ParseError(`Unexpected character '${ch}' in formula`);
  }
}

/**
 * Parse a formula expression string into an AST.
 * Throws ParseError on syntax errors.
 */
export function parseFormula(expression: string): FormulaNode {
  const lexer = new Lexer(expression.trim());
  return new Parser(lexer).parse();
}

// ============================================================
// Evaluator
// ============================================================

export interface EvalContext {
  /** property name → resolved value from the row */
  properties: Record<string, unknown>;
}

type ScalarValue = string | number | boolean | null | undefined;

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function toString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v === null || v === undefined) return false;
  return true;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function wrapResult(v: unknown): FormulaResult {
  if (typeof v === 'string') return { type: 'string', value: v };
  if (typeof v === 'number') return { type: 'number', value: v };
  if (typeof v === 'boolean') return { type: 'boolean', value: v };
  if (v === null || v === undefined) return { type: 'string', value: '' };
  if (typeof v === 'object' && 'type' in (v as object) && 'value' in (v as object)) {
    return v as FormulaResult;
  }
  return { type: 'string', value: toString(v) };
}

/** Median of a sorted numeric array */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

type BuiltinFn = (args: ScalarValue[]) => ScalarValue;

const BUILTINS: Record<string, BuiltinFn> = {
  // Math
  abs: ([n]) => Math.abs(toNumber(n)),
  ceil: ([n]) => Math.ceil(toNumber(n)),
  floor: ([n]) => Math.floor(toNumber(n)),
  round: ([n]) => Math.round(toNumber(n)),
  min: (args) => Math.min(...args.map(toNumber)),
  max: (args) => Math.max(...args.map(toNumber)),
  pow: ([base, exp]) => Math.pow(toNumber(base), toNumber(exp)),
  sqrt: ([n]) => Math.sqrt(toNumber(n)),
  sign: ([n]) => Math.sign(toNumber(n)),

  // String
  concat: (args) => args.map(toString).join(''),
  contains: ([str, sub]) => toString(str).includes(toString(sub)),
  length: ([str]) => toString(str).length,
  replace: ([str, from, to]) => toString(str).replace(toString(from), toString(to)),
  replaceAll: ([str, from, to]) => toString(str).split(toString(from)).join(toString(to)),
  lower: ([str]) => toString(str).toLowerCase(),
  upper: ([str]) => toString(str).toUpperCase(),
  trim: ([str]) => toString(str).trim(),
  slice: ([str, start, end]) => {
    const s = toString(str);
    const si = toNumber(start);
    const ei = end !== undefined && end !== null ? toNumber(end) : undefined;
    return ei !== undefined ? s.slice(si, ei) : s.slice(si);
  },

  // Date
  now: () => new Date().toISOString(),
  dateAdd: ([date, amount, unit]) => {
    const d = new Date(toString(date));
    const n = toNumber(amount);
    const u = toString(unit);
    switch (u) {
      case 'years': d.setFullYear(d.getFullYear() + n); break;
      case 'months': d.setMonth(d.getMonth() + n); break;
      case 'weeks': d.setDate(d.getDate() + n * 7); break;
      case 'days': d.setDate(d.getDate() + n); break;
      case 'hours': d.setHours(d.getHours() + n); break;
      case 'minutes': d.setMinutes(d.getMinutes() + n); break;
    }
    return d.toISOString();
  },
  dateSubtract: ([date, amount, unit]) => {
    const d = new Date(toString(date));
    const n = toNumber(amount);
    const u = toString(unit);
    switch (u) {
      case 'years': d.setFullYear(d.getFullYear() - n); break;
      case 'months': d.setMonth(d.getMonth() - n); break;
      case 'weeks': d.setDate(d.getDate() - n * 7); break;
      case 'days': d.setDate(d.getDate() - n); break;
      case 'hours': d.setHours(d.getHours() - n); break;
      case 'minutes': d.setMinutes(d.getMinutes() - n); break;
    }
    return d.toISOString();
  },
  dateBetween: ([date1, date2, unit]) => {
    const d1 = new Date(toString(date1)).getTime();
    const d2 = new Date(toString(date2)).getTime();
    const diffMs = d1 - d2;
    const u = toString(unit);
    switch (u) {
      case 'years': return diffMs / (1000 * 60 * 60 * 24 * 365.25);
      case 'months': return diffMs / (1000 * 60 * 60 * 24 * 30.44);
      case 'weeks': return diffMs / (1000 * 60 * 60 * 24 * 7);
      case 'days': return diffMs / (1000 * 60 * 60 * 24);
      case 'hours': return diffMs / (1000 * 60 * 60);
      case 'minutes': return diffMs / (1000 * 60);
      default: return diffMs;
    }
  },
  formatDate: ([date, format]) => {
    const d = new Date(toString(date));
    const fmt = toString(format);
    return fmt
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(d.getDate()).padStart(2, '0'))
      .replace('HH', String(d.getHours()).padStart(2, '0'))
      .replace('mm', String(d.getMinutes()).padStart(2, '0'))
      .replace('ss', String(d.getSeconds()).padStart(2, '0'));
  },

  // Logic
  empty: ([v]) => isEmpty(v),
  not: ([v]) => !toBoolean(v),
  and: ([a, b]) => toBoolean(a) && toBoolean(b),
  or: ([a, b]) => toBoolean(a) || toBoolean(b),

  // Type conversion
  toNumber: ([v]) => toNumber(v),
  format: ([v]) => toString(v),
};

function evaluateNode(node: FormulaNode, ctx: EvalContext, depth: number): ScalarValue {
  if (depth > FORMULA_MAX_DEPTH) {
    throw new Error(`Maximum formula depth (${FORMULA_MAX_DEPTH}) exceeded`);
  }

  switch (node.type) {
    case 'literal':
      return node.value;

    case 'property': {
      const val = ctx.properties[node.name];
      if (val === undefined) return null;
      // Unwrap PropertyValue shapes ({ type, value }) if present
      if (val !== null && typeof val === 'object' && 'value' in (val as object)) {
        return (val as { value: ScalarValue }).value;
      }
      return val as ScalarValue;
    }

    case 'unary': {
      const operand = evaluateNode(node.operand, ctx, depth + 1);
      switch (node.op) {
        case '-': return -toNumber(operand);
        case 'not': return !toBoolean(operand);
        default: throw new Error(`Unknown unary operator '${node.op}'`);
      }
    }

    case 'binary': {
      const left = evaluateNode(node.left, ctx, depth + 1);
      const right = evaluateNode(node.right, ctx, depth + 1);
      switch (node.op) {
        case '+': {
          if (typeof left === 'string' || typeof right === 'string') {
            return toString(left) + toString(right);
          }
          return toNumber(left) + toNumber(right);
        }
        case '-': return toNumber(left) - toNumber(right);
        case '*': return toNumber(left) * toNumber(right);
        case '/': {
          const r = toNumber(right);
          if (r === 0) throw new Error('Division by zero');
          return toNumber(left) / r;
        }
        case '%': {
          const r = toNumber(right);
          if (r === 0) throw new Error('Modulo by zero');
          return toNumber(left) % r;
        }
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return toNumber(left) > toNumber(right);
        case '<': return toNumber(left) < toNumber(right);
        case '>=': return toNumber(left) >= toNumber(right);
        case '<=': return toNumber(left) <= toNumber(right);
        case 'and': return toBoolean(left) && toBoolean(right);
        case 'or': return toBoolean(left) || toBoolean(right);
        default: throw new Error(`Unknown binary operator '${node.op}'`);
      }
    }

    case 'conditional': {
      const cond = evaluateNode(node.condition, ctx, depth + 1);
      return toBoolean(cond)
        ? evaluateNode(node.ifTrue, ctx, depth + 1)
        : evaluateNode(node.ifFalse, ctx, depth + 1);
    }

    case 'function': {
      const fn = BUILTINS[node.name];
      if (!fn) throw new Error(`Unknown function '${node.name}'`);
      const args: ScalarValue[] = node.args.map((arg) => evaluateNode(arg, ctx, depth + 1));
      return fn(args);
    }

    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Evaluate a parsed formula AST against a row's property values.
 * Never throws — returns { type: 'error', value: message } instead.
 */
export function evaluateFormula(node: FormulaNode, ctx: EvalContext, depth = 0): FormulaResult {
  try {
    const result = evaluateNode(node, ctx, depth);
    return wrapResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', value: message };
  }
}

// Re-export median for use in rollup computation
export { median };
