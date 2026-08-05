export type AuthRole =
  | "admin"
  | "manager"
  | "field";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  organization: string;
  sidoCode: string;
  sidoName: string;
  sigunguCode: string;
  sigunguName: string;
  role: AuthRole;
  emailVerified: boolean;
  isActive: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  organization: string;
  sidoCode: string;
  sidoName: string;
  sigunguCode: string;
  sigunguName: string;
  emailVerificationToken: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: "bearer";
  user: AuthUser;
}

export interface EmailAvailabilityResponse {
  available: boolean;
  message: string;
}

export interface SendVerificationRequest {
  email: string;
}

export interface SendVerificationResponse {
  message: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface VerifyEmailResponse {
  verified: boolean;
  verificationToken: string;
  message: string;
}

export interface SigunguOption {
  sigunguCode: string;
  sigunguName: string;
}

export interface SidoOption {
  sidoCode: string;
  sidoName: string;
  sigungu: SigunguOption[];
}
