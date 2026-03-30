export interface GoogleAuthPayload {
  id_token: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
}

export interface RegisterErrors {
  email?: string[];
  password?: string[];
  password_confirm?: string[];
  first_name?: string[];
  last_name?: string[];
}

export interface RegisterResponse {
  email: string;
  first_name: string;
  last_name: string;
}

export interface LoginUser {
  id?: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  avatar_url?: string | null;
  is_staff?: boolean;
  role?: string;
  date_joined?: string;
}

/** Covers DRF token, JWT, and AWS Cognito response shapes */
export interface LoginResponse {
  // DRF / simple-jwt
  token?: string;
  access?: string;
  refresh?: string;
  key?: string;
  // Cognito flat
  AccessToken?: string;
  access_token?: string;
  refresh_token?: string;
  // Cognito nested
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
  };
  // Nested user object
  user?: LoginUser;
  // Flat user info fallback
  first_name?: string;
  last_name?: string;
  email?: string;
}
