/** The display role a user carries. A user has exactly one, shown in the profile preview. */
interface UserRoleRef {
  id: string;
  name: string;
  color: string;
}

/** A group a user belongs to. A user may hold several, and the colour is what the client uses for the group chip. */
interface UserGroupRef {
  id: string;
  name: string;
  color: string;
}

interface User {
  id: string;
  username: string;
  name: string;
  /** The single display role. */
  role: UserRoleRef | null;
  /** Groups are the permission-bearing entity; a user may hold several. */
  groups: UserGroupRef[];
  createdAt: string; // ISO timestamp
}

interface CreateUserInput {
  username: string; // 3-32 chars
  password: string; // 8-72 chars
  name: string; // 2-64 chars
  email: string;
  role_id: string;
  group_ids: string[];
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
  role: UserRoleRef | null;
  groups: UserGroupRef[];
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