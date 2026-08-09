/**
 * 위경도 -> 행정동 + 격자ID 역조회.
 *
 * 확진목·현장사진·음성일지에는 좌표만 있고 행정동/격자ID가 없어서,
 * 화면에 좌표를 그대로 노출하는 대신 이 유틸로 사람이 읽을 수 있는 위치로 바꾼다.
 *
 * 원본 격자 geojson은 54MB라 프론트에서 쓸 수 없으므로,
 * scripts/build_grid_lookup.py가 중심점만 뽑아 만든 1.15MB 파일을 사용한다.
 */

export interface GridLocation {
  gridId: string;
  emdName: string;
  /** 격자 중심까지의 거리(m). 격자 한 변이 500m이므로 이보다 크게 떨어지면 격자 밖이다. */
  distanceM: number;
}

interface GridLookupPayload {
  ids: number[];
  lats: number[];
  lngs: number[];
  emds: number[];
  emdNames: string[];
}

const LOOKUP_PATH = "/data/grid_lookup.json";

/**
 * 격자 한 변이 500m라 중심에서 최대 약 354m(대각선 절반) 떨어질 수 있다.
 * 좌표 오차를 감안해 여유를 두고, 이 거리를 넘으면 격자 밖으로 본다.
 */
const MAX_MATCH_DISTANCE_M = 600;

/** 위도 1도는 어디서나 약 111km. 경도는 위도에 따라 줄어든다. */
const METERS_PER_DEG_LAT = 111_320;

let payload: GridLookupPayload | null = null;
let loading: Promise<GridLookupPayload | null> | null = null;

/**
 * 0.05도(약 5.5km) 단위 버킷 인덱스.
 * 4만 개를 매번 전수 검색하면 목록 렌더링에서 느려지므로 후보를 좁힌다.
 */
const BUCKET_SIZE_DEG = 0.05;
let buckets: Map<string, number[]> | null = null;

function bucketKey(lat: number, lng: number) {
  return `${Math.floor(lat / BUCKET_SIZE_DEG)}:${Math.floor(lng / BUCKET_SIZE_DEG)}`;
}

function buildBuckets(data: GridLookupPayload) {
  const map = new Map<string, number[]>();
  for (let i = 0; i < data.ids.length; i += 1) {
    const key = bucketKey(data.lats[i], data.lngs[i]);
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }
  return map;
}

/** 룩업 데이터를 한 번만 받아 캐시한다. 실패해도 화면이 죽지 않도록 null을 돌려준다. */
export function loadGridLookup(): Promise<GridLookupPayload | null> {
  if (payload) return Promise.resolve(payload);
  if (loading) return loading;

  loading = fetch(LOOKUP_PATH, { cache: "force-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: GridLookupPayload | null) => {
      if (!data) return null;
      payload = data;
      buckets = buildBuckets(data);
      return data;
    })
    .catch(() => null);

  return loading;
}

/**
 * 좌표에 해당하는 격자를 찾는다.
 * 룩업이 아직 로드되지 않았거나 격자 밖이면 null.
 */
export function resolveGridLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): GridLocation | null {
  if (
    !payload ||
    !buckets ||
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const latScale = METERS_PER_DEG_LAT;
  const lngScale = METERS_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);

  let bestIndex = -1;
  let bestSquared = Infinity;

  // 자기 버킷과 인접 8개만 훑는다(버킷 5.5km > 격자 500m라 경계 누락 없음).
  const baseLat = Math.floor(latitude / BUCKET_SIZE_DEG);
  const baseLng = Math.floor(longitude / BUCKET_SIZE_DEG);

  for (let dLat = -1; dLat <= 1; dLat += 1) {
    for (let dLng = -1; dLng <= 1; dLng += 1) {
      const list = buckets.get(`${baseLat + dLat}:${baseLng + dLng}`);
      if (!list) continue;
      for (const index of list) {
        const dy = (payload.lats[index] - latitude) * latScale;
        const dx = (payload.lngs[index] - longitude) * lngScale;
        const squared = dx * dx + dy * dy;
        if (squared < bestSquared) {
          bestSquared = squared;
          bestIndex = index;
        }
      }
    }
  }

  if (bestIndex < 0) return null;

  const distanceM = Math.sqrt(bestSquared);
  if (distanceM > MAX_MATCH_DISTANCE_M) return null;

  return {
    gridId: String(payload.ids[bestIndex]),
    emdName: payload.emdNames[payload.emds[bestIndex]] ?? "",
    distanceM,
  };
}

/**
 * 화면에 표시할 위치 문자열을 만든다.
 * 좌표를 그대로 노출하지 않는다는 것이 이 함수의 목적이다.
 *
 * @param fallbackRegion 좌표가 없거나 격자를 못 찾았을 때 쓸 주소 문자열
 */
export function formatGridLocation(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  fallbackRegion?: string,
): string {
  const location = resolveGridLocation(latitude, longitude);
  if (location) {
    return location.emdName
      ? `${location.emdName} · 격자 ${location.gridId}`
      : `격자 ${location.gridId}`;
  }
  const trimmed = (fallbackRegion ?? "").trim();
  if (trimmed) return trimmed;
  return "위치 정보 없음";
}
