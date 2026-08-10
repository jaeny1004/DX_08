import { readFile } from 'node:fs/promises';

const projectRef = 'ukrdqbxvyrndfauzkmxv';

const functionUrl =
  `https://${projectRef}.supabase.co/functions/v1/ingest-rag`;

const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.error(
    'SUPABASE_PUBLISHABLE_KEY 환경변수가 설정되지 않았습니다.',
  );
  process.exit(1);
}

const fileUrl = new URL(
  '../rag-data/pine_rag_chunks.json',
  import.meta.url,
);

const rawFile = await readFile(fileUrl, 'utf-8');
const chunks = JSON.parse(rawFile);

if (!Array.isArray(chunks)) {
  console.error('JSON 최상위 데이터가 배열이 아닙니다.');
  process.exit(1);
}

console.log(`총 ${chunks.length}개 문단 업로드를 시작합니다.`);

let successCount = 0;
let failureCount = 0;

for (let index = 0; index < chunks.length; index += 1) {
  const chunk = chunks[index];

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(chunk),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || `HTTP ${response.status}`,
      );
    }

    successCount += 1;

    console.log(
      `[${index + 1}/${chunks.length}] 저장 성공: ` +
      `${chunk.section_title || chunk.document_title}`,
    );
  } catch (error) {
    failureCount += 1;

    console.error(
      `[${index + 1}/${chunks.length}] 저장 실패:`,
      error instanceof Error ? error.message : error,
    );
  }
}

console.log('');
console.log('업로드 완료');
console.log(`성공: ${successCount}개`);
console.log(`실패: ${failureCount}개`);

if (failureCount > 0) {
  process.exitCode = 1;
}