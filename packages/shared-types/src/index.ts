export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isVerified: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterResponse {
  user: AuthUser & { createdAt: string };
}

export interface ApiErrorResponse {
  message: string;
  details?: unknown;
}