import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // Return domain-based fallback so the UI can still show a basic preview
      const domain = new URL(url).hostname.replace('www.', '');
      return NextResponse.json({
        title: domain,
        description: null,
        image: null,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      });
    }

    const html = await res.text();

    function extractMeta(property: string): string | null {
      // og:property via property= attribute
      const ogProp =
        html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, 'i'));
      if (ogProp) return ogProp[1];

      // og:property via name= attribute (some sites use name instead of property)
      const ogName =
        html.match(new RegExp(`<meta[^>]+name=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']og:${property}["']`, 'i'));
      if (ogName) return ogName[1];

      // twitter:property fallback
      const twitter =
        html.match(new RegExp(`<meta[^>]+(?:name|property)=["']twitter:${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:${property}["']`, 'i'));
      if (twitter) return twitter[1];

      return null;
    }

    function extractTitle(): string | null {
      const ogTitle = extractMeta('title');
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return titleMatch ? titleMatch[1].trim() : null;
    }

    function extractDescription(): string | null {
      const ogDesc = extractMeta('description');
      if (ogDesc) return ogDesc;
      // Fallback to <meta name="description">
      const descMatch =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      return descMatch ? descMatch[1] : null;
    }

    const title = extractTitle();
    const description = extractDescription();
    let image = extractMeta('image');

    // Resolve relative image URLs
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, url).href;
      } catch { /* ignore invalid URLs */ }
    }

    return NextResponse.json({ title, description, image });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch OG data' }, { status: 502 });
  }
}
