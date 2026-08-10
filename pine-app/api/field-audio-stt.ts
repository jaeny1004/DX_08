/*
 * 현장 음성 작업일지 STT.
 *
 * 앱이 Storage 에 올린 녹음을 받아 한국어로 전사한다.
 * 같은 기능이 웹 백엔드(app/api/field_audio.py)에도 있지만, 그 백엔드는 지금
 * Vercel 함수 225MB 한도에 걸려 재배포가 안 된다. 배포본에는 이 엔드포인트가
 * 없어서 외부에서 앱을 쓰면 음성 변환만 실패한다.
 *
 * 그래서 앱 프로젝트에 같은 계약으로 하나 더 둔다. 여기는 의존성이 없다시피 해서
 * 크기 문제가 없다. 백엔드 재배포가 가능해지면 이 파일을 지우고 그쪽으로 되돌린다.
 *
 * 계약은 백엔드와 동일하다.
 *   요청  { "bucket": "field-audio", "path": "control/2026-08-10/UUID.webm" }
 *   응답  { "success": true, "transcript": "..." }
 *         { "success": false, "error": "..." }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = process.env.SUPABASE_URL;

/* Storage 비공개 객체까지 읽어야 하므로 service_role 키를 쓴다. 브라우저에 나가지 않는다. */
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STT_MODEL = process.env.OPENAI_STT_MODEL || 'whisper-1';

/* 앱이 올릴 수 있는 버킷만 허용한다. 임의 버킷을 읽어가지 못하게 한다. */
const ALLOWED_BUCKETS = new Set(['field-audio']);

/* Whisper 업로드 상한이 25MB다. 받기 전에 거른다. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function fail(response: VercelResponse, message: string, status = 200) {
  return response.status(status).json({ success: false, error: message });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (request.method !== 'POST') {
    return fail(response, 'POST 만 지원합니다.', 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return fail(response, 'Supabase 환경변수가 설정되지 않았습니다.');
  }
  if (!OPENAI_API_KEY) {
    return fail(response, 'OPENAI_API_KEY 가 설정되지 않았습니다.');
  }

  const body = (request.body ?? {}) as {
    bucket?: string;
    path?: string;
  };

  const bucket = body.bucket || 'field-audio';
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return fail(response, `허용되지 않은 버킷입니다: ${bucket}`);
  }

  const path = (body.path || '').trim().replace(/^\/+/, '');
  if (!path || path.includes('..')) {
    return fail(response, '잘못된 파일 경로입니다.');
  }

  try {
    const object = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
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
        `녹음 파일을 내려받지 못했습니다. HTTP ${object.status}`,
      );
    }

    const audio = Buffer.from(await object.arrayBuffer());

    if (audio.length === 0) {
      return fail(response, '녹음 파일이 비어 있습니다.');
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      return fail(
        response,
        `녹음 파일이 너무 큽니다(${(audio.length / 1024 / 1024).toFixed(1)}MB). ` +
          '25MB 이하만 변환할 수 있습니다.',
      );
    }

    const filename = path.split('/').pop() || 'audio.webm';

    const form = new FormData();
    form.append('model', STT_MODEL);
    form.append('language', 'ko');
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], {
        type: object.headers.get('content-type') || 'audio/webm',
      }),
      filename,
    );

    const stt = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      },
    );

    if (!stt.ok) {
      const detail = await stt.text();
      return fail(
        response,
        `음성 변환에 실패했습니다. HTTP ${stt.status} ${detail.slice(0, 160)}`,
      );
    }

    const result = (await stt.json()) as { text?: string };
    const transcript = (result.text || '').trim();

    if (!transcript) {
      return fail(response, '변환된 작업일지 내용이 비어 있습니다.');
    }

    return response.status(200).json({ success: true, transcript });
  } catch (error) {
    console.error('field-audio-stt 실패:', error);
    return fail(
      response,
      error instanceof Error
        ? `음성 변환 중 오류가 발생했습니다. ${error.message}`
        : '음성 변환 중 알 수 없는 오류가 발생했습니다.',
    );
  }
}
