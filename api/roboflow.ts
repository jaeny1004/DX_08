import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL_ID =
  process.env.ROBOFLOW_MODEL_ID ||
  "pine-disease-classification-qmgil/1";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const AUTO_ANALYSIS_SECRET =
  process.env.AUTO_ANALYSIS_SECRET;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
    : null;

type PineRecord = {
  id: string | number;
  image_url?: string;
  ai_status?: string;
};

type WebhookPayload = {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: PineRecord;
};

function getBestPrediction(result: any) {
  const predictions = Array.isArray(result?.predictions)
    ? result.predictions
    : [];

  if (predictions.length > 0) {
    const best = [...predictions].sort(
      (a, b) =>
        Number(b.confidence ?? 0) -
        Number(a.confidence ?? 0)
    )[0];

    return {
      label: String(
        best.class ?? best.label ?? "unknown"
      ),
      probability:
        Number(best.confidence ?? 0) <= 1
          ? Number(best.confidence ?? 0) * 100
          : Number(best.confidence ?? 0),
    };
  }

  const top = result?.top;

  if (top) {
    const confidence =
      result?.confidence ??
      result?.predictions?.[top]?.confidence ??
      0;

    return {
      label: String(top),
      probability:
        Number(confidence) <= 1
          ? Number(confidence) * 100
          : Number(confidence),
    };
  }

  return {
    label: "unknown",
    probability: 0,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다.",
    });
  }

  let recordId: string | number | undefined;
  let imageUrl: string | undefined;

  try {
    if (!ROBOFLOW_API_KEY) {
      throw new Error(
        "ROBOFLOW_API_KEY 서버 환경변수가 없습니다."
      );
    }

    const body = req.body as WebhookPayload & {
      imageUrl?: string;
      recordId?: string | number;
    };

    const isWebhook = Boolean(body.record);

    if (isWebhook) {
      if (
        body.type !== "INSERT" ||
        body.table !== "pine_records"
      ) {
        return res.status(200).json({
          message: "분석 대상 이벤트가 아닙니다.",
        });
      }

      recordId = body.record?.id;
      imageUrl = body.record?.image_url;
    } else {
      recordId = body.recordId;
      imageUrl = body.imageUrl;
    }

    if (!imageUrl) {
      throw new Error("분석할 image_url이 없습니다.");
    }

    if (recordId && supabaseAdmin) {
      await supabaseAdmin
        .from("pine_records")
        .update({
          ai_status: "processing",
          ai_error: null,
        })
        .eq("id", recordId);
    }

    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(
        `이미지 다운로드 실패: ${imageResponse.status}`
      );
    }

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    const base64Image = imageBuffer.toString("base64");

    const roboflowResponse = await fetch(
      `https://serverless.roboflow.com/${ROBOFLOW_MODEL_ID}?api_key=${ROBOFLOW_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: base64Image,
      }
    );

    const responseText =
      await roboflowResponse.text();

    if (!roboflowResponse.ok) {
      throw new Error(
        `Roboflow 분석 실패 (${roboflowResponse.status}): ${responseText}`
      );
    }

    const rawResult = JSON.parse(responseText);
    const prediction = getBestPrediction(rawResult);

    const probability = Number(
      prediction.probability.toFixed(1)
    );

    if (recordId && supabaseAdmin) {
      const { error: updateError } =
        await supabaseAdmin
          .from("pine_records")
          .update({
            ai_probability: probability,
            ai_label: prediction.label,
            ai_status: "completed",
            ai_analyzed_at:
              new Date().toISOString(),
            ai_error: null,
          })
          .eq("id", recordId);

      if (updateError) {
        throw new Error(
          `Supabase 저장 실패: ${updateError.message}`
        );
      }
    }

    return res.status(200).json({
      ok: true,
      label: prediction.label,
      score: probability,
      level:
        prediction.label.toLowerCase().includes("infected") ||
          prediction.label.toLowerCase().includes("disease")
          ? "danger"
          : "safe",
      message:
        prediction.label.toLowerCase().includes("infected") ||
          prediction.label.toLowerCase().includes("disease")
          ? `소나무 재선충병 감염 의심 - 확률 ${probability}%`
          : `정상 또는 낮은 위험 - 확률 ${probability}%`,
      raw: rawResult,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error("/api/roboflow 오류:", message);

    if (recordId && supabaseAdmin) {
      await supabaseAdmin
        .from("pine_records")
        .update({
          ai_status: "failed",
          ai_error: message,
        })
        .eq("id", recordId);
    }

    return res.status(500).json({
      error: message,
    });
  }
}