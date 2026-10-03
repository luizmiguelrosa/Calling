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

interface LoginResponse {
  token: string;
  user: UserResponse;
}

interface UserResponse {
  id: string;
  username: string;
  name: string;
  role: "Developer" | "Admin";
}
