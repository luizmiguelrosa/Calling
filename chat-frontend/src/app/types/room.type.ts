type RoomType = "public" | "direct";

interface RoomResponse {
  id: string;
  name: string;
  is_dm: boolean; // true for DM rooms
}

/** A DM room plus the participant on the other side of it. */
interface DMRoomResponse extends RoomResponse {
  other_user_id: string;
  other_username: string;
  other_name: string;
}

interface CreateRoomInput {
  name: string; // 3-32 chars
  is_dm: boolean;
}

interface CreateDMInput {
  receiver_id: string; // User ID of the recipient
}
