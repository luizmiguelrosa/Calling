import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api.service';

/**
 * Uploads the files a message can carry. A room file is stored under the room's
 * directory as-is (images render inline, everything else downloads), while the
 * profile photo is converted to a fixed-size JPEG by the server, so the client
 * only has to hand over the bytes.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly api = inject(ApiService);

  uploadRoomFile(roomId: string, file: File): Observable<FileResponse> {
    return this.api.post<FileResponse>(`/rooms/${roomId}/files`, this.toFormData(file));
  }

  uploadProfilePhoto(file: File): Observable<FileResponse> {
    return this.api.post<FileResponse>('/users/me/photo', this.toFormData(file));
  }

  private toFormData(file: File): FormData {
    const form = new FormData();
    form.append('file', file);
    return form;
  }
}
