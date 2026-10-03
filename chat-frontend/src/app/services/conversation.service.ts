import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, switchMap, tap, throwError } from 'rxjs';

import { RoomService } from './room.service';

/**
 * Single source of truth for the signed-in user's direct messages, shared by the
 * sidebar list and the "Nova conversa" picker so the two never disagree about
 * which conversations already exist.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly roomService = inject(RoomService);

  readonly dms = signal<DMRoomResponse[]>([]);
  readonly loading = signal(false);

  private loaded = false;

  refresh(): void {
    this.loading.set(true);

    this.roomService
      .getUserDMs()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: dms => {
          this.dms.set(dms);
          this.loaded = true;
        },
        error: () => undefined,
      });
  }

  /**
   * Opens the DM with `user`, creating it only when none exists yet. The create
   * response carries no peer fields, so they are filled from the user already in
   * hand instead of refetching the whole list.
   */
  openDirectMessage(user: UserResponse): Observable<DMRoomResponse> {
    if (!this.loaded) {
      return this.roomService.getUserDMs().pipe(
        tap(dms => {
          this.dms.set(dms);
          this.loaded = true;
        }),
        switchMap(() => this.resolve(user)),
      );
    }

    return this.resolve(user);
  }

  private resolve(user: UserResponse): Observable<DMRoomResponse> {
    const existing = this.dms().find(dm => dm.other_user_id === user.id);
    if (existing) {
      return of(existing);
    }

    return this.roomService.createDM(user.id).pipe(
      map(room => ({
        ...room,
        other_user_id: user.id,
        other_username: user.username,
        other_name: user.name,
      })),
      tap(dm => this.dms.update(dms => [dm, ...dms])),
      catchError(err => {
        // The room already existed on the server: our list was stale or the DM
        // was opened in another window. Re-read the directory and use it.
        if (err?.status !== 409) {
          return throwError(() => err);
        }

        return this.roomService.getUserDMs().pipe(
          tap(dms => {
            this.dms.set(dms);
            this.loaded = true;
          }),
          switchMap(dms => {
            const found = dms.find(dm => dm.other_user_id === user.id);
            // If it is still missing, the directory and the server disagree.
            // Completing with no value here would leave the caller hanging
            // forever, so it has to surface as an error.
            return found ? of(found) : throwError(() => new Error('dm-not-in-directory'));
          }),
        );
      }),
    );
  }
}
