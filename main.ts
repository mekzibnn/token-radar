/**
 * Token Radar CLI - Entrypoint for the token-radar-01 submission.
 * 
 * This script processes a DeFi protocol snapshot, ranks them using a valuation model,
 * and generates a static dashboard for visualization. It is designed to be run
 * with Node 22 using only the standard library.
 */

import { 
  copyFileSync, 
  existsSync, 
  mkdirSync, 
  readFileSync, 
  readdirSync, 
  statSync, 
  writeFileSync 
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
  parseSnapshot, 
  buildRadar, 
  dataScript
} from './lib/model.ts';
import type { Snapshot, BoardRow } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Constants for gate validation and dossier generation
const TEXT_MAX_BYTES = 65536;
const IMAGE_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/**
 * Extracts a command-line argument value.
 * Supports both "--name value" and "--name=value".
 */
function getArg(name: string, fallback: string): string {
  const args = process.argv;
  const flag = `--${name}`;
  
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  
  const equalsArg = args.find(a => a.startsWith(`${flag}=`));
  if (equalsArg) {
    return equalsArg.slice(flag.length + 1);
  }
  
  return fallback;
}

/**
 * Validates that the generated board adheres to the make.fun grader constraints.
 * Throws an error if any constraint is violated.
 */
function validateBoard(board: BoardRow[], snapshot: Snapshot): void {
  // Check total row count (100-4000)
  if (board.length < 100 || board.length > 4000) {
    throw new Error(`Board must have 100-4000 rows, found ${board.length}`);
  }

  const snapshotSlugs = new Set(snapshot.protocols.map(p => p.slug));
  const seenSlugs = new Set<string>();
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);

  // Verify all watchlist protocols are included
  for (const slug of snapshot.watchlist) {
    if (!board.some(r => r.slug === slug)) {
      throw new Error(`Watchlist protocol "${slug}" is missing from the board`);
    }
  }

  // Verify rank continuity (1..N)
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) {
      throw new Error(`Ranks must be unique and continuous from 1 to N. Missing or invalid rank: ${i + 1}`);
    }
  }

  for (let i = 0; i < board.length; i++) {
    const row = board[i];

    // Slug must exist in snapshot and be unique in board
    if (!snapshotSlugs.has(row.slug)) {
      throw new Error(`Slug "${row.slug}" is not present in the original snapshot`);
    }
    if (seenSlugs.has(row.slug)) {
      throw new Error(`Duplicate slug found in board: "${row.slug}"`);
    }
    seenSlugs.add(row.slug);

    // Implied value must be non-increasing
    if (i > 0 && row.implied_value_usd > board[i - 1].implied_value_usd) {
      throw new Error(`Implied value is not non-increasing at row ${i + 1} (${row.slug})`);
    }

    // Board must not be flat (at least some variation in value)
    if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
      throw new Error("All board rows have the same implied value; ranking is effectively flat");
    }

    // Farm steps: 3-12 steps, each 20-600 trimmed characters
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      throw new Error(`Protocol "${row.slug}" has ${row.farm_steps.length} farm steps (range: 3-12)`);
    }

    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        throw new Error(`Farm step for "${row.slug}" has invalid length ${trimmed.length} (range: 20-600)`);
      }
    }
    
    // Implied value sanity check
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      throw new Error(`Protocol "${row.slug}" has invalid implied value: ${row.implied_value_usd}`);
    }
  }
}

/**
 * Copies regular files from src to dest, ignoring files starting with a dot.
 */
function syncDirectory(src: string, dest: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dest, { recursive: true });
  
  const copied: string[] = [];
  for (const entry of readdirSync(src)) {
    if (entry.startsWith('.')) continue;
    
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    const stats = statSync(srcPath);
    if (stats.isFile()) {
      copyFileSync(srcPath, destPath);
      copied.push(entry);
    }
  }
  return copied;
}

// --- Execution Flow ---

const selfDir = fileURLToPath(new URL('.', import.meta.url));

// Resolve input and output locations
const inputRaw = getArg('input', '/input');
const inputFile = inputRaw.endsWith('.json') ? inputRaw : join(inputRaw, 'snapshot.json');

if (!existsSync(inputFile)) {
  process.stderr.write(`Error: Snapshot file not found at ${inputFile}\n`);
  process.exit(1);
}

const outputDir = getArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// 1. Process Snapshot
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// 2. Gate Verification
try {
  validateBoard(board, snapshot);
} catch (err: any) {
  process.stderr.write(`Gate verification failed: ${err.message}\n`);
  process.exit(1);
}

// 3. Output Generation
mkdirSync(outputDir, { recursive: true });

// Data files
writeFileSync(join(outputDir, 'board.json'), JSON.stringify({ rows: board }) + '\n');
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

// Static assets
syncDirectory(join(selfDir, 'dashboard'), join(outputDir, 'dashboard'));
const screenshots = syncDirectory(join(selfDir, 'screenshots'), join(outputDir, 'screenshots'));

// Validate screenshots
if (screenshots.length < 3) {
  process.stderr.write(`Warning: Only ${screenshots.length} screenshots found. A full submission requires at least 3.\n`);
}
for (const name of screenshots) {
  if (!IMAGE_NAME_PATTERN.test(name)) {
    process.stderr.write(`Error: Screenshot name "${name}" violates gate naming rules.\n`);
    process.exit(1);
  }
}

// 4. Dossier Creation
// The dossier must be written last as it encapsulates the current state of the output directory.
const dossier = buildDossier(outputDir, { 
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524288 },
  dashboard: { max_files: 400, max_bytes: 4194304 }
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// Final Report
process.stdout.write(`Token Radar: Processed ${snapshot.protocols.length} protocols.\n`);
process.stdout.write(`Success: Ranked ${board.length} rows. Outputs written to ${outputDir}.\n`);
