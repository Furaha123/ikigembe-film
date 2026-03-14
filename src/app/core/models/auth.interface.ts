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

/** Covers DRF token, JWT, and AWS Cognito response shapes */
export interface LoginResponse {
  // DRF / simple-jwt
  token?: string;
  access?: string;
  key?: string;
  // Cognito flat
  AccessToken?: string;
  access_token?: string;
  // Cognito nested
  AuthenticationResult?: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
  };
  // User info that may be returned alongside the token
  first_name?: string;
  last_name?: string;
  email?: string;
}
