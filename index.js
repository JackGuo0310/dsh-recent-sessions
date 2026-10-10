/**
 * dsh-recent-sessions — host half.
 *
 * The feature is browser-only: the 「最近」 sidebar section and its 「最近会话」
 * settings page live in the client half at `./client`. This module exists so the
 * package is a loadable Loader row, which is what makes the client bundle
 * discoverable — `@deepseek-ai/dsh-client-modules` only serves
 * `/plugins/<id>/client.js` for packages that appear as active Loader entries and
 * declare `dsh.client`.
 *
 * The tunable `defaultCount` lives in this row's `config` rather than in plugin
 * state, so a user's value survives a bundle upgrade: the profile's own patch
 * layer keeps the override while this shipped default moves.
 */

import { Schema } from '@deepseek-ai/schemastery';

/** Stable Cordis plugin name; matches the row id in cordis.patch.yml. */
export const name = 'dsh-recent-sessions';

/** No host services are required. */
export const inject = [];

/** Shipped defaults and the accepted range of the one user preference. */
export const Config = Schema.object({
  defaultCount: Schema.natural().min(1).max(50).default(10),
  maxCount: Schema.natural().min(1).max(200).default(50),
}).default({});

/**
 * Mount the host half.
 *
 * Intentionally empty: this plugin contributes nothing on the Node side. The
 * Client half reads its own row config through `ctx.config` when the profile
 * ships one, and falls back to `DEFAULT_CONFIG` otherwise.
 * @param _ctx - Cordis host context (unused).
 */
export function apply(_ctx) {}

/** Shipped defaults mirrored for the browser half's offline fallback. */
export const DEFAULT_CONFIG = Object.freeze({ defaultCount: 10, maxCount: 50 });