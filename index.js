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
 * The tunable preferences live in this row's `config` rather than in plugin
 * state, so a user's values survive a bundle upgrade: the profile's own patch
 * layer keeps the overrides while these shipped defaults move.
 *
 * `.volatile()` marks each field as the live, settings-backed kind, which is what
 * makes the Host project this row into the settings surface the Client's
 * `configForms.get('dsh-recent-sessions')` reads.
 */

import z from '@deepseek-ai/schemastery';

/** Stable Cordis plugin name; matches the row id in cordis.patch.yml. */
export const name = 'dsh-recent-sessions';

/** No host services are required. */
export const inject = [];

/** Shipped defaults and the accepted range of the user preferences. */
export const Config = z.object({
  /** Rows shown before the first 「展开更多」 action. */
  defaultCount: z.number().step(1).min(1).max(50).default(10).volatile(),
  /** Additional rows rendered by every 「展开更多」 action. */
  expandStep: z.number().step(1).min(1).max(100).default(20).volatile(),
  /** Height of the list expressed in session rows; beyond it the list scrolls. */
  visibleRows: z.number().step(1).min(1).max(30).default(5).volatile(),
  /** Accepted ceiling of `defaultCount`. */
  maxCount: z.number().step(1).min(1).max(200).default(50).volatile(),
  /** Accepted ceiling of `visibleRows`. */
  maxRows: z.number().step(1).min(1).max(100).default(30).volatile(),
  /**
   * Desktop notification on a background Session finishing. Off by default: the
   * browser grants the permission only from a user gesture, so the settings page
   * asks for it while this switch is being turned on rather than on first load.
   */
  desktopNotify: z.boolean().default(false).volatile(),
});

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
export const DEFAULT_CONFIG = Object.freeze({
  defaultCount: 10,
  expandStep: 20,
  visibleRows: 5,
  maxCount: 50,
  maxRows: 30,
  desktopNotify: false,
});