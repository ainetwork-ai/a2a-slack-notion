const GAMMA_API = "https://gamma-api.polymarket.com";

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  volume: number;
  liquidity: number;
  markets: PolymarketMarket[];
}

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  outcomes: string;
}

export async function trending(params: { limit?: number }): Promise<string> {
  const limit = params.limit || 5;
  try {
    const res = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&order=volume&ascending=false&limit=${limit}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
    const events: PolymarketEvent[] = await res.json();

    if (events.length === 0) return "No trending markets found.";

    const lines = events.map((e, i) => {
      const vol = e.volume ? `$${(e.volume / 1_000_000).toFixed(1)}M` : "N/A";
      const marketLines = (e.markets || []).slice(0, 3).map((m) => {
        const prices = parseOutcomePrices(m.outcomePrices);
        const outcomes = parseOutcomes(m.outcomes);
        const oddsStr = outcomes
          .map((o, idx) => `${o}: ${((prices[idx] || 0) * 100).toFixed(0)}%`)
          .join(" / ");
        return `   • ${m.question} — ${oddsStr}`;
      });
      return `**${i + 1}. ${e.title}** (Vol: ${vol})\n${marketLines.join("\n")}`;
    });

    return `📊 **Trending on Polymarket**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to fetch trending markets: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function search(params: { query: string; limit?: number }): Promise<string> {
  const limit = params.limit || 5;
  try {
    const res = await fetch(
      `${GAMMA_API}/events?active=true&closed=false&title=${encodeURIComponent(params.query)}&limit=${limit}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
    const events: PolymarketEvent[] = await res.json();

    if (events.length === 0) return `No markets found for "${params.query}".`;

    const lines = events.map((e, i) => {
      const vol = e.volume ? `$${(e.volume / 1_000_000).toFixed(1)}M` : "N/A";
      const marketLines = (e.markets || []).slice(0, 3).map((m) => {
        const prices = parseOutcomePrices(m.outcomePrices);
        const outcomes = parseOutcomes(m.outcomes);
        const oddsStr = outcomes
          .map((o, idx) => `${o}: ${((prices[idx] || 0) * 100).toFixed(0)}%`)
          .join(" / ");
        return `   • ${m.question} — ${oddsStr}`;
      });
      return `**${i + 1}. ${e.title}** (Vol: ${vol})\n${marketLines.join("\n")}`;
    });

    return `📊 **Polymarket: "${params.query}"**\n\n${lines.join("\n\n")}`;
  } catch (err) {
    return `Failed to search markets: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export async function market(params: { id: string }): Promise<string> {
  try {
    const res = await fetch(`${GAMMA_API}/markets/${params.id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
    const m: PolymarketMarket = await res.json();

    const prices = parseOutcomePrices(m.outcomePrices);
    const outcomes = parseOutcomes(m.outcomes);
    const oddsStr = outcomes
      .map((o, idx) => `**${o}**: ${((prices[idx] || 0) * 100).toFixed(1)}%`)
      .join(" / ");
    const vol = m.volume ? `$${(m.volume / 1_000_000).toFixed(2)}M` : "N/A";

    return `📊 **${m.question}**\n\n${oddsStr}\n\nVolume: ${vol} | Liquidity: $${((m.liquidity || 0) / 1_000_000).toFixed(2)}M\nStatus: ${m.closed ? "Closed" : m.active ? "Active" : "Inactive"}\nhttps://polymarket.com/event/${m.slug}`;
  } catch (err) {
    return `Failed to fetch market: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

function parseOutcomePrices(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

function parseOutcomes(raw: string | undefined): string[] {
  if (!raw) return ["Yes", "No"];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ["Yes", "No"];
  } catch {
    return ["Yes", "No"];
  }
}
