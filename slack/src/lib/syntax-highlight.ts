/**
 * Lightweight regex-based syntax highlighter.
 * Returns an HTML string with colored <span> elements.
 * No external dependencies.
 */

const SUPPORTED_LANGS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'javascript', 'typescript',
  'python', 'py',
  'go',
  'rust', 'rs',
  'java',
  'c', 'cpp', 'c++',
  'css',
  'html', 'xml',
  'json',
  'sql',
  'bash', 'sh', 'shell',
]);

// Colors (dark-theme safe)
const COLOR_KEYWORD  = '#c084fc'; // purple
const COLOR_STRING   = '#86efac'; // green
const COLOR_COMMENT  = '#6b7280'; // gray
const COLOR_NUMBER   = '#fb923c'; // orange
const COLOR_TAG      = '#67e8f9'; // cyan  (HTML/XML tags)
const COLOR_ATTR     = '#fbbf24'; // amber (HTML attributes)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function span(color: string, content: string): string {
  return `<span style="color:${color}">${content}</span>`;
}

/** Generic highlighter used for JS/TS/Go/Rust/Java/C/C++/Python */
function highlightGeneric(code: string, keywords: string[]): string {
  // We tokenize the code string by extracting comments, strings, and then
  // doing keyword/number replacement on the plain-text segments.

  // Token types: 'comment' | 'string' | 'plain'
  type Token = { type: 'comment' | 'string' | 'plain'; value: string };
  const tokens: Token[] = [];

  // Regex that matches (in priority order):
  //  1. Block comments  /* ... */
  //  2. Line comments   // ...
  //  3. Template strings `...`
  //  4. Double-quoted strings "..."
  //  5. Single-quoted strings '...'
  //  6. Python-style triple double-quotes """..."""
  //  7. Python-style triple single-quotes '''...'''
  //  8. Python-style # comments
  //  -- everything else is plain text
  const tokenRe = /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|(#[^\n]*)|(`(?:\\[\s\S]|[^`])*`)|("(?:\\[\s\S]|[^"])*")|('(?:\\[\s\S]|[^'])*')/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'plain', value: code.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (match[1] || match[2] || match[3]) {
      tokens.push({ type: 'comment', value: raw });
    } else {
      tokens.push({ type: 'string', value: raw });
    }
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < code.length) {
    tokens.push({ type: 'plain', value: code.slice(lastIndex) });
  }

  const kwRe = new RegExp(`\\b(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  const numRe = /\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;

  let out = '';
  for (const tok of tokens) {
    if (tok.type === 'comment') {
      out += span(COLOR_COMMENT, escapeHtml(tok.value));
    } else if (tok.type === 'string') {
      out += span(COLOR_STRING, escapeHtml(tok.value));
    } else {
      // plain text: highlight keywords and numbers
      let plain = escapeHtml(tok.value);
      plain = plain.replace(kwRe, (kw) => span(COLOR_KEYWORD, kw));
      plain = plain.replace(numRe, (n) => span(COLOR_NUMBER, n));
      out += plain;
    }
  }
  return out;
}

function highlightJson(code: string): string {
  // Tokenize JSON: strings, numbers, keywords (true/false/null), punctuation
  const out = escapeHtml(code)
    .replace(/(&quot;(?:\\.|[^&])*?&quot;)\s*:/g, (m, key) =>
      `${span(COLOR_ATTR, key)}:`)
    .replace(/:\s*(&quot;(?:\\.|[^&])*?&quot;)/g, (m, val) =>
      `: ${span(COLOR_STRING, val)}`)
    .replace(/\b(true|false|null)\b/g, (kw) => span(COLOR_KEYWORD, kw))
    .replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, (n) => span(COLOR_NUMBER, n));
  return out;
}

function highlightHtml(code: string): string {
  // Tag names and attributes
  const escaped = escapeHtml(code);
  return escaped
    // opening/closing tags  <tagname  or </tagname
    .replace(/(&lt;\/?)([\w-]+)/g, (_, bracket, name) =>
      escapeHtml(bracket) + span(COLOR_TAG, name))
    // attribute="value"  or  attribute='value'
    .replace(/([\w-]+)=((?:&quot;[^&]*?&quot;)|(?:&#039;[^&]*?&#039;))/g, (_, attr, val) =>
      span(COLOR_ATTR, attr) + '=' + span(COLOR_STRING, val))
    // HTML comments
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, (c) => span(COLOR_COMMENT, c));
}

function highlightCss(code: string): string {
  // Selectors, properties, values, comments
  return escapeHtml(code)
    .replace(/(\/\*[\s\S]*?\*\/)/g, (c) => span(COLOR_COMMENT, c))
    .replace(/([.#]?[\w-]+)\s*\{/g, (_, sel) => span(COLOR_TAG, sel) + ' {')
    .replace(/([\w-]+)\s*:/g, (_, prop) => span(COLOR_ATTR, prop) + ':')
    .replace(/:\s*([^;{}]+)/g, (m, val) => ': ' + span(COLOR_STRING, val.trim()));
}

function highlightSql(code: string): string {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'INDEX',
    'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER',
    'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'AND', 'OR', 'NOT', 'IN',
    'IS', 'NULL', 'LIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'UNION', 'ALL', 'EXISTS', 'WITH', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set',
    'delete', 'create', 'table', 'drop', 'alter', 'add', 'column', 'index',
    'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order',
    'having', 'limit', 'offset', 'as', 'distinct', 'and', 'or', 'not', 'in',
    'is', 'null', 'like', 'between', 'case', 'when', 'then', 'else', 'end',
    'union', 'all', 'exists', 'with', 'primary', 'key', 'foreign', 'references',
  ];
  return highlightGeneric(code, keywords);
}

function highlightBash(code: string): string {
  // Tokenize: # comments, strings, builtins/keywords
  const keywords = [
    'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
    'case', 'esac', 'function', 'return', 'exit', 'echo', 'export', 'local',
    'readonly', 'source', 'set', 'unset', 'shift', 'break', 'continue',
  ];
  const tokenRe = /(#[^\n]*)|((?:"""|'''|`|"|')(?:\\[\s\S]|.)*?(?:"""|'''|`|"|'))/g;
  type Token = { type: 'comment' | 'string' | 'plain'; value: string };
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'plain', value: code.slice(lastIndex, match.index) });
    }
    if (match[1]) tokens.push({ type: 'comment', value: match[0] });
    else tokens.push({ type: 'string', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < code.length) tokens.push({ type: 'plain', value: code.slice(lastIndex) });

  const kwRe = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  const numRe = /\b(\d+)\b/g;
  let out = '';
  for (const tok of tokens) {
    if (tok.type === 'comment') out += span(COLOR_COMMENT, escapeHtml(tok.value));
    else if (tok.type === 'string') out += span(COLOR_STRING, escapeHtml(tok.value));
    else {
      let plain = escapeHtml(tok.value);
      plain = plain.replace(kwRe, (kw) => span(COLOR_KEYWORD, kw));
      plain = plain.replace(numRe, (n) => span(COLOR_NUMBER, n));
      out += plain;
    }
  }
  return out;
}

const JS_TS_KEYWORDS = [
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'import', 'export', 'from', 'class', 'async', 'await', 'try', 'catch',
  'throw', 'new', 'this', 'null', 'undefined', 'true', 'false', 'typeof',
  'instanceof', 'in', 'of', 'switch', 'case', 'break', 'continue', 'default',
  'do', 'delete', 'void', 'yield', 'extends', 'super', 'static', 'type',
  'interface', 'enum', 'namespace', 'abstract', 'implements', 'declare',
];

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
];

const GO_KEYWORDS = [
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var', 'nil', 'true', 'false', 'error',
];

const RUST_KEYWORDS = [
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
  'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let',
  'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self',
  'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe',
  'use', 'where', 'while', 'None', 'Some', 'Ok', 'Err',
];

const JAVA_KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'null', 'true', 'false',
];

const C_KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int',
  'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile',
  'while', 'null', 'NULL', 'true', 'false', 'bool', 'class', 'new', 'delete',
  'this', 'public', 'private', 'protected', 'virtual', 'namespace', 'using',
  'template', 'typename',
];

/**
 * Highlight `code` for the given `lang`.
 * Returns an HTML string safe to set as innerHTML.
 * Falls back to HTML-escaped plain text for unknown languages.
 */
export function highlightCode(code: string, lang: string): string {
  const l = lang.toLowerCase().trim();

  if (!SUPPORTED_LANGS.has(l) && l !== '') {
    // Unknown language — just escape
    return escapeHtml(code);
  }

  switch (l) {
    case 'json':
      return highlightJson(code);
    case 'html':
    case 'xml':
      return highlightHtml(code);
    case 'css':
      return highlightCss(code);
    case 'sql':
      return highlightSql(code);
    case 'bash':
    case 'sh':
    case 'shell':
      return highlightBash(code);
    case 'python':
    case 'py':
      return highlightGeneric(code, PYTHON_KEYWORDS);
    case 'go':
      return highlightGeneric(code, GO_KEYWORDS);
    case 'rust':
    case 'rs':
      return highlightGeneric(code, RUST_KEYWORDS);
    case 'java':
      return highlightGeneric(code, JAVA_KEYWORDS);
    case 'c':
    case 'cpp':
    case 'c++':
      return highlightGeneric(code, C_KEYWORDS);
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'javascript':
    case 'typescript':
    default:
      return highlightGeneric(code, JS_TS_KEYWORDS);
  }
}
