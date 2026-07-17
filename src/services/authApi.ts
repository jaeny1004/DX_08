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

const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL ?? "",
).replace(/\/$/, "");

const AUTH_PREVIEW_MODE =
  String(
    import.meta.env.VITE_AUTH_PREVIEW_MODE ?? "false",
  ).toLowerCase() === "true";

const TOKEN_KEY = "pine-wilt-access-token";
const PREVIEW_USER_KEY = "pine-wilt-preview-user";
const PREVIEW_VERIFICATION_CODE = "123456";

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

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

export function getAccessToken() {
  if (AUTH_PREVIEW_MODE) {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  return localStorage.getItem(TOKEN_KEY);
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

  return parseResponse<AuthUser>(response);
}

export function logout() {
  clearAccessToken();
}
