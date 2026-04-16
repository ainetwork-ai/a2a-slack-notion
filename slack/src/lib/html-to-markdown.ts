/**
 * Convert HTML clipboard content to Markdown.
 * Used for rich text paste handling in MessageInput.
 */
export function htmlToMarkdown(html: string): string {
  // Work on a temporary element if available (browser only)
  // In SSR context this won't be called, but guard anyway
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  return nodeToMarkdown(container).trim();
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = () => Array.from(el.childNodes).map(nodeToMarkdown).join('');

  switch (tag) {
    case 'b':
    case 'strong': {
      const inner = children().trim();
      return inner ? `*${inner}*` : '';
    }
    case 'i':
    case 'em': {
      const inner = children().trim();
      return inner ? `_${inner}_` : '';
    }
    case 'code': {
      const inner = children().trim();
      return inner ? `\`${inner}\`` : '';
    }
    case 'pre': {
      const inner = el.textContent ?? '';
      return inner.trim() ? `\`\`\`\n${inner.trim()}\n\`\`\`` : '';
    }
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      // Just return the URL — keeps it simple for a chat input
      return href || children();
    }
    case 'br':
      return '\n';
    case 'p': {
      const inner = children();
      return inner ? `${inner}\n\n` : '\n';
    }
    case 'div': {
      const inner = children();
      // Only add newline if there's content and it doesn't already end in one
      if (!inner) return '';
      return inner.endsWith('\n') ? inner : `${inner}\n`;
    }
    case 'ul': {
      const items = Array.from(el.querySelectorAll(':scope > li')).map(li => {
        const text = nodeToMarkdown(li).trim();
        return `• ${text}`;
      });
      return items.join('\n') + '\n';
    }
    case 'ol': {
      const items = Array.from(el.querySelectorAll(':scope > li')).map((li, i) => {
        const text = nodeToMarkdown(li).trim();
        return `${i + 1}. ${text}`;
      });
      return items.join('\n') + '\n';
    }
    case 'li':
      return children();
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const inner = children().trim();
      return inner ? `*${inner}*\n` : '\n';
    }
    case 'blockquote': {
      const inner = children().trim();
      return inner ? `> ${inner}\n` : '';
    }
    case 'hr':
      return '\n---\n';
    case 'span':
    case 'label':
    case 'td':
    case 'th':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'aside':
    case 'nav':
    case 'figure':
    case 'figcaption':
      return children();
    case 'tr': {
      const inner = children();
      return inner ? `${inner}\n` : '';
    }
    case 'table':
      return children();
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return children();
    case 'script':
    case 'style':
    case 'head':
    case 'meta':
    case 'link':
      return '';
    default:
      return children();
  }
}

/**
 * Normalize excess whitespace/newlines produced during conversion.
 */
export function normalizeMarkdown(md: string): string {
  return md
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines to 2
    .trim();
}
