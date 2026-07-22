import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  MapPinned,
  Radar,
  Send,
  ShieldCheck,
  TreePine,
  UserRound,
} from "lucide-react";
import { motion } from "motion/react";

import {
  checkEmailAvailability,
  login,
  sendEmailVerification,
  signup,
  verifyEmailCode,
} from "../../services/authApi";
import {
  loadAdministrativeRegions,
} from "../../services/regionApi";
import {
  AuthUser,
  SidoOption,
} from "../../types/auth";

type AuthMode =
  | "login"
  | "signup";

interface AuthScreenProps {
  onAuthenticated: (
    user: AuthUser,
  ) => void;
}

type NoticeTone =
  | "success"
  | "info"
  | "error";

interface Notice {
  tone: NoticeTone;
  message: string;
}

export default function AuthScreen({
  onAuthenticated,
}: AuthScreenProps) {
  const [mode, setMode] =
    useState<AuthMode>("login");
  const [regions, setRegions] =
    useState<SidoOption[]>([]);
  const [regionsLoading, setRegionsLoading] =
    useState(true);

  const [email, setEmail] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [
    passwordConfirm,
    setPasswordConfirm,
  ] = useState("");
  const [name, setName] =
    useState("");
  const [
    organization,
    setOrganization,
  ] = useState("");
  const [sidoCode, setSidoCode] =
    useState("");
  const [sigunguCode, setSigunguCode] =
    useState("");
  const [
    verificationCode,
    setVerificationCode,
  ] = useState("");
  const [
    emailVerificationToken,
    setEmailVerificationToken,
  ] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [
    isCheckingEmail,
    setIsCheckingEmail,
  ] = useState(false);
  const [
    isSendingCode,
    setIsSendingCode,
  ] = useState(false);
  const [
    isVerifyingCode,
    setIsVerifyingCode,
  ] = useState(false);

  const [emailChecked, setEmailChecked] =
    useState(false);
  const [emailAvailable, setEmailAvailable] =
    useState(false);
  const [codeSent, setCodeSent] =
    useState(false);
  const [emailVerified, setEmailVerified] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");
  const [notice, setNotice] =
    useState<Notice | null>(null);

  useEffect(() => {
    loadAdministrativeRegions()
      .then(setRegions)
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "행정구역 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        setRegionsLoading(false);
      });
  }, []);

  const selectedSido = useMemo(
    () =>
      regions.find(
        (item) =>
          item.sidoCode === sidoCode,
      ),
    [regions, sidoCode],
  );

  const selectedSigungu = useMemo(
    () =>
      selectedSido?.sigungu.find(
        (item) =>
          item.sigunguCode ===
          sigunguCode,
      ),
    [selectedSido, sigunguCode],
  );

  function resetEmailVerification() {
    setEmailChecked(false);
    setEmailAvailable(false);
    setCodeSent(false);
    setEmailVerified(false);
    setVerificationCode("");
    setEmailVerificationToken("");
    setNotice(null);
  }

  function changeMode(
    nextMode: AuthMode,
  ) {
    setMode(nextMode);
    setErrorMessage("");
    setNotice(null);
    setPassword("");
    setPasswordConfirm("");
  }

  function handleEmailChange(
    nextEmail: string,
  ) {
    setEmail(nextEmail);
    resetEmailVerification();
  }

  async function handleCheckEmail() {
    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setErrorMessage(
        "이메일을 먼저 입력해 주세요.",
      );
      return;
    }

    setErrorMessage("");
    setNotice(null);
    setIsCheckingEmail(true);

    try {
      const result =
        await checkEmailAvailability(
          normalizedEmail,
        );

      setEmailChecked(true);
      setEmailAvailable(result.available);
      setNotice({
        tone: result.available
          ? "success"
          : "error",
        message: result.message,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "이메일 중복 확인에 실패했습니다.",
      );
    } finally {
      setIsCheckingEmail(false);
    }
  }

  async function handleSendCode() {
    if (!emailChecked || !emailAvailable) {
      setErrorMessage(
        "사용 가능한 이메일인지 먼저 확인해 주세요.",
      );
      return;
    }

    setErrorMessage("");
    setNotice(null);
    setIsSendingCode(true);

    try {
      const result =
        await sendEmailVerification({
          email: email.trim().toLowerCase(),
        });

      setCodeSent(true);
      setNotice({
        tone: "info",
        message: result.message,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "인증번호 발송에 실패했습니다.",
      );
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    if (!verificationCode.trim()) {
      setErrorMessage(
        "이메일로 받은 인증번호를 입력해 주세요.",
      );
      return;
    }

    setErrorMessage("");
    setNotice(null);
    setIsVerifyingCode(true);

    try {
      const result =
        await verifyEmailCode({
          email: email.trim().toLowerCase(),
          code: verificationCode.trim(),
        });

      setEmailVerified(result.verified);
      setEmailVerificationToken(
        result.verificationToken,
      );
      setNotice({
        tone: "success",
        message: result.message,
      });
    } catch (error) {
      setEmailVerified(false);
      setEmailVerificationToken("");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "이메일 인증에 실패했습니다.",
      );
    } finally {
      setIsVerifyingCode(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setErrorMessage("");

    if (
      mode === "signup" &&
      password !== passwordConfirm
    ) {
      setErrorMessage(
        "비밀번호와 비밀번호 확인이 일치하지 않습니다.",
      );
      return;
    }

    if (
      mode === "signup" &&
      (!selectedSido || !selectedSigungu)
    ) {
      setErrorMessage(
        "담당 시도와 시군구를 선택해 주세요.",
      );
      return;
    }

    if (
      mode === "signup" &&
      !emailVerified
    ) {
      setErrorMessage(
        "이메일 인증을 완료해 주세요.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result =
        mode === "login"
          ? await login({
              email: email.trim(),
              password,
            })
          : await signup({
              email: email.trim(),
              password,
              passwordConfirm,
              name: name.trim(),
              organization:
                organization.trim(),
              sidoCode:
                selectedSido!.sidoCode,
              sidoName:
                selectedSido!.sidoName,
              sigunguCode:
                selectedSigungu!
                  .sigunguCode,
              sigunguName:
                selectedSigungu!
                  .sigunguName,
              emailVerificationToken,
            });

      onAuthenticated(result.user);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "인증 요청 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const signupReady =
    Boolean(name.trim()) &&
    Boolean(organization.trim()) &&
    Boolean(selectedSido) &&
    Boolean(selectedSigungu) &&
    emailVerified &&
    password.length >= 8 &&
    password === passwordConfirm;

  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-[minmax(0,1.1fr)_minmax(520px,0.9fr)]">
      <section className="relative hidden overflow-hidden px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.28),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,116,144,0.22),transparent_42%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-500/20">
              <TreePine size={26} />
            </div>
            <div>
              <div className="text-sm font-black">
                소나무재선충병 통합 예찰·방제지원 플랫폼
              </div>
              <div className="mt-1 text-[11px] font-semibold text-emerald-200">
                Pine Wilt Disease Integrated Surveillance &amp; Control Platform
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-extrabold text-emerald-200">
            산림 행정 의사결정 지원 시스템
          </div>
          <h1 className="mt-6 text-5xl font-black leading-[1.18] tracking-tight">
            신규 확산위험 후보를
            <br />
            더 빠르게 확인하고,
            <br />
            예찰 우선순위를 결정합니다.
          </h1>
          <p className="mt-6 max-w-2xl text-sm font-semibold leading-7 text-slate-300">
            500m 격자 기반 위험도 분석과 현장 확인 지원을 통해
            신규 확산위험 후보 및 우선 예찰 검토지역을 제공합니다.
          </p>
          <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3">
            <FeatureCard
              icon={Radar}
              title="위험도 분석"
              description="AI 앙상블 기반 신규 확산위험 후보"
            />
            <FeatureCard
              icon={MapPinned}
              title="담당지역 연동"
              description="가입 시 선택한 시군구 중심 지도"
            />
            <FeatureCard
              icon={ClipboardCheck}
              title="방제 지원"
              description="예찰 결과와 행정 업무 연계"
            />
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>PWD-ISCP · AI Decision Support</span>
          <span>PR-AUC 0.3183</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center overflow-y-auto bg-slate-50 px-5 py-8 sm:px-10">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[540px]"
        >
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                Secure Access
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                {mode === "login"
                  ? "로그인"
                  : "회원가입"}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                {mode === "login"
                  ? "승인된 계정으로 통합 관제 시스템에 접속합니다."
                  : "담당지역과 이메일 인증을 완료해 계정을 생성합니다."}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <ModeButton
                active={mode === "login"}
                onClick={() =>
                  changeMode("login")
                }
              >
                로그인
              </ModeButton>
              <ModeButton
                active={mode === "signup"}
                onClick={() =>
                  changeMode("signup")
                }
              >
                회원가입
              </ModeButton>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-6 space-y-4"
            >
              {mode === "signup" && (
                <>
                  <AuthInput
                    label="이름"
                    icon={UserRound}
                    type="text"
                    value={name}
                    placeholder="홍길동"
                    autoComplete="name"
                    onChange={setName}
                    required
                  />
                  <AuthInput
                    label="소속기관"
                    icon={Building2}
                    type="text"
                    value={organization}
                    placeholder="예: 산림청, ○○시청"
                    autoComplete="organization"
                    onChange={setOrganization}
                    required
                  />

                  <div>
                    <label className="text-xs font-extrabold text-slate-700">
                      담당지역
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <select
                        value={sidoCode}
                        onChange={(event) => {
                          setSidoCode(
                            event.target.value,
                          );
                          setSigunguCode("");
                        }}
                        disabled={regionsLoading}
                        required
                        className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="">
                          {regionsLoading
                            ? "불러오는 중..."
                            : "시도 선택"}
                        </option>
                        {regions.map((item) => (
                          <option
                            key={item.sidoCode}
                            value={item.sidoCode}
                          >
                            {item.sidoName}
                          </option>
                        ))}
                      </select>

                      <select
                        value={sigunguCode}
                        onChange={(event) =>
                          setSigunguCode(
                            event.target.value,
                          )
                        }
                        disabled={!selectedSido}
                        required
                        className="h-12 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="">
                          시군구 선택
                        </option>
                        {selectedSido?.sigungu.map(
                          (item) => (
                            <option
                              key={
                                item.sigunguCode
                              }
                              value={
                                item.sigunguCode
                              }
                            >
                              {
                                item.sigunguName
                              }
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {mode === "signup" ? (
                <>
                  <LabeledActionRow
                    label="이메일"
                    icon={Mail}
                    value={email}
                    type="email"
                    placeholder="name@example.com"
                    onChange={handleEmailChange}
                    buttonLabel={
                      emailChecked &&
                      emailAvailable
                        ? "확인 완료"
                        : "중복 확인"
                    }
                    onAction={handleCheckEmail}
                    loading={isCheckingEmail}
                    actionDisabled={
                      emailChecked &&
                      emailAvailable
                    }
                    success={
                      emailChecked &&
                      emailAvailable
                    }
                  />

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={
                        !emailAvailable ||
                        isSendingCode ||
                        emailVerified
                      }
                      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-extrabold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSendingCode ? (
                        <Loader2
                          size={15}
                          className="animate-spin"
                        />
                      ) : (
                        <Send size={15} />
                      )}
                      {codeSent
                        ? "인증번호 재발송"
                        : "인증번호 발송"}
                    </button>

                    {emailVerified && (
                      <div className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-extrabold text-white">
                        <CheckCircle2 size={16} />
                        이메일 인증 완료
                      </div>
                    )}
                  </div>

                  {codeSent && !emailVerified && (
                    <LabeledActionRow
                      label="인증번호"
                      icon={ShieldCheck}
                      value={verificationCode}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6자리 인증번호"
                      onChange={(value) =>
                        setVerificationCode(
                          value.replace(
                            /\D/g,
                            "",
                          ),
                        )
                      }
                      buttonLabel="인증 확인"
                      onAction={handleVerifyCode}
                      loading={isVerifyingCode}
                      actionDisabled={
                        verificationCode.length !== 6
                      }
                    />
                  )}
                </>
              ) : (
                <AuthInput
                  label="이메일"
                  icon={Mail}
                  type="email"
                  value={email}
                  placeholder="name@example.com"
                  autoComplete="email"
                  onChange={setEmail}
                  required
                />
              )}

              <PasswordInput
                value={password}
                showPassword={showPassword}
                mode={mode}
                onChange={setPassword}
                onToggle={() =>
                  setShowPassword(
                    (previous) =>
                      !previous,
                  )
                }
              />

              {mode === "signup" && (
                <AuthInput
                  label="비밀번호 확인"
                  icon={ShieldCheck}
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={passwordConfirm}
                  placeholder="비밀번호 다시 입력"
                  autoComplete="new-password"
                  onChange={setPasswordConfirm}
                  minLength={8}
                  required
                />
              )}

              {notice && (
                <NoticeBox notice={notice} />
              )}

              {errorMessage && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  (mode === "signup" &&
                    !signupReady)
                }
                className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-800 text-sm font-extrabold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? "처리 중..."
                  : mode === "login"
                    ? "관제 시스템 로그인"
                    : "회원가입 완료"}
              </button>
            </form>

            <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-[11px] font-semibold leading-5 text-slate-500">
              <ShieldCheck
                size={16}
                className="mt-0.5 shrink-0 text-emerald-700"
              />
              <span>
                담당 시군구는 로그인 후 첫 대시보드 지도의
                초기 표시지역으로 사용됩니다.
              </span>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-white px-4 py-2.5 text-sm font-extrabold text-emerald-800 shadow-sm"
          : "rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500"
      }
    >
      {children}
    </button>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Radar;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
      <Icon
        size={20}
        className="text-emerald-300"
      />
      <div className="mt-3 text-sm font-extrabold">
        {title}
      </div>
      <div className="mt-1 text-[11px] font-semibold leading-5 text-slate-400">
        {description}
      </div>
    </div>
  );
}

function AuthInput({
  label,
  icon: Icon,
  value,
  onChange,
  ...inputProps
}: {
  label: string;
  icon: typeof Mail;
  value: string;
  onChange: (value: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <div>
      <label className="text-xs font-extrabold text-slate-700">
        {label}
      </label>
      <div className="relative mt-2">
        <Icon
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          {...inputProps}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
      </div>
    </div>
  );
}

function LabeledActionRow({
  label,
  icon: Icon,
  value,
  onChange,
  buttonLabel,
  onAction,
  loading,
  actionDisabled,
  success = false,
  ...inputProps
}: {
  label: string;
  icon: typeof Mail;
  value: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  onAction: () => void;
  loading: boolean;
  actionDisabled: boolean;
  success?: boolean;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <div>
      <label className="text-xs font-extrabold text-slate-700">
        {label}
      </label>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Icon
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            {...inputProps}
            value={value}
            onChange={(event) =>
              onChange(event.target.value)
            }
            required
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          />
        </div>
        <button
          type="button"
          onClick={onAction}
          disabled={loading || actionDisabled}
          className={
            success
              ? "flex h-12 min-w-24 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-extrabold text-white"
              : "flex h-12 min-w-24 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {loading ? (
            <Loader2
              size={15}
              className="animate-spin"
            />
          ) : success ? (
            <Check size={15} />
          ) : null}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  showPassword,
  mode,
  onChange,
  onToggle,
}: {
  value: string;
  showPassword: boolean;
  mode: AuthMode;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label className="text-xs font-extrabold text-slate-700">
        비밀번호
      </label>
      <div className="relative mt-2">
        <LockKeyhole
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type={
            showPassword
              ? "text"
              : "password"
          }
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="8자 이상 입력"
          autoComplete={
            mode === "login"
              ? "current-password"
              : "new-password"
          }
          minLength={8}
          required
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={
            showPassword
              ? "비밀번호 숨기기"
              : "비밀번호 보기"
          }
        >
          {showPassword ? (
            <EyeOff size={17} />
          ) : (
            <Eye size={17} />
          )}
        </button>
      </div>
    </div>
  );
}

function NoticeBox({
  notice,
}: {
  notice: Notice;
}) {
  const className =
    notice.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : notice.tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-sky-200 bg-sky-50 text-sky-700";

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${className}`}
    >
      {notice.message}
    </div>
  );
}
