interface User {
  id: string;
  username: string;
  name: string;
  role: "Developer" | "Admin";
  createdAt: string; // ISO timestamp
}

interface CreateUserInput {
  username: string; // 3-32 chars
  password: string; // 8-72 chars
  name: string; // 2-64 chars
  role: "Developer" | "Admin";
}

interface LoginRequest {
  username: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface LoginResponse extends TokenPair {
  user: UserResponse;
}

interface UserResponse {
  id: string;
  username: string;
  name: string;
  role: "Developer" | "Admin";
}

/** The availability a user can set for themselves. */
type UserStatus = 'online' | 'away' | 'dnd';

/** A user's availability as others see it; `offline` is server-sent on disconnect. */
type PresenceStatus = UserStatus | 'offline';

/** A presence frame relayed over the chat socket. */
interface StatusBroadcast {
  type: 'status';
  author: string;
  status: PresenceStatus;
}
