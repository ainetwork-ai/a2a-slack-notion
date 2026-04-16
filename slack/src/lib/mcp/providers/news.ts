// Google News RSS-based provider (no API key required)

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

const GOOGLE_NEWS_RSS = "https://news.google.com/rss";

// Detect if query contains CJK characters (Korean, Chinese, Japanese)
function detectLocale(query: string): { hl: string; gl: string } {
  if (/[\uAC00-\uD7AF\u3131-\u3163]/.test(query)) return { hl: "ko", gl: "KR" };
  if (/[\u4E00-\u9FFF]/.test(query)) return { hl: "zh-CN", gl: "CN" };
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(query)) return { hl: "ja", gl: "JP" };
  return { hl: "en", gl: "US" };
}

export async function search(params: { query: string; limit?: number }): Promise<string> {
  const limit = params.limit || 5;
  try {
    const { hl, gl } = detectLocale(params.query);
    const url = `${GOOGLE_NEWS_RSS}/search?q=${encodeURIComponent(params.query)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`;
    const items = await fetchRss(url, limit);

    if (items.length === 0) return `No news found for "${params.query}".`;

    const lines = items.map(
      (item, i) =>
        `**${i + 1}. ${item.title}**\n   ${item.source} · ${item.pubDate}\n   ${item.link}`
    );

    return `📰 **News: "${params.query}"**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to search news: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function trending(params: { geo?: string; limit?: number }): Promise<string> {
  const limit = params.limit || 5;
  const geo = params.geo || "US";
  const hl = geo === "KR" ? "ko" : "en";
  try {
    const url = `${GOOGLE_NEWS_RSS}?hl=${hl}&gl=${geo}&ceid=${geo}:${hl}`;
    const items = await fetchRss(url, limit);

    if (items.length === 0) return "No trending news found.";

    const lines = items.map(
      (item, i) =>
        `**${i + 1}. ${item.title}**\n   ${item.source} · ${item.pubDate}\n   ${item.link}`
    );

    return `📰 **Trending News (${geo})**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to fetch trending news: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

const TOPIC_MAP: Record<string, string> = {
  world: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB",
  nation: "CAAqIggKIhxDQkFTRHdvSkwyMHZNRGxqTjNjd0VnSmxiaWdBUAE",
  business: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB",
  technology: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB",
  science: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB",
  sports: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB",
  health: "CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ",
  entertainment: "CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB",
};

export async function topic(params: { topic: string; limit?: number }): Promise<string> {
  const limit = params.limit || 5;
  const topicKey = params.topic.toLowerCase();
  const topicId = TOPIC_MAP[topicKey];

  if (!topicId) {
    const available = Object.keys(TOPIC_MAP).join(", ");
    return `Unknown topic "${params.topic}". Available: ${available}`;
  }

  try {
    const url = `${GOOGLE_NEWS_RSS}/topics/${topicId}?hl=en&gl=US&ceid=US:en`;
    const items = await fetchRss(url, limit);

    if (items.length === 0) return `No ${topicKey} news found.`;

    const lines = items.map(
      (item, i) =>
        `**${i + 1}. ${item.title}**\n   ${item.source} · ${item.pubDate}\n   ${item.link}`
    );

    return `📰 **${topicKey.charAt(0).toUpperCase() + topicKey.slice(1)} News**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to fetch topic news: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

async function fetchRss(url: string, limit: number): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SlackA2A/1.0)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Google News RSS error: ${res.status}`);

  const xml = await res.text();
  return parseRssItems(xml, limit);
}

function parseRssItems(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const source = extractTag(block, "source");

    if (title) {
      items.push({
        title: decodeHtmlEntities(title),
        link: link || "",
        source: source ? decodeHtmlEntities(source) : "Unknown",
        pubDate: pubDate ? formatDate(pubDate) : "",
      });
    }
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
  return match ? match[1].trim() : null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}
