import { Injectable, computed, signal } from '@angular/core';

/**
 * Drives the `dark` class that `styles.css` keys its tokens off — the theme is
 * one class on the document element, so switching it repaints the whole app
 * without any component-level state.
 *
 * The choice is persisted because a desktop app that forgets its theme on every
 * launch reads as broken. When nothing is stored, the OS preference decides, and
 * keeps deciding: a machine that switches to dark at sunset should follow it,
 * until the user makes an explicit choice here.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly STORAGE_KEY = 'calling_theme';

  private readonly systemPrefersDark = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );

  /** True when an explicit choice has been made, so the OS is no longer consulted. */
  private readonly hasExplicitChoice = signal(false);

  readonly dark = signal(false);
  readonly isDark = this.dark.asReadonly();
  readonly isExplicit = this.hasExplicitChoice.asReadonly();

  readonly mode = computed(() => (this.dark() ? 'dark' : 'light'));

  private detachSystemListener: (() => void) | null = null;

  /**
   * Runs as an app initializer, before the first paint. Applying the theme
   * later would flash the light palette at a user who chose dark.
   */
  init(): void {
    const stored = localStorage.getItem(ThemeService.STORAGE_KEY);
    const explicit = stored === 'dark' || stored === 'light';

    this.hasExplicitChoice.set(explicit);
    this.dark.set(explicit ? stored === 'dark' : this.systemPrefersDark());
    this.apply();

    if (!explicit) {
      this.watchSystem();
    }
  }

  setDark(dark: boolean): void {
    this.hasExplicitChoice.set(true);
    this.dark.set(dark);
    localStorage.setItem(ThemeService.STORAGE_KEY, dark ? 'dark' : 'light');

    // An explicit choice overrides the OS, so the listener is no longer wanted.
    this.detachSystemListener?.();
    this.detachSystemListener = null;

    this.apply();
  }

  toggle(): void {
    this.setDark(!this.dark());
  }

  private watchSystem(): void {
    if (typeof matchMedia !== 'function') {
      return;
    }

    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      this.systemPrefersDark.set(event.matches);
      this.dark.set(event.matches);
      this.apply();
    };

    query.addEventListener('change', onChange);
    this.detachSystemListener = () => query.removeEventListener('change', onChange);
  }

  private apply(): void {
    document.documentElement.classList.toggle('dark', this.dark());
  }
}