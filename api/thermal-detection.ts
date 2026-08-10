/*
 * 열화상 감염 의심목 탐지.
 *
 * 원래는 Supabase Edge Function 'thermal-detection' 이 하던 일이다. 그 함수는
 * 조원 프로젝트에만 배포돼 있어서, Supabase 프로젝트를 우리 것으로 옮기자
 * 404 가 되고 브라우저에는 CORS 오류로 보였다(preflight 가 404 라 실패).
 * 챗봇·음성 STT 와 같은 이유로 여기로 옮긴다. Edge Function 은 프로젝트마다
 * 따로 배포해야 해서 프로젝트를 옮길 때마다 조용히 망가진다.
 *
 * 하는 일은 두 단계뿐이다.
 *   1. Storage 의 열화상 이미지를 내려받는다
 *   2. Roboflow 객체탐지 모델에 보내 감염 의심 영역을 받는다
 *
 * 응답 형식은 기존 Edge Function 과 같게 맞췄다. 프론트(ThermalAnalysisSection)를
 * 고치지 않아도 되도록 하기 위함이다.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL;

/* Storage 를 읽어야 하므로 service_role. 브라우저에 나가지 않는다. */
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

/*
 * 열화상은 분류가 아니라 객체탐지 모델이다.
 * Roboflow 워크스페이스(s-workspace-niivv)의 pine-thermal-detection 을 쓴다.
 * 판독 화면의 pine-disease-classification 과는 다른 모델이니 섞지 말 것.
 *
 * 버전은 v1 이다. 프로젝트에 v1/v2 가 다 있지만 serverless 추론에 올라간 것은
 * v1 뿐이다(v2 로 호출하면 "Requested Roboflow resource not found" 가 난다).
 * v2 를 배포하면 ROBOFLOW_THERMAL_MODEL_ID 로 바꿔 끼우면 된다.
 */
const THERMAL_MODEL_ID =
  process.env.ROBOFLOW_THERMAL_MODEL_ID || "pine-thermal-detection/1";

/* 앱·웹이 올리는 경로만 허용한다. 임의 파일을 읽어가지 못하게 한다. */
const ALLOWED_BUCKET = "drone-images";
const ALLOWED_PREFIXES = ["thermal/", "visible/"];

type Prediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
};

function fail(response: VercelResponse, message: string, status = 200) {
  return response.status(status).json({ ok: false, error: message });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== "POST") {
    return fail(response, "POST 만 지원합니다.", 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return fail(response, "Supabase 환경변수가 설정되지 않았습니다.");
  }
  if (!ROBOFLOW_API_KEY) {
    return fail(response, "ROBOFLOW_API_KEY 가 설정되지 않았습니다.");
  }

  const body = (request.body ?? {}) as {
    bucket?: string;
    path?: string;
    confidence?: number;
    overlap?: number;
  };

  const bucket = body.bucket || ALLOWED_BUCKET;
  const path = (body.path || "").trim().replace(/^\/+/, "");

  if (
    bucket !== ALLOWED_BUCKET ||
    !path ||
    path.includes("..") ||
    !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    return fail(response, "허용되지 않은 Storage 경로입니다.");
  }

  try {
    const encoded = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const object = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${encoded}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!object.ok) {
      return fail(
        response,
        `열화상 이미지를 내려받지 못했습니다. HTTP ${object.status}`,
      );
    }

    const image = Buffer.from(await object.arrayBuffer());

    if (image.length === 0) {
      return fail(response, "열화상 이미지가 비어 있습니다.");
    }

    /* Roboflow serverless 는 base64 본문을 form-urlencoded 로 받는다 */
    const params = new URLSearchParams({
      api_key: ROBOFLOW_API_KEY,
      confidence: String(body.confidence ?? 10),
      overlap: String(body.overlap ?? 30),
    });

    const inference = await fetch(
      `https://serverless.roboflow.com/${THERMAL_MODEL_ID}?${params.toString()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: image.toString("base64"),
      },
    );

    const text = await inference.text();

    if (!inference.ok) {
      return fail(
        response,
        `열화상 분석에 실패했습니다. HTTP ${inference.status} ${text.slice(0, 160)}`,
      );
    }

    const result = JSON.parse(text) as {
      predictions?: Prediction[];
      image?: { width?: number; height?: number };
    };

    const predictions = Array.isArray(result.predictions)
      ? result.predictions
      : [];

    /*
     * 탐지된 상자가 하나라도 있으면 INFECTED 로 본다.
     * 감염 확정이 아니라 "현장 확인이 필요한 후보"라는 뜻이며,
     * 화면에도 그렇게 표시된다.
     */
    return response.status(200).json({
      ok: true,
      status: predictions.length > 0 ? "INFECTED" : "NORMAL",
      infectedCount: predictions.length,
      predictions,
      image: result.image ?? null,
      storage: { bucket, path },
    });
  } catch (error) {
    console.error("thermal-detection 실패:", error);
    return fail(
      response,
      error instanceof Error
        ? `열화상 분석 중 오류가 발생했습니다. ${error.message}`
        : "열화상 분석 중 알 수 없는 오류가 발생했습니다.",
    );
  }
}
