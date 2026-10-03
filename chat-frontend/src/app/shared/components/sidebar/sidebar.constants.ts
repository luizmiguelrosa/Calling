export const ZARD_SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const ZARD_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const ZARD_SIDEBAR_WIDTH = '16rem';
export const ZARD_SIDEBAR_WIDTH_MOBILE = '18rem';
export const ZARD_SIDEBAR_WIDTH_ICON = '3rem';
export const ZARD_SIDEBAR_KEYBOARD_SHORTCUT = 'b';
/**
 * Calling is a desktop-only Tauri app, so there is no narrow viewport to fall back
 * to. A breakpoint that can never match keeps the sidebar rendering in-page at
 * every width instead of switching to the drawer branch of `z-sidebar`.
 *
 * NOTE: this is a local patch to CLI-installed source. Re-running
 * `npx zard-cli add sidebar --overwrite` restores the upstream value.
 */
export const ZARD_SIDEBAR_MOBILE_BREAKPOINT = '(max-width: 0px)';
