/**
 * dsh-recent-sessions — browser half.
 *
 * Contributes two surfaces to the Harness Web UI, both through the shell's own
 * slot ledgers (no DOM written outside them, no shipped slot shadowed):
 *
 *   1. `sidebar.footer.action` — the collapsible 「最近」 section, rendered at the
 *      sidebar foot below the workspace browsing region. It aggregates sessions
 *      across every workspace, newest first, and reproduces the shipped
 *      session-row presentation: same row metrics, same leading state cell, same
 *      spinner and state dots, same relative-time and status wording, copied from
 *      ui-workspace's Rows.module.css and ui-primitives' StateDot.module.css
 *      with renamed classes, leaving `--dsw-*` theme tokens as the only shared
 *      styling dependency.
 *   2. `settings.section` — the 「最近会话」 settings page holding the one user
 *      preference (default number of rows shown) plus this repository's Git
 *      identity, read from the generated block below.
 *
 * Rendering note: this is React's *automatic* runtime, so every call passes its
 * children inside the props object (`{ children: … }`). Passing them as the third
 * argument would be read as the element `key` and the subtree would render empty.
 *
 * Known deviation from ui-workspace: its rows additionally report running
 * subagents, derived from a per-workspace loaded subagent catalog. The global
 * session status source this plugin reads carries running state, pending
 * interaction and the completion reminder, but not that count, so a session
 * running only subagents shows its state through the underlying running flag
 * rather than a separate subagent line.
 */

