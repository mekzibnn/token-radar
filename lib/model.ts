// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
// All figures derived exclusively from the snapshot figures (TVL, change_7d, listed_at, categories, chains).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  longevity_weight: number;
  longevity_cap_years: number;
  category_weight: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.12,
  growth_weight: 0.3,
  longevity_weight: 0.08,
  longevity_cap_years: 3,
  category_weight: 0.15,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-v2-log';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 700;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 48;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'live';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    longevity_multiplier: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  longevity_multiplier: number;
  category_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Calculate median implied-value-per-log-TVL for each category. */
function getCategoryStrengths(scored: {p: SnapshotProtocol, baseStrength: number}[]): {
  categoryMedians: Map<string, number>,
  globalMedian: number
} {
  const categories = new Map<string, number[]>();
  for (const {p, baseStrength} of scored) {
    const cat = p.category ?? 'Other';
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(baseStrength);
  }
  const medians = new Map<string, number>();
  const allStrengths: number[] = [];
  for (const [cat, strengths] of categories) {
    strengths.sort((a, b) => a - b);
    const mid = Math.floor(strengths.length / 2);
    const median = strengths.length % 2 !== 0 ? strengths[mid]! : (strengths[mid - 1]! + strengths[mid]!) / 2;
    medians.set(cat, median);
    allStrengths.push(median);
  }
  
  allStrengths.sort((a, b) => a - b);
  const mid = Math.floor(allStrengths.length / 2);
  const globalMedian = allStrengths.length % 2 !== 0 ? allStrengths[mid]! : (allStrengths[mid - 1]! + allStrengths[mid]!) / 2;
  
  return { categoryMedians: medians, globalMedian };
}

