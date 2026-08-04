import {
  AuthResponse,
  AuthUser,
  EmailAvailabilityResponse,
  LoginRequest,
  SendVerificationRequest,
  SendVerificationResponse,
  SignupRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "../types/auth";

import { buildApiUrl } from "../config/api";

const AUTH_PREVIEW_MODE =
  String(
    import.meta.env.VITE_AUTH_PREVIEW_MODE ?? "false",
  ).toLowerCase() === "true";

const TOKEN_KEY = "pine-wilt-access-token";
const PREVIEW_USER_KEY = "pine-wilt-preview-user";
const PREVIEW_VERIFICATION_CODE = "123456";
const SESSION_EXPIRED_KEY = "pine-wilt-session-expired";

export const AUTH_SESSION_EXPIRED_MESSAGE =
  "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";

let reloadScheduled = false;

const buildUrl = buildApiUrl;

function wait(ms = 450) {
  return new Promise((resolve) =>
    window.setTimeout(resolve, ms),
  );
}

async function parseResponse<T>(
  response: Response,
): Promise<T> {
  const payload = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message =
      payload?.detail ??
      payload?.message ??
      "인증 요청 처리 중 오류가 발생했습니다.";

    throw new Error(String(message));
  }

  return payload as T;
}

function createPreviewUser(
  input?: Partial<AuthUser>,
): AuthUser {
  return {
    id: 1,
    email:
      input?.email ??
      "preview@pine-wilt.local",
    name:
      input?.name ??
      "미리보기 사용자",
    organization:
      input?.organization ??
      "산림 행정기관",
    sidoCode:
      input?.sidoCode ?? "47",
    sidoName:
      input?.sidoName ?? "경상북도",
    sigunguCode:
      input?.sigunguCode ?? "47113",
    sigunguName:
      input?.sigunguName ?? "포항시 북구",
    role: "manager",
    emailVerified: true,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
}

function savePreviewUser(user: AuthUser) {
  sessionStorage.setItem(
    PREVIEW_USER_KEY,
    JSON.stringify(user),
  );
}

function readPreviewUser(): AuthUser {
  const stored =
    sessionStorage.getItem(PREVIEW_USER_KEY);

  if (!stored) {
    const user = createPreviewUser();
    savePreviewUser(user);
    return user;
  }

  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    const user = createPreviewUser();
    savePreviewUser(user);
    return user;
  }
}

function readStoredAccessToken(): string | null {
  return AUTH_PREVIEW_MODE
    ? sessionStorage.getItem(TOKEN_KEY)
    : localStorage.getItem(TOKEN_KEY);
}

function isJwtExpired(token: string): boolean {
  if (AUTH_PREVIEW_MODE || token === "preview-token") {
    return false;
  }

  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return true;

    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function getAccessToken(): string | null {
  const token = readStoredAccessToken();

  if (!token) return null;

  if (isJwtExpired(token)) {
    clearAccessToken();
    sessionStorage.setItem(SESSION_EXPIRED_KEY, AUTH_SESSION_EXPIRED_MESSAGE);
    return null;
  }

  return token;
}

export function saveAccessToken(token: string) {
  if (AUTH_PREVIEW_MODE) {
    sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PREVIEW_USER_KEY);
}

/** 보호 API가 401을 반환하면 오래된 로그인 화면을 유지하지 않는다. */
export function expireAuthSession(
  message = AUTH_SESSION_EXPIRED_MESSAGE,
) {
  clearAccessToken();
  sessionStorage.setItem(SESSION_EXPIRED_KEY, message);

  if (typeof window === "undefined" || reloadScheduled) return;
  reloadScheduled = true;
  window.setTimeout(() => window.location.reload(), 50);
}

export function consumeAuthSessionMessage(): string | null {
  const message = sessionStorage.getItem(SESSION_EXPIRED_KEY);
  sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  return message;
}

export async function checkEmailAvailability(
  email: string,
): Promise<EmailAvailabilityResponse> {
  if (AUTH_PREVIEW_MODE) {
    await wait();
    const unavailable =
      email.trim().toLowerCase() ===
      "duplicate@example.com";

    return {
      available: !unavailable,
      message: unavailable
        ? "이미 가입된 이메일입니다."
        : "사용 가능한 이메일입니다.",
    };
  }

  const response = await fetch(
    buildUrl("/api/auth/check-email"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    },
  );

  return parseResponse<EmailAvailabilityResponse>(
    response,
  );
}

export async function sendEmailVerification(
  request: SendVerificationRequest,
): Promise<SendVerificationResponse> {
  if (AUTH_PREVIEW_MODE) {
    await wait();

    return {
      message:
        "미리보기 인증번호는 123456입니다.",
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    };
  }

  const response = await fetch(
    buildUrl("/api/auth/send-verification"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  return parseResponse<SendVerificationResponse>(
    response,
  );
}

export async function verifyEmailCode(
  request: VerifyEmailRequest,
): Promise<VerifyEmailResponse> {
  if (AUTH_PREVIEW_MODE) {
    await wait();

    if (
      request.code.trim() !==
      PREVIEW_VERIFICATION_CODE
    ) {
      throw new Error(
        "인증번호가 올바르지 않습니다.",
      );
    }

    return {
      verified: true,
      verificationToken:
        "preview-email-verification-token",
      message: "이메일 인증이 완료되었습니다.",
    };
  }

  const response = await fetch(
    buildUrl("/api/auth/verify-email"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  return parseResponse<VerifyEmailResponse>(
    response,
  );
}

export async function login(
  request: LoginRequest,
): Promise<AuthResponse> {
  if (AUTH_PREVIEW_MODE) {
    await wait();

    const user = createPreviewUser({
      email:
        request.email.trim() ||
        "preview@pine-wilt.local",
    });

    savePreviewUser(user);
    saveAccessToken("preview-token");

    return {
      accessToken: "preview-token",
      tokenType: "bearer",
      user,
    };
  }

  const response = await fetch(
    buildUrl("/api/auth/login"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  const result =
    await parseResponse<AuthResponse>(response);

  saveAccessToken(result.accessToken);

  return result;
}

export async function signup(
  request: SignupRequest,
): Promise<AuthResponse> {
  if (AUTH_PREVIEW_MODE) {
    await wait();

    const user = createPreviewUser({
      email: request.email.trim(),
      name: request.name.trim(),
      organization:
        request.organization.trim(),
      sidoCode: request.sidoCode,
      sidoName: request.sidoName,
      sigunguCode: request.sigunguCode,
      sigunguName: request.sigunguName,
    });

    savePreviewUser(user);
    saveAccessToken("preview-token");

    return {
      accessToken: "preview-token",
      tokenType: "bearer",
      user,
    };
  }

  const response = await fetch(
    buildUrl("/api/auth/signup"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  const result =
    await parseResponse<AuthResponse>(response);

  saveAccessToken(result.accessToken);

  return result;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const token = getAccessToken();

  if (!token) {
    throw new Error("로그인 정보가 없습니다.");
  }

  if (AUTH_PREVIEW_MODE) {
    await wait(200);
    return readPreviewUser();
  }

  const response = await fetch(
    buildUrl("/api/auth/me"),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 401) {
    expireAuthSession();
    throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
  }

  return parseResponse<AuthUser>(response);
}

export function logout() {
  clearAccessToken();
}
