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
    const { useCallback, useEffect, useMemo, useRef, useState } = require('react');

    // dsh:version-meta:begin
const VERSION_META = Object.freeze(
  {
    "repoName": "@jackguo0310/dsh-recent-sessions",
    "tag": "v0.4.1",
    "describe": "v0.4.1",
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
    /**
     * Pin glyph, matching the one the workspace rows use so a pinned Session
     * reads identically in both places. The geometry follows the shipped
     * MIT-licensed icon; only the class names are this plugin's own.
     */
    const PIN_VIEW_BOX = '0 0 16 16';
    const PIN_ART = [
      jsx('path', {
        key: 'head',
        d: 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z',
        fill: 'currentColor',
        stroke: 'currentColor',
        strokeLinejoin: 'round',
      }),
      jsx('path', {
        key: 'stem',
        d: 'M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z',
        fill: 'currentColor',
      }),
    ];

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
      // The pin occupies the trailing cell: a pinned row shows it at rest, a
      // hovered row offers the toggle, and the time yields exactly as it does in
      // the workspace rows. It is a real button, so pinning works from here.
      '.dshRecent_pin{border:none;background:0 0;padding:0;cursor:pointer;width:16px;height:20px;flex:none;color:var(--dsw-alias-label-tertiary);align-items:center;justify-content:center;display:none}',
      '.dshRecent_pin svg{width:14px;height:14px;fill:currentColor}',
      '.dshRecent_pin[data-pinned="true"]{display:inline-flex;color:var(--dsw-alias-label-caption)}',
      '.dshRecent_pin:hover{color:var(--dsw-alias-label-primary)}',
      '.dshRecent_pin:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;border-radius:var(--dsw-radius-xs)}',
      '.dshRecent_row:hover .dshRecent_pin{display:inline-flex}',
      '.dshRecent_row:hover .dshRecent_time{display:none}',
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
    function RecentRow({ row, status, selected, onOpen, onTogglePin, t }) {
      const statuses = sessionStatuses(status, t);
      const primary = statuses[0];
      const project = row.workspaceLabel;
      const pinned = row.pinned === true;
      return jsxs('div', {
        className: selected ? 'dshRecent_row dshRecent_rowSelected' : 'dshRecent_row',
        role: 'listitem',
        tabIndex: 0,
        title: project === '' ? `${displayTitle(row.title, t)}` : `${project} · ${displayTitle(row.title, t)}`,
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
          jsx('span', { key: 'title', className: 'dshRecent_title', children: displayTitle(row.title, t) }),
          jsx('span', {
            key: 'time',
            className: 'dshRecent_time',
            'aria-hidden': primary.trailingLabel === undefined ? undefined : 'true',
            children: primary.trailingLabel ?? timeLabel(relativeTime(row.updatedAt, Date.now()), t),
          }),
          // A real toggle, unlike the shipped indicator: pinning from 「最近」 is
          // the point of having it here. The click stays in the button so the row
          // does not also open the Session.
          jsx('button', {
            key: 'pin',
            type: 'button',
            className: 'dshRecent_pin',
            'data-pinned': String(pinned),
            'aria-pressed': pinned ? 'true' : 'false',
            'aria-label': t(pinned ? 'pin.remove' : 'pin.add'),
            title: t(pinned ? 'pin.remove' : 'pin.add'),
            onClick: (event) => {
              event.stopPropagation();
              onTogglePin(row.id, pinned);
            },
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.stopPropagation();
            },
            children: jsx('svg', { viewBox: PIN_VIEW_BOX, 'aria-hidden': 'true', children: PIN_ART }),
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
    function RecentSessionsSection({ wide, useSessions, useSessionStatus, useWorkspaces, usePreference, openSession, t }) {
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

        for (const id of finished) {
          // The main-view Session is the one on screen: the user is already
          // watching it stop, so a toast for it would only be noise.
          if ((list.byId?.[id]?.retainedBy?.mainView ?? 0) > 0) continue;
          const summary = list.byId?.[id];
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
      }, [enabled, statuses, list.byId, workspaces, t]);

      return null;
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
      'settings.notifyDescription': '后台会话跑完后，在 Windows 右下角弹出系统通知，横幅消失后仍留在通知中心；浏览器最小化也会弹。正在前台的主会话不弹，点通知直接跳回该会话。',
      'settings.notifyOn': '已开启桌面提醒',
      'settings.notifyOff': '已关闭桌面提醒',
      'settings.notifyBlocked': '浏览器拒绝了通知权限。请点击地址栏左侧的站点图标，把「通知」改为「允许」，再回到这里开启。',
      'settings.notifyDenied': '通知权限已被拒绝。请点击地址栏左侧的站点图标，把「通知」改为「允许」，然后刷新页面。',
      'settings.notifyUnsupported': '当前浏览器不支持系统通知。',
      'notify.done': '会话已完成',
      'notify.doneIn': '「{project}」的会话已完成',
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
      'settings.notifyDescription': 'When a background session finishes, Windows raises a system notification in the bottom-right corner and keeps it in the Action Center after the banner fades; a minimized browser still notifies. The session on screen never does, and clicking the notification opens that session.',
      'settings.notifyOn': 'Desktop notifications on',
      'settings.notifyOff': 'Desktop notifications off',
      'settings.notifyBlocked': 'The browser refused the notification permission. Click the site icon left of the address bar, allow Notifications, then come back and turn this on again.',
      'settings.notifyDenied': 'Notifications are blocked for this site. Click the site icon left of the address bar, allow Notifications, then reload the page.',
      'settings.notifyUnsupported': 'This browser has no system notification support.',
      'notify.done': 'Session finished',
      'notify.doneIn': 'A session in “{project}” finished',
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
    const inject = ['slots', 'locale', 'uiWorkspace', 'configForms'];

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

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-recent-sessions',
        order: 10,
        label: () => translate.current('section.label'),
        locale: NS,
        inject: () => ({ ...hooks(), openSession, t: translate.current }),
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
    }

    return { inject, apply };
  },
});