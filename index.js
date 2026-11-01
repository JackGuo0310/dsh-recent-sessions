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

import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import z from '@deepseek-ai/schemastery';

/** Stable Cordis plugin name; matches the row id in cordis.patch.yml. */
export const name = 'dsh-recent-sessions';

/** No host services are required to mount; the clipboard route waits for `connection`. */
export const inject = [];

/** Authenticated route the client half posts a file path to. */
const COPY_FILE_PATH = '/api/recent-sessions.copy-file';

/** Native PowerShell launcher used for the Windows file-drop clipboard write. */
const runPowerShell = promisify(execFile);

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
 * Put one Host file on the Host's system clipboard as a file drop list, so the
 * user can paste the file itself (Explorer, mail, chat) rather than its text.
 *
 * The browser cannot write files to the OS clipboard, so the client half posts
 * the path to this authenticated route and Windows PowerShell's `Set-Clipboard
 * -LiteralPath` performs the native write. The request only ever names an
 * existing regular file: the handler stats it, resolves symlinks, and hands the
 * canonical path to PowerShell as one quoted argument (no shell interpolation).
 * @param {Request} request - authenticated POST whose JSON body carries `path`.
 * @returns {Promise<Response>} the outcome the client reports.
 */
async function copyFileToClipboard(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body.', { status: 400 });
  }
  const raw = typeof body?.path === 'string' ? body.path.trim() : '';
  if (raw === '' || !isAbsolute(raw)) {
    return new Response('An absolute file path is required.', { status: 400 });
  }
  let info;
  try {
    info = await stat(raw);
  } catch {
    return new Response('File not found.', { status: 404 });
  }
  if (!info.isFile()) {
    return new Response('The path is not a regular file.', { status: 400 });
  }
  if (process.platform !== 'win32') {
    return new Response('Copying files is only supported on a Windows Host.', { status: 501 });
  }
  try {
    const canonical = await realpath(raw);
    const escaped = canonical.replace(/'/g, "''");
    await runPowerShell('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Set-Clipboard -LiteralPath '${escaped}'`,
    ], { windowsHide: true, timeout: 15_000 });
  } catch {
    return new Response('The Host could not copy the file.', { status: 500 });
  }
  return Response.json({ copied: true });
}

/**
 * Mount the host half.
 *
 * The sidebar, settings page and file menu all live in the Client half. This
 * half only contributes the authenticated clipboard route used by the file
 * menu's 「复制文件」 entry; the route waits for the Connection service, so a
 * composition without a web client mounts this plugin without that surface.
 * @param {object} ctx - Cordis host context.
 */
export function apply(ctx) {
  ctx.inject(['connection'], (scope) => {
    try {
      scope.connection.fetch.register({
        path: COPY_FILE_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => copyFileToClipboard(request),
      });
    } catch (error) {
      // A composition whose Connection service serves routes differently must not
      // take the whole plugin down: the Client half still runs the sidebar, the
      // settings page and every other menu entry, and only 「复制文件」 reports a
      // failure when clicked.
      console.warn('dsh-recent-sessions: clipboard route not registered:', error);
    }
  });
}

/** Shipped defaults mirrored for the browser half's offline fallback. */
export const DEFAULT_CONFIG = Object.freeze({
  defaultCount: 10,
  expandStep: 20,
  visibleRows: 5,
  maxCount: 50,
  maxRows: 30,
  desktopNotify: false,
});