window.__ModuleLoader__.load({
  id: '@jackguo0310/dsh-recent-sessions',
  factory(require) {
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime');
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = require('react');
    // Platform seed table, so these resolve as bare specifiers exactly like the
    // shipped rows use them. `MenuItemButton` is what makes the menu read as the
    // native one — same role, focus walk, and shortcut-key placement.
    const {
      IconAppsAddOutlineRegular,
      IconArchiveOutlineRegular,
      IconBranchOutlineRegular,
      IconBrowseOutlineRegular,
      IconCopyOutlineRegular,
      IconDeliverDocRegular,
      IconDownloadOutlineRegular,
      IconEditOutlineRegular,
      IconEllipsisOutlineRegular,
      IconPanelLeftOutlineRegular,
      IconPaperclipOutlineRegular,
      IconPinFillRegular,
      IconPinOutlineRegular,
      IconRightUpOutlineRegular,
      Button,
      Menu,
      MenuItemButton,
      Modal,
      Toast,
      Tooltip,
      writeClipboard,
    } = require('@deepseek-ai/dsh-client-ui-primitives');

    // dsh:version-meta:begin
const VERSION_META = Object.freeze(
  {
    "repoName": "@jackguo0310/dsh-recent-sessions",
    "tag": "v0.5.9",
    "describe": "v0.5.9",
    "commit": null
  }
);
// dsh:version-meta:end
    /** Dictionary namespace owned by this plugin. */
    const NS = 'recentSessions';
    /** Host settings namespace of this plugin's own Loader row. */
    const HOST_NAMESPACE = 'dsh-recent-sessions';
    /** Shipped fallback for `defaultCount`, mirrored from the Host `Config`. */
    const FALLBACK_COUNT = 10;
    /** Shipped fallback for `expandStep`, mirrored from the Host `Config`. */
    const FALLBACK_STEP = 20;
    /** Shipped fallback for `visibleRows`, mirrored from the Host `Config`. */
    const FALLBACK_ROWS = 5;
    /** Shipped fallback for the accepted count ceiling, mirrored from the `Config`. */
    const FALLBACK_MAX = 50;
    /** Shipped fallback for the accepted height ceiling, mirrored from the `Config`. */
    const FALLBACK_MAX_ROWS = 30;
    /** Shipped fallback for `desktopNotify`, mirrored from the Host `Config`. */
    const FALLBACK_NOTIFY = false;
    /** Row metrics, so the height preference can be expressed in rows. */
    const ROW_HEIGHT = 32;
    const ROW_GAP = 2;
    /**
     * Where 「最近」 keeps its own pin set. Deliberately NOT the Host's pin set:
     * pinning here is this section's ordering preference and must not reorder or
     * mark the Session inside the workspace that owns it. Browser-local storage
     * is enough for a display preference and keeps the harness pin ledger
     * untouched.
     */
    const PIN_STORAGE_KEY = 'dsh-recent-sessions:pins';
    /** Sort strategies offered by the header. One entry for now, by design. */
    const SORT_OPTIONS = [{ id: 'updated', labelKey: 'sort.updated' }];

    /** Pending-interaction kinds ui-workspace gives dedicated row presentation. */
    const PENDING_KINDS = {
      approval: { labelKey: 'status.approval', compactKey: 'status.compact.approval' },
      'plan-review': { labelKey: 'status.plan-review', compactKey: 'status.compact.planReview' },
      question: { labelKey: 'status.question', compactKey: 'status.compact.answer' },
    };

    // ---------------------------------------------------------------- styles

    /**
     * Own stylesheet. Class names carry this plugin's prefix so nothing here can
     * collide with a shipped module; only `--dsw-*` theme tokens are shared.
     */
    const CSS = [
      '.dshRecent_section{box-sizing:border-box;width:100%;padding:6px 0;color:var(--dsw-alias-label-primary)}',
      '.dshRecent_header{position:relative;display:flex;align-items:center;gap:2px;width:100%;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-solid);padding:0 4px}',
      '.dshRecent_toggle{border:none;border-radius:var(--dsw-radius-sm);height:28px;min-width:0;padding:0 4px;cursor:pointer;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;flex:1 1 auto;align-items:center;gap:4px;display:flex}',
      '.dshRecent_toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshRecent_toggle:focus-visible,.dshRecent_sortButton:focus-visible,.dshRecent_moreButton:focus-visible,.dshRecent_row:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.dshRecent_headerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;line-height:20px;overflow:hidden;text-align:left}',
      '.dshRecent_count{flex:none;font-size:10px;line-height:16px;opacity:.8}',
      '.dshRecent_arrow{flex:none;transition:transform .15s var(--ds-ease-in-out)}',
      '.dshRecent_arrowOpen{transform:rotate(90deg)}',
      '.dshRecent_sortButton{border-radius:var(--dsw-radius-sm);cursor:pointer;height:24px;padding:0 6px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;flex:none;align-items:center;gap:2px;font:inherit;font-size:11px;line-height:16px;display:inline-flex}',
      '.dshRecent_sortButton:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshRecent_sortMenu{position:absolute;z-index:20;min-width:112px;border-radius:var(--dsw-radius-md);padding:4px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);display:flex;flex-direction:column;gap:2px}',
      '.dshRecent_sortOption{border:none;border-radius:var(--dsw-radius-sm);cursor:pointer;width:100%;padding:5px 8px;color:var(--dsw-alias-label-primary);background:0 0;font:inherit;font-size:12px;line-height:18px;text-align:left;display:flex;align-items:center;gap:6px}',
      '.dshRecent_sortOption:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshRecent_list{min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;margin-top:4px}',
      '.dshRecent_row{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:100%;height:32px;padding:0 8px;cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);align-items:center;gap:0;display:flex}',
      '.dshRecent_row:hover,.dshRecent_rowSelected{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshRecent_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;justify-content:center;display:inline-flex}',
      '.dshRecent_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;margin:0 6px 0 4px;font-size:14px;line-height:20px;overflow:hidden}',
      '.dshRecent_time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      // Trailing cells copied from ui-workspace's Rows.module.css. The crucial part is
      // the two visibility channels: `.dshRecent_rowActions` is `display:none` until
      // the row is hovered OR its menu is open, and the time plus the pinned
      // indicator step aside for it. `dshRecent_rowMenuOpen` is what carries the
      // strip across the portal gap — the pointer leaves the row the moment it
      // enters the popup, so hover alone would drop the anchor the popup hangs on.
      '.dshRecent_pinIndicator{width:16px;height:20px;color:var(--dsw-alias-label-caption);flex:none;align-items:center;justify-content:center;margin-left:6px;display:inline-flex}',
      '.dshRecent_pinIndicator svg{width:14px;height:14px;fill:currentColor}',
      '.dshRecent_rowActions{flex:none;align-items:center;gap:10px;display:none}',
      '.dshRecent_row:hover .dshRecent_rowActions,.dshRecent_rowMenuOpen .dshRecent_rowActions{display:inline-flex}',
      '.dshRecent_row:hover .dshRecent_time,.dshRecent_rowMenuOpen .dshRecent_time,.dshRecent_row:hover .dshRecent_pinIndicator,.dshRecent_rowMenuOpen .dshRecent_pinIndicator{display:none}',
      '.dshRecent_rowMenuOpen{background:var(--dsw-alias-interactive-bg-hover)}',
      // The title clips instead of ellipsizing while the actions are out, so a long
      // name does not end in a stray "…" right before the buttons.
      '@media (hover:hover){.dshRecent_row:hover .dshRecent_title,.dshRecent_rowMenuOpen .dshRecent_title{text-overflow:clip}}',
      '.dshRecent_actionButton{border:none;border-radius:var(--dsw-radius-xs);cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;flex:none;align-items:center;justify-content:center;padding:0;display:inline-flex}',
      '.dshRecent_actionButton:hover{color:var(--dsw-alias-label-primary)}',
      '.dshRecent_actionButton[aria-pressed="true"]{color:var(--dsw-alias-label-caption)}',
      '.dshRecent_actionButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.dshRecent_moreButton{border-radius:var(--dsw-radius-sm);width:100%;height:28px;padding:0 12px 0 28px;cursor:pointer;text-align:left;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;font:inherit;font-size:12px}',
      '.dshRecent_moreButton:hover{color:var(--dsw-alias-label-secondary)}',
      '.dshRecent_empty{color:var(--dsw-alias-label-tertiary);padding:4px 12px 6px;margin-top:4px;font-size:12px;line-height:18px}',
      '.dshRecent_hidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}',
      // Own copy of the shipped state-dot recipe (ui-primitives StateDot.module.css):
      // the spinner and the pending-interaction dot read exactly as in the
      // workspace rows while staying this plugin's own artwork.
      // The dot element needs its own box: the shipped StateDot writes
      // width/height inline, and `::after` insets itself against that box. With
      // no size the inset resolves to zero and no state colour would paint.
      '.dshRecent_dot{position:relative;display:inline-block;flex:none;width:10px;height:10px}',
      '.dshRecent_dot::after{content:"";position:absolute;inset:20%;border-radius:50%;corner-shape:round;background:currentColor}',
      '.dshRecent_dot[data-state="warning"]{color:var(--dsw-alias-state-warn-primary)}',
      '.dshRecent_dot[data-state="error"]{color:var(--dsw-alias-state-error-primary)}',
      '.dshRecent_dot[data-state="done"]{color:var(--dsw-alias-state-success-primary)}',
      '.dshRecent_dot[data-state="idle"]{color:var(--dsw-alias-state-idle-primary)}',
      '.dshRecent_spinner{flex:none;color:var(--dsw-alias-label-tertiary)}',
      '.dshRecent_spinnerMotion{transform-origin:center;animation:dshRecentSpin 1.5s linear infinite}',
      '.dshRecent_spinnerTrack,.dshRecent_spinnerArc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}',
      '.dshRecent_spinnerTrack{opacity:.25}',
      '.dshRecent_spinnerArc{stroke-dasharray:12 150;animation:dshRecentDash 1.5s ease-in-out infinite}',
      '@keyframes dshRecentSpin{to{transform:rotate(360deg)}}',
      '@keyframes dshRecentDash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}100%{stroke-dasharray:12 150;stroke-dashoffset:0}}',
      '@media (prefers-reduced-motion:reduce){.dshRecent_spinnerMotion,.dshRecent_spinnerArc{animation:none}.dshRecent_spinnerArc{stroke-dasharray:18 150;stroke-dashoffset:-3}.dshRecent_arrow{transition:none}}',
      // Settings page.
      '.dshRecentPage_section{min-width:0;padding:16px 0}',
      '.dshRecentPage_repo{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.dshRecentPage_repoName{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dshRecentPage_version{color:var(--dsw-alias-label-tertiary)}',
      '.dshRecentPage_version[data-untagged="true"]{color:var(--dsw-alias-label-secondary)}',
      '.dshRecentPage_divider{border:none;border-top:.5px solid var(--dsw-alias-border-l2);margin:16px 0}',
      '.dshRecentPage_row{border-bottom:.5px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:24px;padding:16px 0;display:flex}',
      '.dshRecentPage_title{font-size:14px;line-height:20px}',
      '.dshRecentPage_description{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px;line-height:18px}',
      '.dshRecentPage_input{box-sizing:border-box;height:34px;width:96px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-variant-numeric:tabular-nums}',
      '.dshRecentPage_input:focus-visible{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.dshRecentPage_input[aria-invalid="true"]{border-color:var(--dsw-alias-state-error-primary)}',
      '.dshRecentPage_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.dshRecentPage_switch{box-sizing:border-box;position:relative;flex:none;width:40px;height:22px;padding:0;border:none;border-radius:11px;cursor:pointer;background:var(--dsw-alias-bg-layer-3);transition:background .15s var(--ds-ease-in-out)}',
      '.dshRecentPage_switch[aria-checked="true"]{background:var(--dsw-alias-state-success-primary)}',
      '.dshRecentPage_switch:disabled{cursor:default;opacity:.5}',
      '.dshRecentPage_switch::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform .15s var(--ds-ease-in-out)}',
      '.dshRecentPage_switch[aria-checked="true"]::after{transform:translateX(18px)}',
      '.dshRecentPage_switch:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '@media (prefers-reduced-motion:reduce){.dshRecentPage_switch,.dshRecentPage_switch::after{transition:none}}',
      '.dshRecentPage_error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}',
      '.dshRecentPage_footer{display:flex;align-items:center;gap:8px;padding-top:16px}',
      '.dshRecentPage_note{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dshRecentPage_save{border:1px solid transparent;border-radius:var(--dsw-radius-md);padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
      '.dshRecentPage_save:disabled{opacity:.4;cursor:default}',
      '.dshRecentPage_save:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.dshRecent_appIcon{width:14px;height:14px;object-fit:contain;border-radius:2px}',
    ].join('');

    /**
     * Insert the stylesheet once, tagged so a remount reuses it. Called inside a
     * `ctx.effect`, so unloading the plugin leaves nothing behind.
     */
    function ensureStyles() {
      const id = '@jackguo0310/dsh-recent-sessions/recent-sessions.css';
      if (typeof document === 'undefined') return;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = '@jackguo0310/dsh-recent-sessions';
      tag.dataset.pluginCss = id;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // --------------------------------------------------------------- helpers

    /**
     * Relative distance bucket, ported from ui-primitives so the row time reads
     * exactly as the shipped rows do.
     * @param {number} at - target instant, epoch ms.
     * @param {number} now - current instant, epoch ms.
     * @returns {{unit: string, n: number}} bucket and amount.
     */
    function relativeTime(at, now) {
      const MIN = 6e4;
      const HOUR = 36e5;
      const DAY = 864e5;
      const diff = Math.max(0, now - at);
      if (diff < MIN) return { unit: 'now', n: 0 };
      if (diff < HOUR) return { unit: 'minutes', n: Math.floor(diff / MIN) };
      if (diff < DAY) return { unit: 'hours', n: Math.floor(diff / HOUR) };
      if (diff < 30 * DAY) return { unit: 'days', n: Math.floor(diff / DAY) };
      if (diff < 365 * DAY) return { unit: 'months', n: Math.floor(diff / (30 * DAY)) };
      return { unit: 'years', n: Math.floor(diff / (365 * DAY)) };
    }

    /**
     * Compact relative-time text for a row.
     * @param {{unit: string, n: number}} bucket - distance bucket.
     * @param {(key: string, params?: object) => string} t - translator.
     * @returns {string} localized compact label.
     */
    function timeLabel(bucket, t) {
      return bucket.unit === 'now' ? t('time.now') : t(`time.${bucket.unit}`, { n: bucket.n });
    }

    /**
     * Row display title, matching the shipped fallback vocabulary.
     * @param {string} title - stored session title, possibly empty.
     * @param {(key: string) => string} t - translator.
     * @returns {string} display title.
     */
    function displayTitle(title, t) {
      return title !== '' ? title : t('session.untitled');
    }

    /**
     * Session status presentation, ported from ui-workspace: pending interaction
     * is primary and live running outranks the completion reminder.
     * @param {object | undefined} status - global status entry for the session.
     * @param {(key: string, params?: object) => string} t - translator.
     * @returns {Array<{state: string, label: string, trailingLabel?: string}>} ordered statuses.
     */
    function sessionStatuses(status, t) {
      const kind = status?.pendingInteraction?.kind;
      const pending = kind === undefined ? undefined : PENDING_KINDS[kind];
      if (pending !== undefined) {
        return [{
          state: 'warning',
          label: t(pending.labelKey),
          trailingLabel: t(pending.compactKey),
        }];
      }
      if (status?.running === true) return [{ state: 'ongoing', label: t('status.running') }];
      if (status?.completionUnread === true) return [{ state: 'done', label: t('status.completed') }];
      return [{ state: 'idle', label: t('status.idle') }];
    }

    /**
     * Basename of a directory path; ui-workspace's ungrouped fallback.
     * @param {string | undefined} path - directory path.
     * @returns {string} display label.
     */
    function pathLabel(path) {
      if (path === undefined || path === '') return '';
      const parts = path.split(/[\\/]/).filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : path;
    }

    /**
     * Read one number out of the Host form snapshot, with the shipped fallback.
     * @param {object} snapshot - config form snapshot.
     * @param {string} field - field name.
     * @param {number} fallback - value used while the Host has not served it.
     * @returns {number} accepted value.
     */
    function readNumber(snapshot, field, fallback) {
      const raw = snapshot?.value?.[field];
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : fallback;
    }

    // ---------------------------------------------------------- row rename

    /** The rename request one 「最近」 row menu raised. */
    function createRenameRequests() {
      let current = null;
      const listeners = new Set();
      return {
        /**
         * Read the pending request.
         * @returns {object | null} the requested rename, or none.
         */
        getSnapshot: () => current,
        /**
         * Observe requests.
         * @param {listener} - notified on every change.
         * @returns {() => void} unsubscribe.
         */
        subscribe: (listener) => {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        /**
         * Ask for a rename dialog.
         * @param {object} target - Session identity and the title to seed.
         */
        request: (target) => {
          current = target;
          for (const listener of [...listeners]) listener();
        },
        /** Withdraw the request without opening anything. */
        settle: () => {
          current = null;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    /**
     * The rename dialog raised from a 「最近」 row. `uiWorkspace` exposes fork and
     * archive but keeps its own rename request private to the workspace browser's
     * overlay entry, so this dialog is a second one over the same public Host call
     * (`ctx.sessions.using(...).binding.session.rename`).
     * @param {object} props - the shared request source and translator.
     * @returns {object | null} the dialog while a rename is requested.
     */
    function RenameDialog({ requests, sessions, t }) {
      const target = useSyncExternalStore(requests.subscribe, requests.getSnapshot);
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      // An IME keystroke named "Enter" must not submit; the same guard the
      // shipped workspace rename dialog uses.
      const composing = useRef(false);

      // Seed the field when a new request arrives, and drop the draft when it is
      // withdrawn. Both live in one effect so a settle never leaves a stale title.
      useEffect(() => {
        if (target === null) {
          setDraft('');
          setError('');
          setBusy(false);
          return;
        }
        setDraft(target.currentTitle);
        setError('');
        setBusy(false);
      }, [target]);

      if (target === null) return null;
      const trimmed = draft.trim();
      const blocked = busy || trimmed === '' || trimmed === target.currentTitle;

      const close = () => {
        if (busy) return;
        requests.settle();
      };

      const confirm = () => {
        if (blocked) return;
        setBusy(true);
        setError('');
        sessions.using(target.sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(trimmed))
          .then((result) => {
            setBusy(false);
            if (result?.ok !== true) {
              setError(result?.error?.message ?? t('menu.renameFailed'));
              return;
            }
            requests.settle();
          })
          .catch((reason) => {
            setBusy(false);
            setError(reason instanceof Error ? reason.message : String(reason));
          });
      };

      return jsx(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('menu.close'),
        title: t('menu.renameTitle'),
        footer: jsxs(Fragment, { children: [
          jsx(Button, { key: 'cancel', variant: 'outline', disabled: busy, onClick: close, children: t('menu.cancel') }),
          jsx(Button, { key: 'ok', variant: 'primary', disabled: blocked, onClick: confirm, children: t('menu.renameAction') }),
        ] }),
        children: jsxs(Fragment, { children: [
          jsx('input', {
            key: 'field',
            className: 'dshRecentPage_input',
            style: { width: '100%' },
            value: draft,
            'aria-label': t('menu.renameTitle'),
            'data-modal-autofocus': true,
            disabled: busy,
            onFocus: (event) => { event.target.select(); },
            onChange: (event) => { setDraft(event.target.value); setError(''); },
            onCompositionStart: () => { composing.current = true; },
            onCompositionEnd: () => { composing.current = false; },
            onKeyDown: (event) => {
              if (event.key !== 'Enter' || composing.current === true) return;
              event.preventDefault();
              confirm();
            },
          }),
          error === '' ? null : jsx('p', { key: 'error', className: 'dshRecentPage_error', role: 'alert', children: error }),
        ] }),
      });
    }

    // ------------------------------------------------------------------ rows

    /**
     * Read the section's own pin set.
     * @returns {Set<string>} pinned Session ids.
     */
    function readLocalPins() {
      try {
        const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
        if (raw === null) return new Set();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
      } catch {
        return new Set();
      }
    }

    /**
     * Persist the section's own pin set.
     * @param {Set<string>} pins - pinned Session ids.
     */
    function writeLocalPins(pins) {
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...pins]));
      } catch {
        // A blocked storage backend only costs durability, never the interaction.
      }
    }

    /**
     * Leading state cell. Idle draws nothing at all — the shipped workspace row
     * only shows a state cell when the primary status is not idle, so idle rows
     * stay visually quiet instead of carrying a permanent grey dot. A running
     * session shows the spinner; pending interaction and the completion reminder
     * show the dot plus one screen-reader label per status.
     * @param {object} props - ordered statuses.
     * @returns {object | null} element for the leading cell, or null when idle.
     */
    function StatusCell({ statuses }) {
      const primary = statuses[0];
      if (primary.state === 'idle') return null;
      if (primary.state === 'ongoing') {
        return jsx('svg', {
          className: 'dshRecent_spinner',
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          'aria-hidden': 'true',
          children: jsx('g', {
            className: 'dshRecent_spinnerMotion',
            children: [
              jsx('circle', { key: 'track', className: 'dshRecent_spinnerTrack', cx: 12, cy: 12, r: 9.5 }),
              jsx('circle', { key: 'arc', className: 'dshRecent_spinnerArc', cx: 12, cy: 12, r: 9.5 }),
            ],
          }),
        });
      }
      return jsxs(Fragment, {
        children: [
          jsx('span', { key: 'dot', className: 'dshRecent_dot', 'data-state': primary.state, 'aria-hidden': 'true' }),
          ...statuses.map((status) => jsx('span', { key: status.label, className: 'dshRecent_hidden', children: status.label })),
        ],
      });
    }

    /**
     * One recent-session row.
     * @param {object} props - row facts, status, selection, actions and translator.
     * @returns {object} the row element.
     */
    function RecentRow({ row, status, selected, onOpen, onTogglePin, actions, t }) {
      const statuses = sessionStatuses(status, t);
      const primary = statuses[0];
      const project = row.workspaceLabel;
      const pinned = row.pinned === true;
      const [menuOpen, setMenuOpen] = useState(false);
      const label = displayTitle(row.title, t);
      // The strip's own visibility is driven by this class, not by :hover alone:
      // the popup portals out of the row, so the pointer leaves it while the menu
      // is still up and the anchor has to survive that.
      const rowClass = ['dshRecent_row'];
      if (selected) rowClass.push('dshRecent_rowSelected');
      if (menuOpen) rowClass.push('dshRecent_rowMenuOpen');
      return jsxs('div', {
        className: rowClass.join(' '),
        role: 'listitem',
        tabIndex: 0,
        title: project === '' ? label : `${project} · ${label}`,
        'aria-current': selected ? 'true' : undefined,
        'aria-description': project === '' ? undefined : t('row.project', { name: project }),
        onClick: () => onOpen(row.id),
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onOpen(row.id);
        },
        children: [
          jsx('span', { key: 'slot', className: 'dshRecent_slot', children: jsx(StatusCell, { statuses }) }),
          jsx('span', { key: 'title', className: 'dshRecent_title', children: label }),
          jsx('span', {
            key: 'time',
            className: 'dshRecent_time',
            'aria-hidden': primary.trailingLabel === undefined ? undefined : 'true',
            children: primary.trailingLabel ?? timeLabel(relativeTime(row.updatedAt, Date.now()), t),
          }),
          // The pinned marker at rest, exactly as the shipped row shows it: it
          // yields to the action strip on hover rather than sharing the cell.
          pinned ? jsx('span', {
            key: 'pinned',
            className: 'dshRecent_pinIndicator',
            role: 'img',
            'aria-label': t('row.pinned'),
            title: t('row.pinned'),
            children: jsx(IconPinFillRegular, { size: 14 }),
          }) : null,
          // The action strip: "…" then archive then pin, the shipped order, on the
          // shipped `Menu` primitive so placement, dismissal, keyboard walk and
          // focus return are the same. Clicks stay in the strip so the row does
          // not also open the Session.
          jsx('span', {
            key: 'actions',
            className: 'dshRecent_rowActions',
            onClick: (event) => { event.stopPropagation(); },
            children: [
              jsx(Menu, {
                key: 'menu',
                open: menuOpen,
                onClose: () => { setMenuOpen(false); },
                portal: true,
                closeOnPointerLeave: true,
                anchor: jsx('button', {
                  type: 'button',
                  className: 'dshRecent_actionButton',
                  'aria-label': t('row.menu.aria', { name: label }),
                  'aria-expanded': menuOpen ? 'true' : 'false',
                  onClick: () => { setMenuOpen((open) => !open); },
                  children: jsx(IconEllipsisOutlineRegular, {}),
                }),
                children: jsxs(Fragment, { children: [
                  // Deliberately NOT the shipped pin action: that one writes the
                  // Host pin ledger and reorders the owning Workspace. 「最近」 keeps
                  // its own browser-local pin set, so this entry drives the same
                  // `onTogglePin` as the hover button and nothing in the workspace
                  // area moves.
                  jsx(MenuItemButton, {
                    key: 'pin',
                    icon: pinned
                      ? jsx(IconPinFillRegular, { size: 14 })
                      : jsx(IconPinOutlineRegular, { size: 14 }),
                    onSelect: () => {
                      setMenuOpen(false);
                      onTogglePin(row.id, pinned);
                    },
                    children: t(pinned ? 'pin.remove' : 'pin.add'),
                  }),
                  jsx(MenuItemButton, {
                    key: 'rename',
                    icon: jsx(IconEditOutlineRegular, { size: 14 }),
                    onSelect: () => {
                      setMenuOpen(false);
                      actions.rename(row.id, label);
                    },
                    children: t('menu.rename'),
                  }),
                  jsx(MenuItemButton, {
                    key: 'fork',
                    icon: jsx(IconBranchOutlineRegular, {}),
                    onSelect: () => {
                      setMenuOpen(false);
                      actions.fork(row.id);
                    },
                    children: t('menu.fork'),
                  }),
                  jsx(MenuItemButton, {
                    key: 'archive',
                    icon: jsx(IconArchiveOutlineRegular, { size: 14 }),
                    onSelect: () => {
                      setMenuOpen(false);
                      actions.archive(row.id);
                    },
                    children: t('menu.archive'),
                  }),
                  // Same entry the shipped row menu now carries, in the shipped
                  // slot: last, after archive. It copies the whole Session id and
                  // never opens the Session, so the menu is dismissed first.
                  jsx(MenuItemButton, {
                    key: 'sessionId',
                    icon: jsx(IconCopyOutlineRegular, {}),
                    onSelect: () => {
                      setMenuOpen(false);
                      actions.copyId(row.id);
                    },
                    children: t('menu.copyId'),
                  }),
                ] }),
              }),
              jsx(Tooltip, {
                key: 'archive',
                label: t('menu.archive'),
                side: 'bottom',
                align: 'end',
                delayMs: 500,
                children: jsx('button', {
                  type: 'button',
                  className: 'dshRecent_actionButton',
                  'aria-label': t('menu.archive'),
                  onClick: () => { actions.archive(row.id); },
                  children: jsx(IconArchiveOutlineRegular, { size: 14 }),
                }),
              }),
              jsx(Tooltip, {
                key: 'pin',
                label: t(pinned ? 'pin.remove' : 'pin.add'),
                side: 'bottom',
                align: 'end',
                delayMs: 500,
                children: jsx('button', {
                  type: 'button',
                  className: 'dshRecent_actionButton',
                  'aria-label': t(pinned ? 'pin.remove' : 'pin.add'),
                  onClick: () => { onTogglePin(row.id, pinned); },
                  children: pinned
                    ? jsx(IconPinFillRegular, { size: 14 })
                    : jsx(IconPinOutlineRegular, { size: 14 }),
                }),
              }),
            ],
          }),
        ],
      });
    }

    /**
     * Sort menu: currently one strategy, opened from the section header.
     * @param {object} props - strategy, anchor, translator and dismissal.
     * @returns {object} the menu element.
     */
    function SortMenu({ current, anchorRef, onClose, t }) {
      const ref = useRef(null);
      useEffect(() => {
        const onPointerDown = (event) => {
          if (ref.current?.contains(event.target) === true) return;
          if (anchorRef.current?.contains(event.target) === true) return;
          onClose();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [anchorRef, onClose]);
      return jsx('div', {
        ref,
        className: 'dshRecent_sortMenu',
        role: 'menu',
        'aria-label': t('sort.label'),
        children: SORT_OPTIONS.map((option) => jsxs('button', {
          key: option.id,
          type: 'button',
          role: 'menuitemradio',
          'aria-checked': option.id === current ? 'true' : 'false',
          className: 'dshRecent_sortOption',
          children: [
            jsx('span', { key: 'mark', 'aria-hidden': 'true', children: option.id === current ? '✓' : '·' }),
            jsx('span', { key: 'label', children: t(option.labelKey) }),
          ],
        })),
      });
    }

    /**
     * The 「最近」 section contributed to the sidebar foot.
     * @param {object} props - slot props: owner share, standard hooks, injected actions.
     * @returns {object | null} the section element, or null in the collapsed rail.
     */
    function RecentSessionsSection({ wide, useSessions, useSessionStatus, useWorkspaces, usePreference, openSession, actions, t }) {
      const [expanded, setExpanded] = useState(true);
      const [limit, setLimit] = useState(null);
      const [sort, setSort] = useState('updated');
      const [sortOpen, setSortOpen] = useState(false);
      const [pins, setPins] = useState(readLocalPins);
      const sortAnchor = useRef(null);

      const list = useSessions((state) => state);
      const statuses = useSessionStatus((state) => state);
      const workspaces = useWorkspaces((state) => state.items);
      const archived = useWorkspaces((state) => state.archivedSessionIds);
      const preference = usePreference((state) => state);

      const maxCount = readNumber(preference, 'maxCount', FALLBACK_MAX);
      const defaultCount = Math.min(readNumber(preference, 'defaultCount', FALLBACK_COUNT), maxCount);
      const expandStep = Math.min(readNumber(preference, 'expandStep', FALLBACK_STEP), maxCount);
      const visibleRows = readNumber(preference, 'visibleRows', FALLBACK_ROWS);
      // `null` means "at the configured default"; the first 「展开更多」 turns it
      // into an explicit row count, so 展开 grows by one step instead of dumping
      // every session into the DOM.
      const shown = limit === null ? defaultCount : limit;

      // The selected Session is the one the main view retains — the same signal
      // ui-workspace uses for its active-workspace tint.
      const currentId = useMemo(() => {
        const retained = Object.entries(list.byId ?? {}).find(([, summary]) => (summary.retainedBy?.mainView ?? 0) > 0);
        return retained === undefined ? undefined : retained[0];
      }, [list.byId]);

      // Fold the framework sources into one cross-workspace view. Archived,
      // provisional-blank and subagent sessions are not user-facing rows here.
      const rows = useMemo(() => {
        const archivedSet = new Set(archived ?? []);
        const ownerBySession = new Map();
        for (const workspace of workspaces ?? []) {
          for (const id of workspace.sessionIds ?? []) ownerBySession.set(id, workspace);
        }
        const collected = [];
        for (const id of list.ids ?? []) {
          const summary = list.byId?.[id];
          if (summary === undefined) continue;
          if (summary.blank === true) continue;
          if (summary.origin === 'subagent') continue;
          if (archivedSet.has(id)) continue;
          const workspace = ownerBySession.get(id);
          const label = workspace === undefined
            ? pathLabel(summary.cwd)
            : workspace.title !== '' ? workspace.title : pathLabel(workspace.path);
          collected.push({
            id,
            title: summary.title ?? '',
            updatedAt: summary.updatedAt,
            workspaceLabel: label,
            pinned: pins.has(id),
          });
        }
        // Pinned rows lead, then recency, with the Session identity as the
        // deterministic tie-break. Pinning only reorders this section.
        collected.sort((left, right) => Number(right.pinned) - Number(left.pinned)
          || right.updatedAt - left.updatedAt
          || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
        return collected;
      }, [archived, list, pins, workspaces]);

      const onOpen = useCallback((id) => {
        setLimit(null);
        openSession(id);
      }, [openSession]);

      const onTogglePin = useCallback((id, isPinned) => {
        setPins((current) => {
          const next = new Set(current);
          if (isPinned) next.delete(id);
          else next.add(id);
          writeLocalPins(next);
          return next;
        });
      }, []);

      // The rail (56px icons) has no room for rows, and the shipped shell hides
      // this whole foot area there anyway.
      if (!wide) return null;

      // Rendered rows stay bounded: the 「展开更多」 control adds one configured step
      // at a time rather than materializing every session at once.
      const visible = rows.slice(0, shown);
      const remaining = Math.max(0, rows.length - shown);
      const expandedOnce = limit !== null;
      // The height preference is expressed in rows, so the list occupies a fixed
      // multiple of the row pitch and scrolls past that.
      const listStyle = { maxHeight: `${visibleRows * ROW_HEIGHT + Math.max(0, visibleRows - 1) * ROW_GAP}px` };
      const sortLabel = SORT_OPTIONS.find((option) => option.id === sort)?.labelKey ?? SORT_OPTIONS[0].labelKey;

      const head = jsxs('div', { key: 'head', className: 'dshRecent_header', children: [
        jsxs('button', {
          key: 'toggle',
          type: 'button',
          className: 'dshRecent_toggle',
          'aria-expanded': expanded,
          onClick: () => setExpanded((value) => !value),
          children: [
            jsx('span', {
              key: 'arrow',
              className: expanded ? 'dshRecent_arrow dshRecent_arrowOpen' : 'dshRecent_arrow',
              'aria-hidden': 'true',
              children: '▸',
            }),
            jsx('span', { key: 'label', className: 'dshRecent_headerLabel', children: t('section.label') }),
            rows.length > 0 ? jsx('span', { key: 'count', className: 'dshRecent_count', children: String(rows.length) }) : null,
          ],
        }),
        jsx('button', {
          key: 'sort',
          ref: sortAnchor,
          type: 'button',
          className: 'dshRecent_sortButton',
          'aria-haspopup': 'menu',
          'aria-expanded': sortOpen,
          'aria-label': t('sort.button', { current: t(sortLabel) }),
          onClick: () => setSortOpen((value) => !value),
          children: [
            jsx('span', { key: 'label', children: t(sortLabel) }),
            jsx('span', { key: 'caret', 'aria-hidden': 'true', children: '▾' }),
          ],
        }),
        sortOpen ? jsx(SortMenu, {
          key: 'menu',
          current: sort,
          anchorRef: sortAnchor,
          onClose: () => setSortOpen(false),
          t,
        }) : null,
      ] });

      const body = jsxs('div', { key: 'body', children: [
        rows.length === 0
          ? jsx('div', { key: 'empty', className: 'dshRecent_empty', children: t('empty') })
          : jsx('div', {
            key: 'list',
            className: 'dshRecent_list',
            role: 'list',
            style: listStyle,
            children: visible.map((row) => jsx(RecentRow, {
              key: row.id,
              row,
              status: statuses?.get(row.id),
              selected: row.id === currentId,
              onOpen,
              onTogglePin,
              actions,
              t,
            })),
          }),
        remaining > 0 || expandedOnce ? jsx('button', {
          key: 'more',
          type: 'button',
          className: 'dshRecent_moreButton',
          'aria-expanded': expandedOnce,
          onClick: () => {
            if (remaining > 0) setLimit(shown + expandStep);
            else setLimit(null);
          },
          children: remaining > 0
            ? t('more.expand', { n: Math.min(expandStep, remaining), left: remaining })
            : t('more.collapse'),
        }) : null,
      ] });

      return jsx('div', {
        className: 'dshRecent_section',
        children: [head, expanded ? body : null],
      });
    }

    // --------------------------------------------------------- settings page

    /**
     * Compose this repository's version text from the generated Git facts.
     * @param {{tag: string, describe: string, commit: string}} facts - Git metadata.
     * @param {(key: string, params?: object) => string} t - translator.
     * @returns {{text: string, untagged: boolean}} header version text.
     */
    function versionText(facts, t) {
      if (facts.tag !== '') return { text: facts.tag, untagged: false };
      if (facts.describe !== '') return { text: t('version.untagged', { ref: facts.describe }), untagged: true };
      if (facts.commit !== '') return { text: t('version.noTag', { commit: facts.commit }), untagged: true };
      return { text: t('version.unknown'), untagged: true };
    }

    /**
     * The 「最近会话」 settings page: repository identity plus the two
     * user-editable preferences.
     * @param {object} props - locale seat, preference hook and writer.
     * @returns {object} the page element.
     */
    function RecentSessionsSettings({ usePreference, saveValues, t }) {
      const preference = usePreference((state) => state);
      const stored = {
        defaultCount: readNumber(preference, 'defaultCount', FALLBACK_COUNT),
        expandStep: readNumber(preference, 'expandStep', FALLBACK_STEP),
        visibleRows: readNumber(preference, 'visibleRows', FALLBACK_ROWS),
      };
      const maxCount = readNumber(preference, 'maxCount', FALLBACK_MAX);
      const maxRows = readNumber(preference, 'maxRows', FALLBACK_MAX_ROWS);
      const writable = preference.status === 'ready' && preference.writable;
      // A field absent from the served form is one the running Host does not know
      // yet, so it is shown as unavailable rather than silently ignored.
      const served = preference.value ?? {};
      const isServed = (field) => Object.hasOwn(served, field);
      const [draft, setDraft] = useState({
        count: String(stored.defaultCount),
        step: String(stored.expandStep),
        rows: String(stored.visibleRows),
      });
      const [notice, setNotice] = useState(null);
      const [busy, setBusy] = useState(false);
      // Re-read on every render rather than stored: the browser permission can be
      // revoked from outside the page while it is open.
      const permission = notificationPermission();
      const notifyEnabled = preference.value?.desktopNotify === true;
      const [noticeBusy, setNoticeBusy] = useState(false);
      // Adopt a Host-side change (reset, another window) while not being edited.
      const editing = useRef(false);

      useEffect(() => {
        if (editing.current !== true) {
          setDraft({
            count: String(stored.defaultCount),
            step: String(stored.expandStep),
            rows: String(stored.visibleRows),
          });
        }
      }, [stored.defaultCount, stored.expandStep, stored.visibleRows]);

      const parsed = {
        count: Number.parseInt(draft.count, 10),
        step: Number.parseInt(draft.step, 10),
        rows: Number.parseInt(draft.rows, 10),
      };
      const invalid = {
        count: !Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > maxCount,
        step: !Number.isInteger(parsed.step) || parsed.step < 1 || parsed.step > maxCount,
        rows: !Number.isInteger(parsed.rows) || parsed.rows < 1 || parsed.rows > maxRows,
      };
      const dirty = (invalid.count === false && parsed.count !== stored.defaultCount)
        || (invalid.step === false && parsed.step !== stored.expandStep)
        || (invalid.rows === false && parsed.rows !== stored.visibleRows);
      const meta = VERSION_META ?? {};
      const version = versionText({
        tag: meta.tag ?? '',
        describe: meta.describe ?? '',
        commit: meta.commit ?? '',
      }, t);

      const submit = async () => {
        if (invalid.count || invalid.step || invalid.rows || dirty === false || busy) return;
        setBusy(true);
        setNotice(null);
        const accepted = await saveValues({
          defaultCount: parsed.count,
          expandStep: parsed.step,
          visibleRows: parsed.rows,
        });
        setBusy(false);
        setNotice(accepted ? 'settings.saved' : 'settings.failed');
        if (accepted) editing.current = false;
      };

      /**
       * Flip the desktop-notification switch. Turning it on is the only place a
       * browser permission may be requested, because that API refuses to answer
       * outside a user gesture — so the request and the write share this click.
       * Turning it off only drops the preference; an already-granted permission
       * is left alone, because the browser is the only party that can revoke it.
       * @returns {Promise<void>} resolves once the write settles.
       */
      const toggleNotify = async () => {
        if (!writable || isServed('desktopNotify') !== true || noticeBusy) return;
        const next = notifyEnabled !== true;
        if (next && permission === 'default') {
          setNoticeBusy(true);
          let granted = false;
          try {
            granted = await window.Notification.requestPermission() === 'granted';
          } catch {
            granted = false;
          }
          setNoticeBusy(false);
          if (granted !== true) {
            setNotice(permission === 'unsupported'
              ? 'settings.notifyUnsupported'
              : 'settings.notifyBlocked');
            return;
          }
        }
        if (next && permission === 'denied') {
          setNotice('settings.notifyBlocked');
          return;
        }
        setNoticeBusy(true);
        const accepted = await saveValues({ desktopNotify: next });
        setNoticeBusy(false);
        if (accepted !== true) {
          setNotice('settings.failed');
          return;
        }
        // A refusal recorded while the browser had no answer yet must not be
        // silently overwritten by the acknowledgement of the write that followed.
        setNotice(next ? 'settings.notifyOn' : 'settings.notifyOff');
      };

      /**
       * One labeled numeric preference row.
       * @param {object} row - row identity, bounds and change handler.
       * @returns {object} the row element.
       */
      const numberRow = ({ field, draftKey, titleKey, descriptionKey, max, value, bad }) => jsxs('div', {
        key: field,
        className: 'dshRecentPage_row',
        children: [
          jsx('div', { key: 'text', children: [
            jsx('div', { key: 'title', className: 'dshRecentPage_title', children: t(titleKey) }),
            jsx('div', {
              key: 'description',
              className: 'dshRecentPage_description',
              children: isServed(field) ? t(descriptionKey, { max }) : t('settings.fieldPending'),
            }),
          ] }),
          jsx('input', {
            key: 'input',
            className: 'dshRecentPage_input',
            type: 'number',
            inputMode: 'numeric',
            min: 1,
            max,
            step: 1,
            value,
            disabled: !writable || busy || !isServed(field),
            'aria-invalid': bad ? 'true' : undefined,
            'aria-label': t(titleKey),
            onFocus: () => { editing.current = true; },
            onChange: (event) => {
              setDraft((current) => ({ ...current, [draftKey]: event.target.value }));
              setNotice(null);
            },
            onKeyDown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void submit();
            },
          }),
        ],
      });

      return jsx('div', {
        className: 'dshRecentPage_section',
        children: [
          jsxs('div', { key: 'repo', className: 'dshRecentPage_repo', children: [
            jsx('span', { key: 'name', className: 'dshRecentPage_repoName', children: meta.repoName ?? t('version.unknownRepo') }),
            jsx('span', {
              key: 'version',
              className: 'dshRecentPage_version',
              'data-untagged': String(version.untagged),
              children: version.text,
            }),
          ] }),
          jsx('hr', { key: 'divider', className: 'dshRecentPage_divider' }),
          preference.status === 'ready' ? null : jsx('p', {
            key: 'unavailable',
            className: 'dshRecentPage_note',
            children: t('settings.unavailable'),
          }),
          numberRow({
            field: 'defaultCount',
            draftKey: 'count',
            titleKey: 'settings.countTitle',
            descriptionKey: 'settings.countDescription',
            max: maxCount,
            value: draft.count,
            bad: invalid.count,
          }),
          numberRow({
            field: 'expandStep',
            draftKey: 'step',
            titleKey: 'settings.stepTitle',
            descriptionKey: 'settings.stepDescription',
            max: maxCount,
            value: draft.step,
            bad: invalid.step,
          }),
          numberRow({
            field: 'visibleRows',
            draftKey: 'rows',
            titleKey: 'settings.rowsTitle',
            descriptionKey: 'settings.rowsDescription',
            max: maxRows,
            value: draft.rows,
            bad: invalid.rows,
          }),
          jsxs('div', { key: 'notifyDivider', className: 'dshRecentPage_divider' }),
          jsxs('div', { key: 'notify', className: 'dshRecentPage_row', children: [
            jsx('div', { key: 'text', children: [
              jsx('div', { key: 'title', className: 'dshRecentPage_title', children: t('settings.notifyTitle') }),
              jsx('div', {
                key: 'description',
                className: 'dshRecentPage_description',
                children: isServed('desktopNotify') !== true
                  ? t('settings.fieldPending')
                  : permission === 'unsupported'
                    ? t('settings.notifyUnsupported')
                    : permission === 'denied'
                      ? t('settings.notifyDenied')
                      : t('settings.notifyDescription'),
              }),
            ] }),
            jsx('button', {
              key: 'switch',
              type: 'button',
              role: 'switch',
              'aria-checked': notifyEnabled === true ? 'true' : 'false',
              'aria-label': t('settings.notifyTitle'),
              className: 'dshRecentPage_switch',
              disabled: !writable || noticeBusy || isServed('desktopNotify') !== true
                || permission === 'unsupported' || (notifyEnabled !== true && permission === 'denied'),
              onClick: () => { void toggleNotify(); },
            }),
          ] }),
          invalid.count || invalid.step || invalid.rows
            ? jsx('p', {
              key: 'invalid',
              className: 'dshRecentPage_error',
              role: 'alert',
              children: t('settings.invalid', { maxCount, maxRows }),
            })
            : null,
          jsxs('div', { key: 'footer', className: 'dshRecentPage_footer', children: [
            jsx('p', {
              key: 'note',
              className: 'dshRecentPage_note',
              role: 'status',
              children: notice === null ? '' : t(notice),
            }),
            jsx('button', {
              key: 'save',
              type: 'button',
              className: 'dshRecentPage_save',
              disabled: !writable || busy || invalid.count || invalid.step || invalid.rows || dirty === false,
              onClick: () => { void submit(); },
              children: t('settings.save'),
            }),
          ] }),
        ],
      });
    }

    // --------------------------------------------------- desktop notification

    /**
     * Live browser notification permission.
     * @returns {string} `granted`, `default`, `denied`, or `unsupported` where
     *   the browser has no Notification API at all.
     */
    function notificationPermission() {
      if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
      return window.Notification.permission;
    }

    /**
     * Raise one Windows desktop toast for a finished background Session.
     *
     * The browser — not DSH — owns this surface: Windows renders it in the
     * bottom-right corner and keeps it in the Action Center after the banner
     * fades, which is why the page being minimized still notifies. There is no
     * way to change that geometry from here.
     * @param {object} args - notification text and the gesture that opens it.
     */
    function showDesktopNotification({ title, body, sessionId, openSession }) {
      try {
        const notice = new window.Notification(title, {
          body,
          // One toast per Session: a Session that is corrected and finishes
          // again replaces its own banner instead of stacking a second one.
          tag: `dsh-recent-sessions:${String(sessionId)}`,
        });
        notice.onclick = () => {
          try {
            window.focus();
          } catch {
            // A browser may refuse programmatic focus; opening the Session below
            // is what actually matters, so a refusal here is not fatal.
          }
          try {
            openSession(sessionId);
          } finally {
            notice.close();
          }
        };
      } catch {
        // A browser may expose the constructor but refuse to display. Losing one
        // banner is never worth breaking the observer that raised it.
      }
    }

    /**
     * The `shell.overlay` occupant that raises a desktop toast when a background
     * Session finishes. It renders nothing: the notification belongs to the
     * operating system, so this seat is only the sanctioned place to obtain the
     * root-scoped Session status hooks.
     * @param {object} props - slot props: standard hooks, preference, actions.
     * @returns {null} always; the toast is the only visible result.
     */
    function DesktopNotifier({ useSessions, useSessionStatus, useWorkspaces, usePreference, openSession, t }) {
      const list = useSessions((state) => state);
      const statuses = useSessionStatus((state) => state);
      const workspaces = useWorkspaces((state) => state.items);
      const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
      const enabled = usePreference((state) => state)?.value?.desktopNotify === true;

      /**
       * Last observed running flag per Session. An edge is what makes this an
       * event rather than a level: a Session stays `running: false` forever, so
       * reading the flag alone would re-toast on every later snapshot.
       */
      const running = useRef(new Map());

      useEffect(() => {
        if (enabled !== true || notificationPermission() !== 'granted') {
          // Drop the edges while disabled so switching on cannot fire a burst of
          // toasts for Sessions that finished before the switch went live.
          running.current = new Map();
          return;
        }

        const finished = [];
        for (const [id, status] of statuses) {
          if (running.current.get(id) === true && status.running === false) finished.push(id);
        }
        running.current = new Map([...statuses].map(([id, status]) => [id, status.running]));
        if (finished.length === 0) return;

        const ownerBySession = new Map();
        for (const workspace of workspaces ?? []) {
          for (const id of workspace.sessionIds ?? []) ownerBySession.set(id, workspace);
        }
        const archived = new Set(archivedSessionIds ?? []);

        for (const id of finished) {
          const summary = list.byId?.[id];
          // Same user-facing filter the sidebar rows apply. A subagent finishing
          // is its parent's business, not a separate notification — and opening
          // one by id would land the user inside a child conversation. An archived
          // Session is not openable either, so its toast would only dead-end.
          if (summary === undefined) continue;
          if (summary.origin === 'subagent' || summary.blank === true) continue;
          if (archived.has(id)) continue;
          // The main-view Session is the one on screen: the user is already
          // watching it stop, so a toast for it would only be noise.
          if ((summary.retainedBy?.mainView ?? 0) > 0) continue;
          const workspace = ownerBySession.get(id);
          const label = workspace === undefined
            ? pathLabel(summary?.cwd)
            : workspace.title !== '' ? workspace.title : pathLabel(workspace.path);
          const title = summary?.title != null && summary.title !== ''
            ? summary.title
            : t('session.untitled');
          showDesktopNotification({
            title,
            body: label === '' ? t('notify.done') : t('notify.doneIn', { project: label }),
            sessionId: id,
            openSession,
          });
        }
      }, [enabled, statuses, list.byId, workspaces, archivedSessionIds, t]);

      return null;
    }

    // -------------------------------------------------------- file references

    /**
     * Right-click menu over the file references an assistant reply renders — the
     * inline `@path` mention, the Markdown file link, the delivered-file card and
     * the rows of the changed-files card.
     *
     * This is the shipped menu, not a second one: `Menu` and its item rows are
     * the ui-primitives components the workspace menus already mount, so placement,
     * the viewport-edge clamp, the keyboard walk, Escape, outside-click dismissal
     * and the focus hand-back are the shipped behaviour rather than reimplemented
     * here. The entries are the shipped file actions: native open and reveal
     * through the Session Remote (`openWorkspacePath` — the call the document
     * preview's own file control makes), opening the file in the right Sidebar
     * through its resource page, and bounded reads through the `workspaceFiles`
     * Remote for the copy and save entries.
     *
     * What disappears and what can only be disabled:
     *
     *   - A Host without a desktop (a remote Session, a headless deployment)
     *     cannot run a native opener at all, so those entries are absent rather
     *     than disabled.
     *   - A reference the Host's file service can no longer resolve leaves every
     *     entry that would act on the file disabled, while 「复制路径」 keeps
     *     copying the resolved path.
     *
     * A left click is untouched: this module only inspects `contextmenu`, and the
     * shipped click handler keeps owning the reference itself.
     */

    /** Shipped file-reference surfaces; CSS-module class names keep their local name. */
    const FILE_MENTION_SELECTOR = 'button[class*="fileMention"]';
    const PRESENTED_FILE_SELECTOR = '[data-presented-file]';
    const CHANGED_FILES_SELECTOR = '[data-changed-files]';

    /** Menu ids, stable across renders so the shipped row highlight keeps working. */
    const FILE_MENU_ITEMS = {
      open: 'open',
      reveal: 'reveal',
      sidebar: 'sidebar',
      openWith: 'openWith',
      saveAs: 'saveAs',
      copyPath: 'copyPath',
      copyContents: 'copyContents',
      copyFile: 'copyFile',
    };

    /**
     * Whether one reference is already rooted — a Windows drive path, a UNC share
     * or a POSIX absolute path — and therefore must not be joined to the workspace.
     * @param {string} path - reference as the reply rendered it.
     * @returns {boolean} whether the path is absolute.
     */
    function isRootedPath(path) {
      return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/');
    }

    /**
     * Resolve one workspace-relative reference against the Session's workspace root.
     * @param {string | undefined} root - Session workspace root.
     * @param {string} path - reference as the reply rendered it.
     * @returns {string} rooted candidate path.
     */
    function rootedPath(root, path) {
      if (isRootedPath(path)) return path;
      if (root === undefined || root === '') return path;
      const separator = root.includes('\\') ? '\\' : '/';
      return `${root.replace(/[\\/]+$/, '')}${separator}${path.replace(/^(?:\.?[\\/])+/, '')}`;
    }

    /**
     * Encode one `dsh-resource://file/…` path segment, keeping a drive letter's
     * colon literal the way the shipped address helpers do.
     * @param {string} segment - one path or identity segment.
     * @returns {string} the encoded segment.
     */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }

    /**
     * Encode a `/`-separated path segment by segment.
     * @param {string} path - slash-separated path.
     * @returns {string} the encoded path.
     */
    function encodePath(path) {
      return path.split('/').map(encodeSegment).join('/');
    }

    /**
     * Build the right Sidebar's `file` address for one Host path. A path inside
     * the Session workspace is addressed workspace-relative; anything else keeps
     * its absolute spelling, which the resource provider resolves as-is.
     * @param {object} session - Session identity and workspace root.
     * @param {string} absolutePath - Host path the file service resolved.
     * @returns {string} the `dsh-resource://file/…` address.
     */
    function fileAddress(session, absolutePath) {
      const normalized = absolutePath.replace(/\\/g, '/');
      const root = session.cwd === undefined ? '' : session.cwd.replace(/\\/g, '/').replace(/\/+$/, '');
      let path = normalized;
      if (root !== '' && (normalized === root || normalized.startsWith(`${root}/`))) {
        path = normalized === root ? '' : normalized.slice(root.length + 1);
      }
      return `dsh-resource://file/session/${encodeSegment(session.sessionId)}/${encodePath(path.replace(/^(?:\.\/)+/, ''))}`;
    }

    /**
     * Read the file reference one contextmenu event landed on.
     *
     * The shipped surfaces expose the path they would open: inline mentions and
     * Markdown file links carry it in `title`, a delivered-file card's preview
     * button does too, and a changed-file row names it in the hidden description
     * the row points at. A reference without one is left to the browser menu.
     * @param {EventTarget | null} target - the event target.
     * @returns {{ path: string, element: Element } | null} the reference, or none.
     */
    function readFileReference(target) {
      const origin = target instanceof Element
        ? target
        : target instanceof Node ? target.parentElement : null;
      if (origin === null) return null;
      const mention = origin.closest(FILE_MENTION_SELECTOR);
      if (mention !== null) {
        const path = mention.getAttribute('title');
        if (path !== null && path !== '') return { path, element: mention };
      }
      const presented = origin.closest(PRESENTED_FILE_SELECTOR);
      if (presented !== null) {
        const path = presented.querySelector('button[title]')?.getAttribute('title');
        if (path !== null && path !== undefined && path !== '') return { path, element: presented };
      }
      const changed = origin.closest(CHANGED_FILES_SELECTOR);
      if (changed !== null) {
        const row = origin.closest('button[aria-describedby]');
        const described = row === null ? undefined : row.getAttribute('aria-describedby')?.split(/\s+/)[0];
        const path = described === undefined || described === ''
          ? null
          : document.getElementById(described)?.textContent?.trim();
        if (row !== null && changed.contains(row) && path !== null && path !== undefined && path !== '') {
          return { path, element: row };
        }
      }
      return null;
    }

    /**
     * State and actions of the file-reference menu.
     *
     * The menu lives outside the Session-scoped slot tree, in `shell.overlay`,
     * because that is the sanctioned top layer for frame-wide surfaces. The
     * Session facts its actions need — workspace root and identity — are only
     * rendered inside a Session, so the bridge below publishes them here and the
     * newest mount names the Session the menu acts on.
     * @param {object} ctx - Client Cordis context.
     * @param {{ current: Function }} translate - the live namespace translator.
     * @returns {object} the menu controller.
     */
    function createFileMenu(ctx, translate) {
      /**
       * Read one Client service without making it a plugin dependency: the file
       * entries simply stay disabled in a composition that does not serve it.
       * @param {string} name - exact Client service name.
       * @returns {any} the service, or undefined.
       */
      const service = (name) => {
        try {
          return ctx.get(name);
        } catch {
          return undefined;
        }
      };
      /** Localized text through the namespace translator. */
      const t = (key, params) => translate.current(key, params);

      /** Closed-menu state; replaced, never mutated, so the snapshot stays comparable. */
      const CLOSED = Object.freeze({
        open: false,
        pending: false,
        resolved: null,
        target: null,
        session: null,
        anchor: null,
        notice: null,
        apps: null,
      });
      let snapshot = CLOSED;
      const listeners = new Set();
      /** Mounted bridges, oldest first; the newest one names the Session to act on. */
      const bridges = [];
      /** Inspection generation: a newer open, or a close, retires an older answer. */
      let generation = 0;
      /** Cached native-desktop answer: null while unknown, otherwise a boolean. */
      let desktop = null;
      /**
       * Associations already read per Session path. The 「打开方式」 list is the
       * one expensive host read (Windows enumerates registered handlers), so it
       * is fetched when that entry is first expanded rather than on open, and a
       * later right-click on the same file reuses the answer.
       */
      const applicationsCache = new Map();

      /** Notify every subscription of a state change. */
      const emit = () => {
        for (const listener of listeners) listener();
      };

      /**
       * Publish one state patch and notify subscribers.
       * @param {object} patch - fields to replace.
       */
      const publish = (patch) => {
        snapshot = { ...snapshot, ...patch };
        emit();
      };

      /**
       * Observe menu state.
       * @param {Function} listener - notified on every published change.
       * @returns {() => void} unsubscribe.
       */
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      };

      /**
       * Read menu state.
       * @returns {object} the current immutable snapshot.
       */
      const getSnapshot = () => snapshot;

      /**
       * Publish one Session's facts from a mounted bridge.
       * @param {object} session - Session identity and workspace root.
       * @returns {() => void} detach, used by the bridge's effect cleanup.
       */
      function attach(session) {
        const token = { session };
        bridges.push(token);
        return () => {
          const at = bridges.indexOf(token);
          if (at !== -1) bridges.splice(at, 1);
        };
      }

      /** The Session the menu acts on, or null when no bridge is mounted. */
      const currentSession = () => (bridges.length === 0 ? null : bridges[bridges.length - 1].session);

      /**
       * Anchor rectangle for the shipped `Menu`: a zero-size box at the pointer,
       * which is then clamped against the window edges by the primitive itself.
       * @returns {object} the rectangle `Menu` positions against.
       */
      const anchorRect = () => {
        const point = snapshot.anchor ?? { x: 0, y: 0 };
        return { left: point.x, top: point.y, right: point.x, bottom: point.y, width: 0, height: 0 };
      };

      /**
       * Whether this page talks to the Host over loopback — the browser and the
       * Host are the same machine. The Client Remote publishes that answer with
       * the host facts; only then does an OS clipboard write land in the user's
       * own clipboard rather than the Host's.
       * @returns {boolean} true for a local page, false for a remote one.
       */
      function isLocalPage() {
        const remote = service('remote');
        try {
          return remote?.$host?.isLoopback === true;
        } catch {
          return false;
        }
      }

      /**
       * Whether the Host can hand a path to its desktop, read once per connection.
       * @returns {Promise<boolean>} the Host's answer, false when it cannot ask.
       */
      async function desktopAvailable() {
        if (desktop !== null) return desktop;
        const remote = service('remote.session') ?? service('remote')?.session;
        if (remote === undefined || typeof remote.canOpenWorkspacePath !== 'function') return false;
        try {
          const result = await remote.canOpenWorkspacePath();
          desktop = result?.ok === true && result.value === true;
        } catch {
          desktop = false;
        }
        return desktop;
      }

      /**
       * Read one complete regular file through the workspace file service.
       *
       * The service refuses (rather than truncates) a file above the Host's
       * complete-file cap, so the refusal code travels back with the result and
       * the caller can say why nothing was copied.
       * @param {object} session - Session identity.
       * @param {string} path - rooted path the Host resolved.
       * @returns {Promise<{ data: Uint8Array | null, code: string | null }>} bytes, or the failure code.
       */
      async function readFile(session, path) {
        const workspaces = service('remote.workspaceFiles') ?? service('remote')?.workspaceFiles;
        if (workspaces === undefined || typeof workspaces.readBytes !== 'function') {
          return { data: null, code: 'unavailable' };
        }
        if (session.sessionId === undefined) return { data: null, code: 'unavailable' };
        try {
          const result = await workspaces.readBytes(session.sessionId, path, {});
          if (result?.ok !== true) return { data: null, code: result?.error?.code ?? 'failed' };
          const data = result.value?.data;
          return data instanceof Uint8Array
            ? { data, code: null }
            : { data: null, code: 'failed' };
        } catch {
          return { data: null, code: 'failed' };
        }
      }

      /**
       * Copy one file onto the Host machine's system clipboard as a file, through
       * the host half's authenticated route.
       * @param {object} resolved - availability facts.
       * @param {Element | null} anchor - element the notice points at.
       * @returns {Promise<void>} after the notice published.
       */
      async function copyFileToClipboard(resolved, anchor) {
        let ok = false;
        try {
          const response = await fetch('api/recent-sessions.copy-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: resolved.absolutePath }),
          });
          ok = response.ok;
        } catch {
          ok = false;
        }
        notify(anchor, t(ok ? 'file.fileCopied' : 'file.copyFileFailed'), ok ? 'success' : 'error');
      }

      /**
       * Resolve what one reference can currently do.
       * @param {object} session - Session identity and workspace root.
       * @param {string} path - reference as the reply rendered it.
       * @returns {Promise<object>} availability facts for the item builder.
       */
      async function inspect(session, path) {
        const workspaces = service('remote.workspaceFiles') ?? service('remote')?.workspaceFiles;
        let stat = null;
        if (workspaces !== undefined && typeof workspaces.stat === 'function' && session.sessionId !== undefined) {
          try {
            const result = await workspaces.stat(session.sessionId, path);
            if (result?.ok === true) stat = result.value;
          } catch {
            stat = null;
          }
        }
        const absolutePath = stat?.absolutePath ?? rootedPath(session.cwd, path);
        const canUseDesktop = await desktopAvailable();
        const sidebarRight = service('sidebarRight');
        return {
          stat,
          absolutePath,
          desktop: canUseDesktop,
          sidebar: sidebarRight !== undefined && typeof sidebarRight.openResource === 'function',
          local: isLocalPage(),
        };
      }

      /**
       * Cache key of one file's file associations.
       * @param {object} session - Session identity.
       * @param {string} absolutePath - Host path the file service resolved.
       * @returns {string} the cache key.
       */
      function applicationsKey(session, absolutePath) {
        return `${session.sessionId}\n${absolutePath}`;
      }

      /**
       * Load the 「打开方式」 list for the open menu, once per file.
       *
       * The primitive has no hover callback for a submenu, so the shipped menu's
       * submenu item starts with a loading row and this method is called when the
       * overlay sees that row's trigger hovered (or when the row is clicked). A
       * cached answer is published synchronously, so a second right-click on the
       * same file never pays for the host read.
       * @returns {Promise<void>} after the list or its failure is published.
       */
      async function loadApplications() {
        const state = snapshot;
        if (state.open !== true || state.resolved === null || state.session === null) return;
        if (state.resolved.desktop !== true || state.resolved.stat === null) return;
        const key = applicationsKey(state.session, state.resolved.absolutePath);
        const cached = applicationsCache.get(key);
        if (cached !== undefined) {
          if (state.apps?.key !== key || state.apps.status !== 'ready') {
            publish({ apps: { key, status: 'ready', list: cached } });
          }
          return;
        }
        if (state.apps?.key === key && (state.apps.status === 'loading' || state.apps.status === 'failed')) return;
        publish({ apps: { key, status: 'loading', list: [] } });
        const remote = service('remote.session') ?? service('remote')?.session;
        let list = [];
        let ok = false;
        if (remote !== undefined && typeof remote.workspacePathApplications === 'function') {
          try {
            const result = await remote.workspacePathApplications({ path: state.resolved.absolutePath });
            if (result?.ok === true && Array.isArray(result.value)) {
              list = result.value;
              ok = true;
            }
          } catch {
            ok = false;
          }
        }
        if (snapshot.open !== true || snapshot.apps?.key !== key) return;
        if (!ok) {
          publish({ apps: { key, status: 'failed', list: [] } });
          return;
        }
        if (applicationsCache.size > 64) applicationsCache.clear();
        applicationsCache.set(key, list);
        publish({ apps: { key, status: 'ready', list } });
      }

      /**
       * Open the menu for one reference.
       * @param {{ path: string, element: Element }} reference - the reference clicked.
       * @param {{ x: number, y: number }} point - viewport point of the click.
       * @returns {boolean} whether this plugin took the event; false lets the browser show its menu.
       */
      function open(reference, point) {
        const session = currentSession();
        if (session === null) return false;
        const id = ++generation;
        publish({
          open: true,
          pending: true,
          resolved: null,
          target: reference,
          session,
          anchor: point,
          notice: null,
          apps: null,
        });
        inspect(session, reference.path).then((resolved) => {
          if (id !== generation || snapshot.open !== true) return;
          const key = applicationsKey(session, resolved.absolutePath);
          const cached = applicationsCache.get(key);
          publish({
            pending: false,
            resolved,
            apps: resolved.desktop && resolved.stat !== null
              ? { key, status: cached === undefined ? 'idle' : 'ready', list: cached ?? [] }
              : null,
          });
        }, () => {
          if (id !== generation || snapshot.open !== true) return;
          publish({
            pending: false,
            resolved: {
              stat: null,
              absolutePath: rootedPath(session.cwd, reference.path),
              desktop: false,
              sidebar: false,
            },
            apps: null,
          });
        });
        return true;
      }

      /** Retire the open menu, including any answer still in flight. */
      function close() {
        if (snapshot.open !== true) return;
        generation += 1;
        publish({ open: false, pending: false, resolved: null, target: null, session: null, apps: null });
      }

      /**
       * Raise the shipped transient Toast for one settled action.
       * @param {Element | null | undefined} anchor - element the notice points at.
       * @param {string} text - already-localized notice.
       * @param {string} tone - 'success' or 'error'.
       */
      function notify(anchor, text, tone) {
        publish({
          notice: {
            id: snapshot.notice === null ? 1 : snapshot.notice.id + 1,
            text,
            tone,
            anchor: anchor instanceof Element ? anchor : null,
          },
        });
      }

      /**
       * Retire one transient notice once its Toast has finished.
       * @param {number} id - notice identity.
       */
      function dismissNotice(id) {
        if (snapshot.notice?.id === id) publish({ notice: null });
      }

      /**
       * Forget the cached desktop answer and file associations when the connection
       * generation changes.
       */
      function resetHostFacts() {
        desktop = null;
        applicationsCache.clear();
      }

      /**
       * Copy a text value through the shipped clipboard primitive.
       * @param {string} value - text to copy.
       * @returns {Promise<boolean>} whether the browser accepted it.
       */
      async function copyText(value) {
        try {
          await writeClipboard(value);
          return true;
        } catch {
          return false;
        }
      }

      /**
       * Run one entry's shipped action.
       * @param {object} session - Session identity.
       * @param {object} resolved - availability facts captured when the menu opened.
       * @param {object} target - the reference the menu acts on.
       * @param {string} id - selected menu item id.
       * @param {Array<object>} applications - the 「打开方式」 list the item was built from.
       * @returns {Promise<void>} after the action settled and its notice published.
       */
      async function run(session, resolved, target, id, applications) {
        const remote = service('remote.session') ?? service('remote')?.session;
        const anchor = target?.element ?? null;
        if (id === FILE_MENU_ITEMS.copyPath) {
          const copied = await copyText(resolved.absolutePath);
          notify(anchor, t(copied ? 'file.pathCopied' : 'file.copyFailed'), copied ? 'success' : 'error');
          return;
        }
        if (id === FILE_MENU_ITEMS.sidebar) {
          const sidebarRight = service('sidebarRight');
          if (sidebarRight === undefined || typeof sidebarRight.openResource !== 'function') {
            notify(anchor, t('file.sidebarFailed'), 'error');
            return;
          }
          try {
            sidebarRight.openResource(fileAddress(session, resolved.absolutePath));
          } catch {
            notify(anchor, t('file.sidebarFailed'), 'error');
          }
          return;
        }
        if (id === FILE_MENU_ITEMS.saveAs) {
          await saveCopy(session, resolved, anchor);
          return;
        }
        if (id === FILE_MENU_ITEMS.copyContents) {
          await copyContents(session, resolved, anchor);
          return;
        }
        if (id === FILE_MENU_ITEMS.copyFile) {
          await copyFileToClipboard(resolved, anchor);
          return;
        }
        if (remote === undefined || typeof remote.openWorkspacePath !== 'function') {
          notify(anchor, t('file.openFailed'), 'error');
          return;
        }
        let request = { path: resolved.absolutePath };
        if (id === FILE_MENU_ITEMS.reveal) request = { path: resolved.absolutePath, action: 'reveal' };
        if (id.startsWith('app:')) {
          const application = applications[Number(id.slice(4))];
          if (application === undefined) return;
          request = { path: resolved.absolutePath, application: application.id };
        }
        let opened = false;
        try {
          const result = await remote.openWorkspacePath(request);
          opened = result?.ok === true;
        } catch {
          opened = false;
        }
        if (opened) return;
        notify(anchor, t(id === FILE_MENU_ITEMS.reveal ? 'file.revealFailed' : 'file.openFailed'), 'error');
      }

      /**
       * Copy the whole file's text. The complete-file read stays under the Host's
       * cap, and a non-UTF-8 or NUL-carrying body is reported instead of copied.
       * @param {object} session - Session identity.
       * @param {object} resolved - availability facts.
       * @param {Element | null} anchor - element the notice points at.
       * @returns {Promise<void>} after the notice published.
       */
      async function copyContents(session, resolved, anchor) {
        const read = await readFile(session, resolved.absolutePath);
        if (read.data === null) {
          notify(anchor, t(read.code === 'workspace-file/too-large' ? 'file.tooLarge' : 'file.copyFailed'), 'error');
          return;
        }
        let text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(read.data);
        } catch {
          notify(anchor, t('file.notText'), 'error');
          return;
        }
        if (text.includes('\u0000')) {
          notify(anchor, t('file.notText'), 'error');
          return;
        }
        const copied = await copyText(text);
        notify(anchor, t(copied ? 'file.contentsCopied' : 'file.copyFailed'), copied ? 'success' : 'error');
      }

      /**
       * Save one copy of the file through the browser's save picker, falling back
       * to a download when the picker is unavailable. The picker is opened first so
       * its user gesture is still valid; a cancelled picker saves nothing.
       * @param {object} session - Session identity.
       * @param {object} resolved - availability facts.
       * @param {Element | null} anchor - element the notice points at.
       * @returns {Promise<void>} after the notice published.
       */
      async function saveCopy(session, resolved, anchor) {
        const name = pathLabel(resolved.absolutePath);
        let picker = null;
        if (typeof window.showSaveFilePicker === 'function') {
          try {
            picker = await window.showSaveFilePicker({ suggestedName: name });
          } catch (error) {
            if (error?.name === 'AbortError') return;
            picker = null;
          }
        }
        const read = await readFile(session, resolved.absolutePath);
        if (read.data === null) {
          notify(anchor, t(read.code === 'workspace-file/too-large' ? 'file.tooLarge' : 'file.saveFailed'), 'error');
          return;
        }
        if (picker !== null) {
          try {
            const stream = await picker.createWritable();
            await stream.write(new Blob([read.data]));
            await stream.close();
            notify(anchor, t('file.saved'), 'success');
          } catch {
            notify(anchor, t('file.saveFailed'), 'error');
          }
          return;
        }
        const url = URL.createObjectURL(new Blob([read.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = name === '' ? 'download' : name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); }, 30_000);
        notify(anchor, t('file.saved'), 'success');
      }

      /**
       * Run the action one selected item names. The 「打开方式」 trigger row only
       * loads the list and leaves the menu open, so its submenu can render it in
       * place.
       * @param {string} id - selected menu item id.
       */
      function select(id) {
        if (id === 'apps-load') {
          loadApplications().catch(() => {});
          return;
        }
        const state = snapshot;
        const { target, resolved, session } = state;
        const applications = state.apps === null ? [] : state.apps.list;
        close();
        if (target === null || resolved === null || session === null) return;
        run(session, resolved, target, id, applications).catch(() => {
          notify(target.element ?? null, t('file.actionFailed'), 'error');
        });
      }

      return {
        subscribe,
        getSnapshot,
        attach,
        open,
        close,
        select,
        loadApplications,
        anchorRect,
        dismissNotice,
        resetHostFacts,
      };
    }

    /**
     * Build the shipped menu's item array for the current state.
     *
     * Items are the `Menu` primitive's own `items` shape, so separators, the label
     * row and the 打开方式 submenu are rendered by the shipped component.
     * @param {object} state - the menu snapshot.
     * @param {Function} t - namespace translator.
     * @returns {Array<object>} menu items.
     */
    function fileMenuItems(state, t) {
      const resolved = state.resolved;
      if (state.pending === true || resolved === null) {
        return [{ type: 'label', id: 'pending', text: t('file.loading') }];
      }
      const items = [];
      if (resolved.stat === null) {
        // The Host's file service answered with nothing: the reference is stale,
        // so only the path itself is still meaningful.
        items.push({ type: 'label', id: 'missing', text: t('file.missing') });
        items.push({ type: 'separator', id: 'missing-separator' });
        items.push({
          id: FILE_MENU_ITEMS.copyPath,
          label: t('file.copyPath'),
          icon: jsx(IconCopyOutlineRegular, {}),
        });
        return items;
      }
      if (resolved.desktop) {
        items.push({
          id: FILE_MENU_ITEMS.open,
          label: t('file.open'),
          icon: jsx(IconRightUpOutlineRegular, {}),
        });
        items.push({
          id: FILE_MENU_ITEMS.reveal,
          label: t('file.reveal'),
          icon: jsx(IconBrowseOutlineRegular, {}),
        });
      }
      if (resolved.sidebar === true) {
        items.push({
          id: FILE_MENU_ITEMS.sidebar,
          label: t('file.sidebar'),
          icon: jsx(IconPanelLeftOutlineRegular, {}),
        });
      }
      if (resolved.desktop && state.apps !== null) {
        const apps = state.apps;
        if (apps.status === 'ready' && apps.list.length > 0) {
          items.push({
            id: FILE_MENU_ITEMS.openWith,
            label: t('file.openWith'),
            icon: jsx(IconAppsAddOutlineRegular, {}),
            submenu: apps.list.map((application, index) => ({
              id: `app:${index}`,
              label: application.default === true
                ? t('file.defaultApp', { name: application.name })
                : application.name,
              icon: typeof application.icon === 'string' && application.icon !== ''
                ? jsx('img', { src: application.icon, alt: '', className: 'dshRecent_appIcon' })
                : undefined,
            })),
          });
        } else if (apps.status !== 'failed') {
          // The list is read only when this submenu is expanded, so its trigger
          // starts with one loading row; hovering the trigger starts the read (the
          // row is clickable too, as a fallback) and the rows are replaced once the
          // Host answers.
          items.push({
            id: FILE_MENU_ITEMS.openWith,
            label: t('file.openWith'),
            icon: jsx(IconAppsAddOutlineRegular, {}),
            submenu: [{ id: 'apps-load', label: t('file.loading') }],
          });
        }
      }
      items.push({ type: 'separator', id: 'actions-separator' });
      items.push({
        id: FILE_MENU_ITEMS.saveAs,
        label: t('file.saveAs'),
        icon: jsx(IconDownloadOutlineRegular, {}),
      });
      items.push({
        id: FILE_MENU_ITEMS.copyPath,
        label: t('file.copyPath'),
        icon: jsx(IconCopyOutlineRegular, {}),
      });
      items.push({
        id: FILE_MENU_ITEMS.copyContents,
        label: t('file.copyContents'),
        icon: jsx(IconDeliverDocRegular, {}),
      });
      // 「复制文件」 writes the Host's OS clipboard, which is only the user's own
      // clipboard while the page and the Host are the same machine. A remote page
      // gets no entry at all; 「另存为…」 already brings the file over.
      if (resolved.local === true) {
        items.push({
          id: FILE_MENU_ITEMS.copyFile,
          label: t('file.copyFile'),
          icon: jsx(IconPaperclipOutlineRegular, {}),
        });
      }
      return items;
    }

    /**
     * Session bridge: publish the facts the overlay menu needs. Renders nothing;
     * it exists to run inside the Session-scoped slot tree, where `sessionId` and
     * the standard Session hook are available.
     * @param {object} props - Session identity, standard Session hook and menu controller.
     * @returns {null} no element.
     */
    function FileMenuBridge({ sessionId, useSessions, menu }) {
      const cwd = useSessions((state) => state?.byId?.[sessionId]?.cwd);
      useEffect(() => menu.attach({ sessionId, cwd }), [menu, sessionId, cwd]);
      return null;
    }

    /**
     * Overlay host: the document-level `contextmenu` filter and the file menu.
     *
     * Right-click is intercepted only when the target is one of the shipped file
     * references and this plugin has a Session to act on; anything else is left
     * alone, so the browser's own menu and the chat's text-selection gestures keep
     * working everywhere else.
     * @param {object} props - menu controller and translator.
     * @returns {object | null} the menu while open, otherwise null.
     */
    function FileReferenceMenu({ menu, t }) {
      const state = useSyncExternalStore(menu.subscribe, menu.getSnapshot, menu.getSnapshot);
      useEffect(() => {
        const onContextMenu = (event) => {
          if (event.defaultPrevented) return;
          const reference = readFileReference(event.target);
          if (reference === null) return;
          // A keyboard-raised contextmenu reports no point; hang the menu off the
          // reference itself, the same place the pointer would have landed.
          const bounds = reference.element.getBoundingClientRect();
          const keyboard = event.clientX === 0 && event.clientY === 0;
          const anchor = keyboard
            ? { x: bounds.left, y: bounds.bottom }
            : { x: event.clientX, y: event.clientY };
          if (!menu.open(reference, anchor)) return;
          event.preventDefault();
          event.stopPropagation();
        };
        // The shipped menu has no submenu-hover callback, so the one submenu it
        // holds — 「打开方式」 — is recognized by its submenu trigger and its list is
        // read at that moment rather than while opening the menu.
        const onMouseOver = (event) => {
          if (menu.getSnapshot().open !== true) return;
          const element = event.target instanceof Element ? event.target : null;
          if (element === null) return;
          if (element.closest('button[role="menuitem"][aria-haspopup="menu"]') === null) return;
          menu.loadApplications().catch(() => {});
        };
        document.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('mouseover', onMouseOver);
        return () => {
          document.removeEventListener('contextmenu', onContextMenu, true);
          document.removeEventListener('mouseover', onMouseOver);
        };
      }, [menu]);
      const open = state.open === true;
      const notice = state.notice;
      if (!open && notice === null) return null;
      return jsxs(Fragment, {
        children: [
          open ? jsx(Menu, {
            key: 'file-menu',
            open: true,
            portal: true,
            autoFocus: true,
            anchor: jsx('span', { key: 'file-menu-anchor', 'aria-hidden': 'true' }),
            getAnchorRect: menu.anchorRect,
            items: fileMenuItems(state, t),
            onSelect: (id) => { menu.select(id); },
            onClose: () => { menu.close(); },
          }) : null,
          notice === null ? null : jsx(Toast, {
            key: `file-menu-notice:${notice.id}`,
            text: notice.text,
            tone: notice.tone,
            anchor: notice.anchor ?? undefined,
            onDone: () => { menu.dismissNotice(notice.id); },
          }),
        ],
      });
    }

    // --------------------------------------------------------------- locales

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'section.label': '最近',
      'sort.label': '排序方式',
      'sort.button': '排序方式：{current}',
      'sort.updated': '最新',
      'empty': '还没有会话',
      'more.expand': '再显示 {n} 个（剩余 {left} 个）',
      'more.collapse': '收起',
      'session.untitled': '未命名',
      'row.pinned': '已置顶',
      'pin.add': '在「最近」中置顶',
      'pin.remove': '取消「最近」置顶',
      'row.project': '所属项目：{name}',
      'row.menu.aria': '{name} 的更多操作',
      'menu.rename': '重命名',
      'menu.fork': '分叉会话',
      'menu.archive': '归档会话',
      'menu.copyId': '复制 Session ID',
      'menu.renameTitle': '重命名会话',
      'menu.renameAction': '重命名',
      'menu.renameFailed': '重命名失败',
      'menu.cancel': '取消',
      'menu.close': '关闭',
      'time.now': '刚刚',
      'time.minutes': '{n}分钟',
      'time.hours': '{n}小时',
      'time.days': '{n}天',
      'time.months': '{n}个月',
      'time.years': '{n}年',
      'status.approval': '等待审批',
      'status.plan-review': '计划待审',
      'status.question': '等待回答',
      'status.running': '进行中',
      'status.completed': '已完成',
      'status.idle': '空闲',
      'status.compact.approval': '待审批',
      'status.compact.planReview': '计划待审',
      'status.compact.answer': '待回答',
      'settings.nav': '最近会话',
      'settings.countTitle': '默认显示条数',
      'settings.countDescription': '「最近」在点击「展开更多」前收录的会话数量，最大 {max} 条。',
      'settings.stepTitle': '每次展开条数',
      'settings.stepDescription': '每次点击「再显示」新增渲染的会话数量，最大 {max} 条。',
      'settings.rowsTitle': '显示高度（会话条数）',
      'settings.rowsDescription': '「最近」占用的高度，按会话条目数计算；超出部分用鼠标滚动查看，最大 {max} 条。',
      'settings.notifyTitle': '完成提醒（Windows 桌面通知）',
      'settings.notifyDescription': '后台会话跑完后，在 Windows 右下角弹出系统通知，横幅消失后仍留在通知中心；浏览器最小化也会弹。正在前台的主会话不弹，子智能体、空白和已归档会话也不弹，点通知直接跳回该会话。',
      'settings.notifyOn': '已开启桌面提醒',
      'settings.notifyOff': '已关闭桌面提醒',
      'settings.notifyBlocked': '浏览器拒绝了通知权限。请点击地址栏左侧的站点图标，把「通知」改为「允许」，再回到这里开启。',
      'settings.notifyDenied': '通知权限已被拒绝。请点击地址栏左侧的站点图标，把「通知」改为「允许」，然后刷新页面。',
      'settings.notifyUnsupported': '当前浏览器不支持系统通知。',
      'notify.done': '会话已完成',
      'notify.doneIn': '「{project}」的会话已完成',
      'file.loading': '正在检查文件…',
      'file.missing': '文件不存在',
      'file.open': '打开文件',
      'file.reveal': '在资源管理器中打开',
      'file.sidebar': '在右侧栏打开',
      'file.openWith': '打开方式',
      'file.defaultApp': '{name}（默认）',
      'file.saveAs': '另存为…',
      'file.copyPath': '复制路径',
      'file.copyContents': '复制文件内容',
      'file.copyFile': '复制文件',
      'file.fileCopied': '文件已复制到剪贴板',
      'file.copyFileFailed': '无法复制文件',
      'file.tooLarge': '文件太大，无法读取',
      'file.pathCopied': '路径已复制',
      'file.contentsCopied': '文件内容已复制',
      'file.saved': '副本已保存',
      'file.copyFailed': '复制失败',
      'file.notText': '这不是文本文件，无法复制内容',
      'file.openFailed': '无法打开文件',
      'file.revealFailed': '无法在资源管理器中显示',
      'file.sidebarFailed': '无法在右侧栏打开',
      'file.saveFailed': '无法保存副本',
      'file.actionFailed': '操作失败',
      'settings.invalid': '默认条数和展开步长请输入 1 到 {maxCount} 之间的整数，高度请输入 1 到 {maxRows} 之间的整数。',
      'settings.saved': '设置已保存',
      'settings.failed': '无法保存设置',
      'settings.save': '保存',
      'settings.unavailable': '宿主尚未提供本插件的配置，暂时无法修改；「最近」仍按默认值显示。',
      'settings.fieldPending': '宿主尚未加载本项配置，重启 DSH 后可用。',
      'version.untagged': '未打标签（{ref}）',
      'version.noTag': '未打标签（{commit}）',
      'version.unknown': '未知版本',
      'version.unknownRepo': '未知仓库',
    };

    /** English dictionary, kept complete against the zh key set. */
    const en = {
      'section.label': 'Recent',
      'sort.label': 'Sort order',
      'sort.button': 'Sort: {current}',
      'sort.updated': 'Newest',
      'empty': 'No sessions yet',
      'more.expand': 'Show {n} more ({left} remaining)',
      'more.collapse': 'Show less',
      'session.untitled': 'Untitled',
      'row.pinned': 'Pinned in Recent',
      'pin.add': 'Pin in Recent',
      'pin.remove': 'Unpin in Recent',
      'row.project': 'Project: {name}',
      'row.menu.aria': 'More actions for {name}',
      'menu.rename': 'Rename',
      'menu.fork': 'Fork session',
      'menu.archive': 'Archive session',
      'menu.copyId': 'Copy Session ID',
      'menu.renameTitle': 'Rename session',
      'menu.renameAction': 'Rename',
      'menu.renameFailed': 'Could not rename the session',
      'menu.cancel': 'Cancel',
      'menu.close': 'Close',
      'time.now': 'now',
      'time.minutes': '{n}min',
      'time.hours': '{n}h',
      'time.days': '{n}d',
      'time.months': '{n}mo',
      'time.years': '{n}y',
      'status.approval': 'Waiting for approval',
      'status.plan-review': 'Plan awaiting review',
      'status.question': 'Waiting for answer',
      'status.running': 'Running',
      'status.completed': 'Completed',
      'status.idle': 'Idle',
      'status.compact.approval': 'Approval',
      'status.compact.planReview': 'Plan review',
      'status.compact.answer': 'Answer',
      'settings.nav': 'Recent Sessions',
      'settings.countTitle': 'Sessions collected',
      'settings.countDescription': 'How many sessions Recent lists before 「Show more」, up to {max}.',
      'settings.stepTitle': 'Rows per expansion',
      'settings.stepDescription': 'How many more sessions each 「Show more」 click renders, up to {max}.',
      'settings.rowsTitle': 'Height (session rows)',
      'settings.rowsDescription': 'How tall Recent is, measured in session rows; anything beyond scrolls, up to {max} rows.',
      'settings.notifyTitle': 'Completion notice (Windows desktop notification)',
      'settings.notifyDescription': 'When a background session finishes, Windows raises a system notification in the bottom-right corner and keeps it in the Action Center after the banner fades; a minimized browser still notifies. The session on screen never does, nor do subagent, blank and archived sessions; clicking the notification opens that session.',
      'settings.notifyOn': 'Desktop notifications on',
      'settings.notifyOff': 'Desktop notifications off',
      'settings.notifyBlocked': 'The browser refused the notification permission. Click the site icon left of the address bar, allow Notifications, then come back and turn this on again.',
      'settings.notifyDenied': 'Notifications are blocked for this site. Click the site icon left of the address bar, allow Notifications, then reload the page.',
      'settings.notifyUnsupported': 'This browser has no system notification support.',
      'notify.done': 'Session finished',
      'notify.doneIn': 'A session in “{project}” finished',
      'file.loading': 'Checking the file…',
      'file.missing': 'File not found',
      'file.open': 'Open file',
      'file.reveal': 'Reveal in File Explorer',
      'file.sidebar': 'Open in sidebar',
      'file.openWith': 'Open with',
      'file.defaultApp': '{name} (default)',
      'file.saveAs': 'Save as…',
      'file.copyPath': 'Copy path',
      'file.copyContents': 'Copy file contents',
      'file.copyFile': 'Copy file',
      'file.fileCopied': 'File copied to the clipboard',
      'file.copyFileFailed': 'Could not copy the file',
      'file.tooLarge': 'The file is too large to read',
      'file.pathCopied': 'Path copied',
      'file.contentsCopied': 'File contents copied',
      'file.saved': 'Copy saved',
      'file.copyFailed': 'Could not copy',
      'file.notText': 'This is not a text file, so its contents cannot be copied',
      'file.openFailed': 'Could not open the file',
      'file.revealFailed': 'Could not reveal the file',
      'file.sidebarFailed': 'Could not open it in the sidebar',
      'file.saveFailed': 'Could not save a copy',
      'file.actionFailed': 'The action failed',
      'settings.invalid': 'Enter 1–{maxCount} for the default count and expansion step, and 1–{maxRows} for the height.',
      'settings.saved': 'Preference saved',
      'settings.failed': 'Could not save preference',
      'settings.save': 'Save',
      'settings.unavailable': 'The Host is not serving this plugin\'s configuration yet, so it cannot be changed. Recent uses the defaults.',
      'settings.fieldPending': 'The Host has not loaded this field yet; restart DSH to enable it.',
      'version.untagged': 'Untagged ({ref})',
      'version.noTag': 'Untagged ({commit})',
      'version.unknown': 'Unknown version',
      'version.unknownRepo': 'Unknown repository',
    };

    /** Translator resolved once and re-read through `current` on every locale change. */
    const translate = { current: (key) => key };

    // ------------------------------------------------------------------ body

    /** Services used by the browser half. */
    const inject = ['slots', 'locale', 'uiWorkspace', 'configForms', 'sessions'];

    /**
     * Mount both surfaces.
     * @param {object} ctx - Client Cordis context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        ensureStyles();
        return ctx.locale.register(NS, { zh, en });
      }, 'dsh-recent-sessions: dictionaries');

      const locale = ctx.get('locale');
      if (locale !== undefined) {
        const bound = locale.bind(NS);
        translate.current = bound;
      }

      // One Host form backs both surfaces, so a change on the settings page is
      // visible in the sidebar without a reload.
      const form = ctx.configForms.get(HOST_NAMESPACE);
      const hooks = () => ({ hooks: { preference: form } });

      const uiWorkspace = ctx.get('uiWorkspace');
      const openSession = (sessionId) => {
        uiWorkspace?.openSession(sessionId);
      };

      // The row actions go through `uiWorkspace` — the same public capability the
      // workspace rows use — so fork, archive and their Host refusals behave
      // identically here. Rename is the exception: `uiWorkspace` keeps its rename
      // request private to the workspace browser's overlay entry, so the dialog
      // below drives the public `ctx.sessions` rename itself.
      const renameRequests = createRenameRequests();
      const sessions = ctx.get('sessions');
      const actions = {
        /**
         * Open the rename dialog for one Session.
         * @param {string} sessionId - Session to rename.
         * @param {string} currentTitle - title the dialog seeds its draft from.
         */
        rename: (sessionId, currentTitle) => {
          renameRequests.request({ sessionId, currentTitle });
        },
        /**
         * Fork a Session at its last completed turn.
         * @param {string} sessionId - source Session.
         */
        fork: (sessionId) => {
          uiWorkspace?.forkSession(sessionId).catch((reason) => {
            console.warn('recent-sessions fork rejected:', reason);
          });
        },
        /**
         * Archive a Session, asking the Host to stop its running work if the plain
         * archive is refused.
         * @param {string} sessionId - Session to archive.
         */
        archive: (sessionId) => {
          uiWorkspace?.archiveSession(sessionId).catch((reason) => {
            console.warn('recent-sessions archive rejected:', reason);
          });
        },
        /**
         * Copy one Session's complete id.
         *
         * `writeClipboard` is the primitive's own helper — the same call the
         * shipped menu makes — so behaviour (including the execCommand fallback)
         * matches instead of being reimplemented here.
         * @param {string} sessionId - Session whose id is copied.
         */
        copyId: (sessionId) => {
          writeClipboard(sessionId).catch(() => false);
        },
      };
      // No shortcut catalog is read here: the shipped menu rows show key hints,
      // and those commands address the *current* main-view Session rather than
      // the row the menu belongs to. Printing the same hints beside a 「最近」 row
      // would promise a binding that would not act on that row, so this menu
      // deliberately shows none.

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-recent-sessions',
        order: 10,
        label: () => translate.current('section.label'),
        locale: NS,
        inject: () => ({ ...hooks(), openSession, actions, t: translate.current }),
      }, RecentSessionsSection));

      // Registered unconditionally: the navigation row is a projection of this
      // ledger, so gating it on the Host settings namespace made the page come
      // and go with configuration-service timing. The page itself degrades to a
      // read-only notice when the namespace is not served.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-recent-sessions',
        order: 25,
        label: () => translate.current('settings.nav'),
        locale: NS,
        inject: () => ({
          ...hooks(),
          t: translate.current,
          saveValues: async (values) => {
            try {
              // The served form is the authority on which fields the Host can
              // still accept: a field the running Host does not know yet (a
              // reload pending) is skipped instead of failing the whole save.
              const served = form.getSnapshot().value ?? {};
              let accepted = true;
              for (const [field, value] of Object.entries(values)) {
                if (!Object.hasOwn(served, field)) continue;
                accepted = await form.set(field, value);
                if (accepted !== true) break;
              }
              return accepted;
            } catch {
              return false;
            }
          },
        }),
      }, RecentSessionsSettings));

      // The rename dialog a 「最近」 row menu raises. `shell.overlay` is the
      // sanctioned top-layer seat, so the dialog covers the frame exactly as the
      // workspace rename dialog does and takes the same modal focus handling.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-recent-sessions-rename',
        order: 91,
        locale: NS,
        inject: () => ({
          requests: renameRequests,
          sessions,
          t: translate.current,
        }),
      }, RenameDialog));

      // The notifier renders nothing, so it is a pure observer. It lives in
      // `shell.overlay` because that is the sanctioned root-scoped seat holding
      // the global status hooks, and because a future in-page banner would
      // already own a place there.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-recent-sessions',
        order: 90,
        locale: NS,
        inject: () => ({ ...hooks(), openSession, t: translate.current }),
      }, DesktopNotifier));

      // The file-reference menu is frame-wide: the overlay host owns the
      // `contextmenu` filter and the popup, while a Session-scoped bridge hands it
      // the workspace root the reply's relative paths resolve against. The bridge
      // renders nothing, so the conversation gains no visible row.
      const fileMenu = createFileMenu(ctx, translate);
      ctx.on('connection/reset', () => { fileMenu.resetHostFacts(); });
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock',
        id: 'dsh-recent-sessions-file-menu',
        order: 80,
        locale: NS,
        inject: () => ({ menu: fileMenu }),
      }, FileMenuBridge));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-recent-sessions-file-menu',
        order: 92,
        locale: NS,
        inject: () => ({ menu: fileMenu, t: translate.current }),
      }, FileReferenceMenu));
    }

    return { inject, apply };
  },
});