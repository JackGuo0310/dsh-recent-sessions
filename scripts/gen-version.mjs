/**
 * Regenerate the Git version block inside `client/client.js`.
 *
 * The 「最近会话」 settings page must show this repository's own name and tag,
 * read from Git rather than written by hand. The DSH browser module table only
 * resolves seed words, already-materialized modules and registered package
 * factories — a synchronous `require('./version-meta.js')` misses it, and a
 * relative specifier is only served through the asynchronous chunk loader. So the
 * metadata is generated into a marked region of the client bundle itself, which
 * also means an installed copy still reports its version without a checkout.
 *
 * Facts used, and the distinction the plan requires:
 *   - `repoName`  — package.json `name`, falling back to the Git origin's last
 *                   path segment, then to "unknown".
 *   - `tag`       — the tag pointing at HEAD (`git tag --points-at HEAD`), i.e.
 *                   "this commit is exactly that release".
 *   - `describe`  — `git describe --tags --always` (nearest tag plus distance), so
 *                   an untagged commit is reported as untagged instead of
 *                   silently inheriting an older tag.
 *   - `commit`    — short SHA, present whenever a repository exists.
 * No repository at all yields explicit `null`s and the UI says "unknown version";
 * a tag is never invented.
 *
 * Usage: node scripts/gen-version.mjs [--check]
 *   --check  verify the committed region matches Git; exit 1 when it drifted.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const clientPath = join(root, 'client', 'client.js');

/** Sentinels delimiting the generated region in client/client.js. */
const BEGIN = '// dsh:version-meta:begin';
const END = '// dsh:version-meta:end';

/**
 * Run a Git command, returning trimmed stdout or null on any failure.
 * @param {string[]} args - git arguments.
 * @returns {string | null} trimmed output, or null when Git is unavailable.
 */
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Resolve the displayed repository name.
 * @returns {string} package name, origin name, or "unknown".
 */
function resolveRepoName() {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name !== '') return manifest.name;
  } catch {
    // A damaged manifest is not fatal: fall through to the origin.
  }
  const origin = git(['config', '--get', 'remote.origin.url']);
  if (origin !== null && origin !== '') {
    const segment = origin.replace(/\.git$/, '').split(/[\\/]/).pop();
    if (segment) return segment;
  }
  return 'unknown';
}

/** Collect every Git fact the settings page displays. */
function collect() {
  const inRepository = git(['rev-parse', '--is-inside-work-tree']) === 'true';
  const pointed = inRepository ? git(['tag', '--points-at', 'HEAD']) : null;
  const tag = pointed === null || pointed === '' ? null : pointed.split(/\r?\n/).sort()[0];
  return {
    repoName: resolveRepoName(),
    tag,
    describe: inRepository ? git(['describe', '--tags', '--always']) || null : null,
    commit: inRepository ? git(['rev-parse', '--short=7', 'HEAD']) || null : null,
  };
}

/**
 * Render the generated region.
 * @param {object} facts - collected Git facts.
 * @returns {string} region text, sentinels included.
 */
function render(facts) {
  return [
    BEGIN,
    'const VERSION_META = Object.freeze(',
    JSON.stringify(facts, null, 2).split('\n').map((line) => `  ${line}`).join('\n'),
    ');',
    `${END}`,
  ].join('\n');
}

const source = readFileSync(clientPath, 'utf8');
const start = source.indexOf(BEGIN);
const end = source.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  process.stderr.write(`client/client.js has no ${BEGIN} … ${END} region.\n`);
  process.exit(1);
}
const endOfRegion = source.indexOf('\n', end) + 1;
const region = render(collect());

if (process.argv.includes('--check')) {
  const current = source.slice(start, endOfRegion);
  if (current !== region) {
    process.stderr.write('client/client.js version block is out of date; run `npm run version:meta`.\n');
    process.exit(1);
  }
  process.stdout.write('client/client.js version block is up to date.\n');
} else {
  writeFileSync(clientPath, source.slice(0, start) + region + source.slice(endOfRegion), 'utf8');
  process.stdout.write(`Updated the version block in ${clientPath}\n${JSON.stringify(collect())}\n`);
}