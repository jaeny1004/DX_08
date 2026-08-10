/*
 * 드론 가시광 영상 감염 의심목 탐지.
 *
 * thermal-detection 과 같은 사정이다. Supabase Edge Function
 * 'drone-visible-detection' 이 조원 프로젝트에만 배포돼 있어서, 프로젝트를
 * 옮기자 404 가 되고 브라우저에는 CORS 오류로 보였다.
 * 같은 도메인의 서버리스 함수로 옮긴다.
 *
 * 열화상과 모델만 다르고 흐름은 같아서 api/thermal-detection.ts 와 짝이다.
 * 한쪽을 고치면 다른 쪽도 같이 볼 것.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

/*
 * 가시광 객체탐지 모델.
 * Roboflow 워크스페이스(s-workspace-niivv)에 pine-wilt-8g7vs v1 이 있다.
 * 열화상용 pine-thermal-detection 과 다른 모델이니 섞지 말 것.
 */
const VISIBLE_MODEL_ID =
  process.env.ROBOFLOW_VISIBLE_MODEL_ID || "pine-wilt-8g7vs/1";

const ALLOWED_BUCKET = "drone-images";
const ALLOWED_PREFIXES = ["visible/", "thermal/"];

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
        `이미지를 내려받지 못했습니다. HTTP ${object.status}`,
      );
    }

    const image = Buffer.from(await object.arrayBuffer());

    if (image.length === 0) {
      return fail(response, "이미지가 비어 있습니다.");
    }

    const params = new URLSearchParams({
      api_key: ROBOFLOW_API_KEY,
      confidence: String(body.confidence ?? 15),
      overlap: String(body.overlap ?? 30),
    });

    const inference = await fetch(
      `https://serverless.roboflow.com/${VISIBLE_MODEL_ID}?${params.toString()}`,
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
        `분석에 실패했습니다. HTTP ${inference.status} ${text.slice(0, 160)}`,
      );
    }

    const result = JSON.parse(text) as {
      predictions?: Prediction[];
      image?: { width?: number; height?: number };
    };

    const predictions = Array.isArray(result.predictions)
      ? result.predictions
      : [];

    /* 상자가 하나라도 있으면 후보로 본다. 감염 확정이 아니다. */
    return response.status(200).json({
      ok: true,
      status: predictions.length > 0 ? "INFECTED" : "NORMAL",
      infectedCount: predictions.length,
      predictions,
      image: result.image ?? null,
      storage: { bucket, path },
    });
  } catch (error) {
    console.error("drone-visible-detection 실패:", error);
    return fail(
      response,
      error instanceof Error
        ? `분석 중 오류가 발생했습니다. ${error.message}`
        : "분석 중 알 수 없는 오류가 발생했습니다.",
    );
  }
}
