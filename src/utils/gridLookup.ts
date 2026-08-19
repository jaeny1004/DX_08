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
  /** 격자 중심 좌표. 요원까지의 거리 계산 등에 쓴다. */
  latitude: number;
  longitude: number;
  /** 격자 중심까지의 거리(m). 격자 한 변이 500m이므로 이보다 크게 떨어지면 격자 밖이다. */
  distanceM: number;
}

interface GridLookupPayload {
  ids: number[];
  lats: number[];
  lngs: number[];
  emds: number[];
  emdNames: string[];
  sigungus: number[];
  sigunguNames: string[];
  sidos: number[];
  sidoNames: string[];
}

/**
 * 파일 구조가 바뀌면 v를 올린다.
 * force-cache로 받기 때문에, 올리지 않으면 브라우저가 예전 파일을 계속 쓴다.
 * v1에는 시도·시군구가 없어서 목록 선택이 빈 채로 깨졌다.
 */
const LOOKUP_PATH = "/data/grid_lookup.json?v=2";

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
 * 좌표 입력값. 일부 데이터는 좌표가 문자열로 들어와 있어 숫자만 받지 않는다.
 */
export type CoordinateInput = number | string | null | undefined;

function toNumber(value: CoordinateInput): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 좌표에 해당하는 격자를 찾는다.
 * 룩업이 아직 로드되지 않았거나 격자 밖이면 null.
 */
export function resolveGridLocation(
  latitudeInput: CoordinateInput,
  longitudeInput: CoordinateInput,
): GridLocation | null {
  const nearest = findNearestGrid(latitudeInput, longitudeInput);
  if (!nearest || nearest.distanceM > MAX_MATCH_DISTANCE_M) return null;
  return nearest;
}

/**
 * 거리 제한 없이 가장 가까운 격자를 돌려준다.
 * 격자 데이터가 전국이 아니라 위험후보 격자만 담고 있어, 실제 주소가
 * 격자 밖에 떨어지는 경우가 흔하다. 그때 "가장 가까운 후보가 얼마나 먼지"를
 * 사용자에게 알려주기 위해 쓴다.
 */