/**
 * Implied Value Model v2 (Radar-v2-log):
 * 1. Log-scaled TVL base: uses log10(TVL) to anchor valuation.
 * 2. Damped Growth: Uses sign(g) * log1p(abs(g)) to normalize growth spikes.
 * 3. Longevity Bonus: Linear bonus for age up to longevity_cap_years.
 * 4. Category Relative Factor: Multiplier based on category strength.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  categoryMult: number = 1.0,
): { implied: number; growthPct: number; growthMult: number; longevityMult: number; categoryMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);

  // 1. Log-scaled TVL base
  const logTvl = Math.log10(Math.max(1, protocol.tvl_usd));

  // 2. Growth Multiplier with damping
  const growthDamping = rawGrowth >= 0 ? Math.log1p(rawGrowth / 100) : -Math.log1p(Math.abs(rawGrowth) / 100);
  const growthMult = 1 + growthDamping * model.growth_weight;

  // 3. Longevity Bonus
  const ageYears = (age ?? 365) / 365;
  const longevityMult = 1 + Math.min(ageYears, model.longevity_cap_years) * model.longevity_weight;

  // Final Implied Value
  // Anchor on TVL, but scale it so it's not purely linear (TVL is often "rented" capital).
  const base = protocol.tvl_usd * model.base_multiple;
  // logModifier normalizes around $100M TVL (log10(1e8)=8)
  const logModifier = logTvl / 8; 
  const implied = Math.max(1, Math.round(base * logModifier * growthMult * longevityMult * categoryMult));

  return { implied, growthPct: rawGrowth, growthMult, longevityMult, categoryMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  // First pass: calculate base implied values without category factor
  const baseScored = [...chosen.values()].map((p) => {
    const logTvl = Math.log10(Math.max(1, p.tvl_usd));
    const { implied } = impliedValue(p, snapshot.as_of, model, 1.0);
    const baseStrength = implied / logTvl;
    return { p, baseStrength };
  });

  const { categoryMedians, globalMedian } = getCategoryStrengths(baseScored);

  // Second pass: apply category factor
  const scored = baseScored.map(({p, baseStrength}) => {
    const catMedian = categoryMedians.get(p.category ?? 'Other') ?? globalMedian;
    let categoryMult = catMedian / globalMedian;
    categoryMult = Math.max(0.7, Math.min(1.4, categoryMult));
    
    const { implied, growthPct, growthMult, longevityMult, age } = impliedValue(p, snapshot.as_of, model, categoryMult);
    return { p, implied, growthPct, growthMult, longevityMult, categoryMult, age };
  });

  // Sort by implied value desc, then slug.
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: isPreToken(s.p) ? 'pre-token' : 'live',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      longevity_multiplier: round4(s.longevityMult),
      category_multiplier: round4(s.categoryMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Follow the official guide.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its primary network';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 100_000_000) return 200;
  return 100;
}

/**
 * Enhanced farm plans with category-specific steps and realistic cost/time estimates.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;

  const steps: FarmStep[] = [
    {
      text: `Prepare a dedicated EOA wallet on ${chain} with enough native gas tokens and $${capital} in stablecoins.`,
      cost: `$${Math.round(capital * 1.02)} total`,
      time: '10 minutes',
    },
  ];

  if (cat.includes('lend') || cat.includes('cdp')) {
    steps.push(
      { text: `Deposit $${capital} of USDC into the ${name} main market to establish a base collateral position.`, cost: '$5-$15 in gas', time: '5 minutes' },
      { text: `Borrow a small amount (e.g., $20) of a volatile asset against your collateral to increase activity score.`, cost: '$10 in gas', time: '5 minutes' },
      { text: `Maintain a Health Factor above 1.5 and repay the loan after 14 days to recover your full collateral.`, cost: 'Interest + $10 gas', time: '14 days' },
    );
  } else if (cat.includes('dex') || cat.includes('yield')) {
    steps.push(
      { text: `Add $${capital} of liquidity to the highest volume stablecoin pair on ${name} to minimize impermanent loss.`, cost: '$10-$20 in gas', time: '5 minutes' },
      { text: `Stake your LP tokens in the protocol's reward gauge to start accumulating potential governance points.`, cost: '$5 in gas', time: '2 minutes' },
      { text: `Perform at least three swaps of $10 each over the next month to show consistent user engagement.`, cost: '$3-$6 in gas fees', time: '4 weeks' },
    );
  } else if (cat.includes('staking') || cat.includes('restak')) {
    steps.push(
      { text: `Liquid stake $${capital} worth of native assets through ${name} to receive the protocol's liquid receipt token.`, cost: 'Market price + $5 gas', time: '5 minutes' },
      { text: `Bridge or deposit your receipt tokens into a supported L2 integration to double-dip on potential rewards.`, cost: '$15 in gas/bridging', time: '10 minutes' },
      { text: `Hold the receipt token for at least 60 days to maximize your 'longevity' multiplier in the points system.`, cost: 'Opportunity cost of capital', time: '60 days' },
    );
  } else if (cat.includes('perpetual') || cat.includes('derivative')) {
    steps.push(
      { text: `Deposit $${capital} of margin and open a 1x leveraged long/short position on a major pair like BTC or ETH.`, cost: '$10 in margin gas', time: '5 minutes' },
      { text: `Generate at least $5,000 in trading volume by opening and closing positions across different days.`, cost: '$25 in trading fees', time: '1 week' },
      { text: `Provide liquidity to the platform's 'House' pool (e.g. GLP-style) to earn a share of trading fees.`, cost: '$15 in gas', time: '5 minutes' },
    );
  } else {
    steps.push(
      { text: `Interact with the primary smart contract of ${name} by depositing $${capital} into the core vault.`, cost: '$5-$12 in gas', time: '5 minutes' },
      { text: `Follow the protocol's official social channels and link your wallet if a 'Passport' system is available.`, cost: 'Free', time: '10 minutes' },
      { text: `Keep your funds deposited for at least 30 days to clear the 'Sybil' detection threshold.`, cost: 'Capital lockup', time: '30 days' },
    );
  }

  steps.push(
    {
      text: `Regularly check for governance votes on Snapshot.org or the protocol's own DAO portal and participate.`,
      cost: 'Usually free (gasless)',
      time: '5 minutes per week',
    },
    {
      text: `Monitor the official Discord for 'Early Adopter' roles which often correlate with higher allocation tiers.`,
      cost: 'Personal time',
      time: '15 minutes total',
    },
  );

  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    longevity_multiplier: row.model.longevity_multiplier,
    category_multiplier: row.model.category_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
