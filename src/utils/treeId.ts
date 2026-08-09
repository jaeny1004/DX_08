/**
 * 확진목 관리 ID 생성 (단일 창구).
 *
 * 이전에는 세 곳에서 제각각 만들어 형식이 섞여 있었다.
 *   - 신규 등록 / 시민제보 확진: PT-2026-4837   (4자리 난수)
 *   - 드론·열화상 분석:          PT-2026-A1B2C3D4 (UUID 8자리)
 * 화면에서 정렬·검색이 어긋나므로 PT-YYYY-NNNN 한 가지로 통일한다.
 */

const ID_PREFIX = "PT";

/** PT-YYYY-NNNN 형식인지 검사한다. */
const ID_PATTERN = /^PT-(\d{4})-(\d{4})$/;

/**
 * 기존 ID와 겹치지 않는 다음 관리 ID를 만든다.
 * 같은 해에 이미 발급된 번호가 있으면 그 다음 번호를 쓰고,
 * 없으면 1번부터 시작한다. 화면 목록이 시간순으로 읽히도록 순번을 쓴다.
 *
 * @param existingIds 이미 사용 중인 관리 ID 목록
 * @param now 테스트에서 연도를 고정하기 위한 주입점
 */
export function createTreeId(
  existingIds: Iterable<string> = [],
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  let maxSequence = 0;

  for (const id of existingIds) {
    const matched = ID_PATTERN.exec(id ?? "");
    if (!matched) continue;
    if (Number(matched[1]) !== year) continue;
    maxSequence = Math.max(maxSequence, Number(matched[2]));
  }

  const next = String(maxSequence + 1).padStart(4, "0");
  return `${ID_PREFIX}-${year}-${next}`;
}

/** 표시 직전에 형식을 확인하고 싶을 때 사용한다. */
export function isTreeId(value: string): boolean {
  return ID_PATTERN.test(value);
}
