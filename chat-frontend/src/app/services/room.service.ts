import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ApiService } from "./api.service";

@Injectable({ providedIn: 'root' })
export class RoomService {
  constructor(private api: ApiService) {}

  createRoom(name: string): Observable<RoomResponse> {
    return this.api.post<RoomResponse>(
      '/rooms',
      { name, is_dm: false }
    );
  }

  createDM(receiverId: string): Observable<RoomResponse> {
    return this.api.post<RoomResponse>(
      '/rooms/dm',
      { receiver_id: receiverId }
    );
  }

  getPublicRooms(): Observable<RoomResponse[]> {
    return this.api.get<RoomResponse[]>('/rooms');
  }

  getUserDMs(): Observable<DMRoomResponse[]> {
    return this.api.get<DMRoomResponse[]>('/rooms/dm');
  }

  getRoomHistory(roomId: string): Observable<MessageBroadcast[]> {
    return this.api.get<MessageBroadcast[]>(
      `/history?room_id=${roomId}`
    );
  }
}
