// Document MCP provider — PDF/DOCX/PPTX parsing via MarkItDown microservice

const MARKITDOWN_URL = process.env.MARKITDOWN_URL || "http://localhost:8300";

export async function convert(params: {
  url: string;
  page?: number;
  search?: string;
}): Promise<string> {
  if (!params.url) return "File URL is required.";

  try {
    const res = await fetch(`${MARKITDOWN_URL}/convert/url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: params.url,
        page: params.page ? Number(params.page) : undefined,
        search: params.search,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return `Failed to convert document: ${err.detail || res.statusText}`;
    }

    const data = await res.json();

    let output = `**${data.title}** (${data.pages} pages, ${Math.round(data.char_count / 1000)}K chars)\n\n`;

    if (params.page) {
      output += `_Page ${params.page}_\n\n`;
    }

    // Truncate markdown if too long for LLM context
    const maxChars = 6000;
    if (data.markdown.length > maxChars) {
      output += data.markdown.slice(0, maxChars);
      output += `\n\n... (truncated, ${data.char_count - maxChars} chars remaining. Use page= or search= to read specific parts)`;
    } else {
      output += data.markdown;
    }

    if (data.search_results?.length) {
      output += `\n\n**Search results for "${params.search}" (${data.search_results.length} matches):**\n`;
      for (const r of data.search_results.slice(0, 5)) {
        output += `\nLine ${r.line}:\n${r.context}\n`;
      }
    }

    return output;
  } catch (err) {
    return `Document service unavailable: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function metadata(params: { url: string }): Promise<string> {
  if (!params.url) return "File URL is required.";

  try {
    const res = await fetch(`${MARKITDOWN_URL}/metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: params.url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return `Failed to get metadata: ${err.detail || res.statusText}`;
    }

    const data = await res.json();

    let output = `**${data.title}**\nPages: ${data.pages} | Characters: ${data.char_count}\n`;
    if (data.sections.length > 0) {
      output += `\n**Sections:**\n${data.sections.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}`;
    }

    return output;
  } catch (err) {
    return `Document service unavailable: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function search(params: {
  url: string;
  query: string;
}): Promise<string> {
  if (!params.url || !params.query) return "url and query are required.";

  try {
    const res = await fetch(`${MARKITDOWN_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: params.url, query: params.query }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return `Search failed: ${err.detail || res.statusText}`;
    }

    const data = await res.json();

    if (data.count === 0) return `No results found for "${params.query}" in this document.`;

    let output = `**Search: "${params.query}" (${data.count} results)**\n\n`;
    for (const r of data.results) {
      output += `**Line ${r.line}:**\n${r.context}\n\n`;
    }

    return output;
  } catch (err) {
    return `Document service unavailable: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}
