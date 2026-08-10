/*
 * 시민 신고 사진 AI 판독.
 *
 * 웹에서 제보의 "AI 감염도"가 항상 0% 로 뜨는 이유는 아무도 판독을 돌리지
 * 않아서다. 조원 프로젝트에는 pine_records 에 AFTER INSERT 트리거
 * (trg_auto_roboflow_analysis)가 있어 웹훅을 불렀는데, 그 트리거는 외부
 * 연동(pg_net + 웹훅 URL + 시크릿)에 의존해서 011 마이그레이션에서 만들지
 * 않았다. 그래서 ai_probability 가 계속 null 이고 화면에는 0% 로 보인다.
 *
 * DB 트리거를 되살리는 대신 앱이 신고를 저장한 직후 여기를 부른다.
 * 트리거는 DB 확장과 시크릿 관리가 따로 필요하고, 실패해도 어디서 끊겼는지
 * 알기 어렵다. 앱에서 부르면 실패가 바로 보이고 재시도도 쉽다.
 *
 * 판독 로직은 웹의 api/roboflow.ts 와 같다(같은 분류 모델, 같은 확률 산출).
 * 한쪽을 고치면 다른 쪽도 함께 볼 것.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL;

/* pine_records 를 갱신해야 하므로 service_role. 브라우저에 나가지 않는다. */
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

/* 확진목 정밀판독과 같은 분류 모델을 쓴다(객체탐지 모델과 다르다) */
const ROBOFLOW_MODEL_ID =
  process.env.ROBOFLOW_MODEL_ID ||
  'pine-disease-classification-qmgil/1';

/** 감염으로 볼 클래스명. 모델의 라벨과 맞춰야 한다. */
const INFECTED_LABELS = ['infected', 'pine_disease_suspected'];

type Best = { label: string; probability: number };

/** api/roboflow.ts 의 getBestPrediction 과 같은 규칙 */
function getBestPrediction(result: any): Best {
  const predictions = Array.isArray(result?.predictions)
    ? result.predictions
    : [];

  if (predictions.length > 0) {
    const best = [...predictions].sort(
      (a, b) =>
        Number(b.confidence ?? 0) - Number(a.confidence ?? 0),
    )[0];

    const raw = Number(best.confidence ?? 0);

    return {
      label: String(best.class ?? best.label ?? 'unknown'),
      probability: raw <= 1 ? raw * 100 : raw,
    };
  }

  const top = result?.top;

  if (top) {
    const raw = Number(result?.confidence ?? 0);
    return {
      label: String(top),
      probability: raw <= 1 ? raw * 100 : raw,
    };
  }

  return { label: 'unknown', probability: 0 };
}

async function patchRecord(
  recordId: string | number,
  patch: Record<string, unknown>,
) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/pine_records?id=eq.${recordId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY as string,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    },
  );
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return response
      .status(405)
      .json({ ok: false, error: 'POST 만 지원합니다.' });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !ROBOFLOW_API_KEY
  ) {
    return response
      .status(500)
      .json({ ok: false, error: '서버 환경변수가 설정되지 않았습니다.' });
  }

  const body = (request.body ?? {}) as {
    record_id?: string | number;
    image_url?: string;
  };

  const recordId = body.record_id;
  const imageUrl = (body.image_url || '').trim();

  if (!recordId || !imageUrl) {
    return response
      .status(400)
      .json({ ok: false, error: 'record_id 와 image_url 이 필요합니다.' });
  }

  /* 우리 Storage 의 이미지만 판독한다. 임의 URL 을 받아오지 않는다. */
  if (!imageUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/`)) {
    return response
      .status(400)
      .json({ ok: false, error: '허용되지 않은 이미지 주소입니다.' });
  }

  try {
    await patchRecord(recordId, { ai_status: 'processing' });

    const image = await fetch(imageUrl);

    if (!image.ok) {
      throw new Error(`이미지 다운로드 실패 (HTTP ${image.status})`);
    }

    const buffer = Buffer.from(await image.arrayBuffer());

    const inference = await fetch(
      `https://serverless.roboflow.com/${ROBOFLOW_MODEL_ID}?api_key=${ROBOFLOW_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buffer.toString('base64'),
      },
    );

    const text = await inference.text();

    if (!inference.ok) {
      throw new Error(
        `Roboflow 분석 실패 (${inference.status}): ${text.slice(0, 160)}`,
      );
    }

    const best = getBestPrediction(JSON.parse(text));

    /*
     * 화면의 "AI 감염도"는 감염일 확률이다. 모델이 normal 을 높은 확신으로
     * 골랐다면 감염도는 그 반대값이어야 한다. 최상위 클래스의 확신도를
     * 그대로 넣으면 정상 사진이 감염도 95% 로 뜬다.
     */
    const isInfected = INFECTED_LABELS.includes(
      best.label.toLowerCase(),
    );

    const probability = Number(
      (isInfected
        ? best.probability
        : 100 - best.probability
      ).toFixed(1),
    );

    await patchRecord(recordId, {
      ai_probability: probability,
      ai_label: best.label,
      ai_status: 'completed',
      ai_analyzed_at: new Date().toISOString(),
      ai_error: null,
    });

    return response.status(200).json({
      ok: true,
      ai_probability: probability,
      ai_label: best.label,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'AI 판독 중 알 수 없는 오류가 발생했습니다.';

    console.error('analyze-report 실패:', message);

    await patchRecord(recordId, {
      ai_status: 'failed',
      ai_error: message.slice(0, 400),
    });

    return response.status(200).json({ ok: false, error: message });
  }
}
