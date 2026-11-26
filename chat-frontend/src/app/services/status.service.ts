import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { WebSocketService } from './websocket.service';

/** How long without mouse or keyboard input before the user reads as away. */
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
/** Activity is sampled at this interval, not on every pointer move. */
const ACTIVITY_THROTTLE_MS = 1000;
/** How often the idle clock is checked while the window stays open. */
const IDLE_CHECK_MS = 15 * 1000;

/**
 * The user's status, persisted so a restart keeps the choice — the same reason
 * the theme and backend address are stored. The value is also announced over the
 * chat socket, so other clients can colour the user's presence dot.
 *
 * Two layers are kept apart: `current` is the choice the user made, while
 * `status` is what peers should see. Losing focus, locking the screen, or
 * staying idle flips the visible status to "away" without overwriting the
 * choice, so coming back restores "online" automatically. Do Not Disturb is a
 * sticky override: it is never replaced by the idle detector.
 */
@Injectable({ providedIn: 'root' })
export class StatusService {
  private static readonly STORAGE_KEY = 'talk_status';

  private readonly socket = inject(WebSocketService);

  private readonly current = signal<UserStatus>(this.read());
  private readonly idle = signal(false);

  /** The status as peers see it: the choice, with idle folded in. */
  readonly status = computed<UserStatus>(() => {
    const base = this.current();
    if (base === 'dnd') {
      return 'dnd';
    }
    return this.idle() ? 'away' : base;
  });

  /** True while the user has chosen Do Not Disturb, which mutes notifications. */
  readonly isDnd = computed(() => this.status() === 'dnd');

  private lastActivity = Date.now();
  private detectionStarted = false;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Announce the visible status whenever it changes, and again when the
    // socket reconnects, so peers learn the current state without waiting for
    // the user to touch the menu.
    effect(() => {
      const status = this.status();
      if (this.socket.connected()) {
        this.socket.sendStatus(status);
      }
    });
  }

  /** Choosing a status is an explicit action, so it also resets the idle clock. */
  setStatus(status: UserStatus): void {
    this.current.set(status);
    this.idle.set(false);
    this.lastActivity = Date.now();
    localStorage.setItem(StatusService.STORAGE_KEY, status);
  }

  /**
   * Starts the away detector: screen lock / hidden document and window blur mark
   * the user idle immediately, and mouse or keyboard activity brings them back.
   * The interval covers the case where the window simply sits untouched.
   */
  startIdleDetection(): void {
    if (this.detectionStarted || typeof window === 'undefined') {
      return;
    }
    this.detectionStarted = true;

    const markActive = () => this.markActive();
    const throttledActive = () => {
      if (Date.now() - this.lastActivity >= ACTIVITY_THROTTLE_MS) {
        this.markActive();
      }
    };

    window.addEventListener('mousemove', throttledActive, { passive: true });
    window.addEventListener('mousedown', markActive, { passive: true });
    window.addEventListener('keydown', markActive, { passive: true });
    window.addEventListener('wheel', throttledActive, { passive: true });
    window.addEventListener('touchstart', markActive, { passive: true });

    // A locked screen and a hidden window both report the document as hidden on
    // this platform, which is the closest portable signal to a lock event.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.idle.set(true);
      } else {
        this.markActive();
      }
    });

    window.addEventListener('blur', () => this.idle.set(true));
    window.addEventListener('focus', markActive);

    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastActivity >= IDLE_TIMEOUT_MS) {
        this.idle.set(true);
      }
    }, IDLE_CHECK_MS);
  }

  private markActive(): void {
    this.lastActivity = Date.now();
    if (this.idle()) {
      this.idle.set(false);
    }
  }

  private read(): UserStatus {
    const stored = localStorage.getItem(StatusService.STORAGE_KEY);
    return stored === 'away' || stored === 'dnd' || stored === 'online' ? stored : 'online';
  }
}