export function findNearestGrid(
  latitudeInput: CoordinateInput,
  longitudeInput: CoordinateInput,
): GridLocation | null {
  const latitude = toNumber(latitudeInput);
  const longitude = toNumber(longitudeInput);

  if (!payload || !buckets || latitude === null || longitude === null) {
    return null;
  }

  const latScale = METERS_PER_DEG_LAT;
  const lngScale = METERS_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180);

  let bestIndex = -1;
  let bestSquared = Infinity;

  // 자기 버킷부터 시작해 후보를 찾을 때까지 반경을 넓힌다.
  // 위험후보 격자만 담긴 데이터라 주변에 격자가 아예 없는 지역도 있다.
  const baseLat = Math.floor(latitude / BUCKET_SIZE_DEG);
  const baseLng = Math.floor(longitude / BUCKET_SIZE_DEG);

  for (let ring = 1; ring <= 8 && bestIndex < 0; ring += 1) {
    for (let dLat = -ring; dLat <= ring; dLat += 1) {
      for (let dLng = -ring; dLng <= ring; dLng += 1) {
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
  }

  if (bestIndex < 0) return null;

  const distanceM = Math.sqrt(bestSquared);

  return {
    gridId: String(payload.ids[bestIndex]),
    emdName: payload.emdNames[payload.emds[bestIndex]] ?? "",
    latitude: payload.lats[bestIndex],
    longitude: payload.lngs[bestIndex],
    distanceM,
  };
}

/**
 * 행정동 이름 -> 대표 격자.
 * 좌표 없이 주소만 입력했을 때도 행정동·격자를 찾아 주기 위한 색인이다.
 * 대표 격자는 해당 행정동 격자들의 평균 위치에 가장 가까운 격자로 잡는다.
 */
let emdRepresentative: Map<string, GridLocation> | null = null;

function buildEmdIndex(data: GridLookupPayload) {
  const sums = new Map<number, { lat: number; lng: number; count: number }>();
  for (let i = 0; i < data.ids.length; i += 1) {
    const slot = data.emds[i];
    const acc = sums.get(slot);
    if (acc) {
      acc.lat += data.lats[i];
      acc.lng += data.lngs[i];
      acc.count += 1;
    } else {
      sums.set(slot, { lat: data.lats[i], lng: data.lngs[i], count: 1 });
    }
  }

  const best = new Map<number, { index: number; squared: number }>();
  for (let i = 0; i < data.ids.length; i += 1) {
    const slot = data.emds[i];
    const acc = sums.get(slot)!;
    const dLat = data.lats[i] - acc.lat / acc.count;
    const dLng = data.lngs[i] - acc.lng / acc.count;
    const squared = dLat * dLat + dLng * dLng;
    const current = best.get(slot);
    if (!current || squared < current.squared) {
      best.set(slot, { index: i, squared });
    }
  }

  const result = new Map<string, GridLocation>();
  for (const [slot, { index }] of best) {
    const name = data.emdNames[slot];
    if (!name) continue;
    result.set(name, {
      gridId: String(data.ids[index]),
      emdName: name,
      latitude: data.lats[index],
      longitude: data.lngs[index],
      distanceM: 0,
    });
  }
  return result;
}

/**
 * 주소 문자열에서 행정동 이름을 찾아 대표 격자를 돌려준다.
 * "경북 포항시 북구 죽장면 산42"처럼 지번이 붙어 있어도 동작하도록
 * 문자열에 포함된 행정동 이름 중 가장 긴 것을 고른다
 * (예: "동면"과 "북산동면"이 함께 걸리면 긴 쪽이 맞다).
 */
export function resolveGridByRegionText(
  text: string | null | undefined,
): GridLocation | null {
  const value = (text ?? "").trim();
  if (!payload || !value) return null;

  if (!emdRepresentative) {
    emdRepresentative = buildEmdIndex(payload);
  }

  let matched: GridLocation | null = null;
  for (const [name, location] of emdRepresentative) {
    if (name.length < 2) continue;
    if (!value.includes(name)) continue;
    if (!matched || name.length > matched.emdName.length) {
      matched = location;
    }
  }
  return matched;
}

/* ------------------------------------------------------------------
 * 행정구역 선택(시도 -> 시군구 -> 읍면동)
 * 등록 화면에서 주소를 직접 적는 대신 목록에서 고르게 하기 위한 것.
 * ---------------------------------------------------------------- */

/**
 * 예전 캐시본에는 시도·시군구가 없다.
 * 없는 필드를 그대로 순회하면 화면이 통째로 죽으므로 여기서 걸러 낸다.
 */
function hasRegionTables(
  value: GridLookupPayload | null,
): value is GridLookupPayload {
  return Boolean(
    value &&
      Array.isArray(value.sidos) &&
      Array.isArray(value.sidoNames) &&
      Array.isArray(value.sigungus) &&
      Array.isArray(value.sigunguNames),
  );
}

/** 격자가 존재하는 시도 목록. */
export function listSido(): string[] {
  if (!hasRegionTables(payload)) return [];
  const seen = new Set<number>();
  for (const slot of payload.sidos) seen.add(slot);
  return [...seen]
    .map((slot) => payload!.sidoNames[slot])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
}

/** 해당 시도에 속한 시군구 목록. */
export function listSigungu(sido: string): string[] {
  if (!hasRegionTables(payload) || !sido) return [];
  const sidoSlot = payload.sidoNames.indexOf(sido);
  if (sidoSlot < 0) return [];

  const seen = new Set<number>();
  for (let i = 0; i < payload.ids.length; i += 1) {
    if (payload.sidos[i] === sidoSlot) seen.add(payload.sigungus[i]);
  }
  return [...seen]
    .map((slot) => payload!.sigunguNames[slot])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
}

/** 해당 시군구에 속한 읍면동 목록. */
export function listEmd(sido: string, sigungu: string): string[] {
  if (!hasRegionTables(payload) || !sido || !sigungu) return [];
  const sidoSlot = payload.sidoNames.indexOf(sido);
  const sigunguSlot = payload.sigunguNames.indexOf(sigungu);
  if (sidoSlot < 0 || sigunguSlot < 0) return [];

  const seen = new Set<number>();
  for (let i = 0; i < payload.ids.length; i += 1) {
    if (
      payload.sidos[i] === sidoSlot &&
      payload.sigungus[i] === sigunguSlot
    ) {
      seen.add(payload.emds[i]);
    }
  }
  return [...seen]
    .map((slot) => payload!.emdNames[slot])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
}

/**
 * 고른 행정구역의 대표 격자.
 * 같은 이름의 읍면동이 여러 시군구에 있을 수 있어, 시도·시군구까지 함께 받는다.
 * 대표 격자는 해당 범위 격자들의 평균 위치에 가장 가까운 격자로 잡는다.
 */
export function resolveGridByRegion(
  sido: string,
  sigungu: string,
  emd: string,
): GridLocation | null {
  if (!hasRegionTables(payload) || !sido || !sigungu || !emd) return null;

  const sidoSlot = payload.sidoNames.indexOf(sido);
  const sigunguSlot = payload.sigunguNames.indexOf(sigungu);
  const emdSlot = payload.emdNames.indexOf(emd);
  if (sidoSlot < 0 || sigunguSlot < 0 || emdSlot < 0) return null;

  const members: number[] = [];
  let sumLat = 0;
  let sumLng = 0;
  for (let i = 0; i < payload.ids.length; i += 1) {
    if (
      payload.sidos[i] !== sidoSlot ||
      payload.sigungus[i] !== sigunguSlot ||
      payload.emds[i] !== emdSlot
    ) {
      continue;
    }
    members.push(i);
    sumLat += payload.lats[i];
    sumLng += payload.lngs[i];
  }
  if (!members.length) return null;

  const meanLat = sumLat / members.length;
  const meanLng = sumLng / members.length;

  let best = members[0];
  let bestSquared = Infinity;
  for (const index of members) {
    const dLat = payload.lats[index] - meanLat;
    const dLng = payload.lngs[index] - meanLng;
    const squared = dLat * dLat + dLng * dLng;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = index;
    }
  }

  return {
    gridId: String(payload.ids[best]),
    emdName: emd,
    latitude: payload.lats[best],
    longitude: payload.lngs[best],
    distanceM: 0,
  };
}

/**
 * 좌표가 있으면 좌표로, 없으면 주소 문자열로 격자를 찾는다.
 * 등록 화면에서 둘 중 하나만 입력해도 행정동·격자가 잡히게 하기 위한 창구.
 */
export function resolveGridLoose(
  latitude: CoordinateInput,
  longitude: CoordinateInput,
  regionText?: string | null,
): GridLocation | null {
  return (
    resolveGridLocation(latitude, longitude) ??
    resolveGridByRegionText(regionText)
  );
}

/**
 * 예전 코드가 주소칸에 저장해 둔 "위도 35.123456, 경도 128.123456" 형식을 잡아낸다.
 * 이미 DB에 이런 문자열로 들어간 데이터가 있어, fallback으로 그대로 노출하면
 * 좌표를 감추려는 목적이 무너진다.
 */
const LEGACY_COORDINATE_TEXT =
  /위도\s*(-?\d+(?:\.\d+)?)\s*,?\s*경도\s*(-?\d+(?:\.\d+)?)/;

function parseLegacyCoordinateText(
  text: string,
): { latitude: number; longitude: number } | null {
  const matched = LEGACY_COORDINATE_TEXT.exec(text);
  if (!matched) return null;
  return {
    latitude: Number(matched[1]),
    longitude: Number(matched[2]),
  };
}

/**
 * 화면에 표시할 위치 문자열을 만든다.
 * 좌표를 그대로 노출하지 않는다는 것이 이 함수의 목적이다.
 *
 * @param fallbackRegion 좌표가 없거나 격자를 못 찾았을 때 쓸 주소 문자열
 */
export function formatGridLocation(
  latitude: CoordinateInput,
  longitude: CoordinateInput,
  fallbackRegion?: string,
): string {
  const location = resolveGridLocation(latitude, longitude);
  if (location) {
    return location.emdName
      ? `${location.emdName} · 격자 ${location.gridId}`
      : `격자 ${location.gridId}`;
  }

  const trimmed = (fallbackRegion ?? "").trim();
  if (!trimmed) return "위치 정보 없음";

  // 주소칸 자체가 좌표 문자열이면, 거기서 좌표를 뽑아 한 번 더 시도한다.
  const legacy = parseLegacyCoordinateText(trimmed);
  if (legacy) {
    const fromLegacy = resolveGridLocation(legacy.latitude, legacy.longitude);
    if (fromLegacy) {
      return fromLegacy.emdName
        ? `${fromLegacy.emdName} · 격자 ${fromLegacy.gridId}`
        : `격자 ${fromLegacy.gridId}`;
    }
    // 격자를 못 찾아도 좌표를 그대로 보여주지는 않는다.
    return "위치 정보 없음";
  }

  return trimmed;
}
