import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";

import {
  listEmd,
  listSido,
  listSigungu,
  loadGridLookup,
  resolveGridByRegion,
  type GridLocation,
} from "../utils/gridLookup";

export interface RegionPickerValue {
  sido: string;
  sigungu: string;
  emd: string;
  /** 지번·건물명 등 사용자가 직접 적는 나머지 주소 */
  detail: string;
}

export const EMPTY_REGION: RegionPickerValue = {
  sido: "",
  sigungu: "",
  emd: "",
  detail: "",
};

/** 화면·기록에 남길 전체 주소 문자열. */
export function formatRegionText(value: RegionPickerValue): string {
  return [value.sido, value.sigungu, value.emd, value.detail]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

interface RegionPickerProps {
  label?: string;
  value: RegionPickerValue;
  onChange: (value: RegionPickerValue) => void;
  /** 판정된 격자를 상위에서도 써야 할 때 */
  onResolve?: (location: GridLocation | null) => void;
}

/**
 * 시도 -> 시군구 -> 읍면동을 목록에서 고르고, 나머지 주소만 직접 적는 입력.
 *
 * 등록 화면마다 주소를 자유 입력받으니 오타·표기 차이로 격자를 못 찾는 일이
 * 잦았다. 대시보드 지도와 같은 방식으로 목록에서 고르게 해 판정을 보장한다.
 */
export default function RegionPicker({
  label = "대상 위치",
  value,
  onChange,
  onResolve,
}: RegionPickerProps) {
  // 룩업이 비동기라 로드가 끝나면 목록을 다시 계산해야 한다.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGridLookup().then((data) => {
      if (!cancelled && data) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sidoOptions = useMemo(() => (ready ? listSido() : []), [ready]);
  const sigunguOptions = useMemo(
    () => (ready ? listSigungu(value.sido) : []),
    [ready, value.sido],
  );
  const emdOptions = useMemo(
    () => (ready ? listEmd(value.sido, value.sigungu) : []),
    [ready, value.sido, value.sigungu],
  );

  const resolved = useMemo(
    () =>
      ready ? resolveGridByRegion(value.sido, value.sigungu, value.emd) : null,
    [ready, value.sido, value.sigungu, value.emd],
  );

  useEffect(() => {
    onResolve?.(resolved);
    // onResolve는 매 렌더 새로 만들어질 수 있어 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  const selectClass =
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div>
      <label className="mb-1 block text-[11px] font-black text-slate-600">
        {label}
      </label>

      <div className="grid grid-cols-3 gap-2">
        <select
          value={value.sido}
          onChange={(event) =>
            onChange({
              ...value,
              sido: event.target.value,
              sigungu: "",
              emd: "",
            })
          }
          className={selectClass}
        >
          <option value="">시도</option>
          {sidoOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={value.sigungu}
          disabled={!value.sido}
          onChange={(event) =>
            onChange({ ...value, sigungu: event.target.value, emd: "" })
          }
          className={selectClass}
        >
          <option value="">시군구</option>
          {sigunguOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={value.emd}
          disabled={!value.sigungu}
          onChange={(event) => onChange({ ...value, emd: event.target.value })}
          className={selectClass}
        >
          <option value="">읍면동</option>
          {emdOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        value={value.detail}
        onChange={(event) => onChange({ ...value, detail: event.target.value })}
        placeholder="상세 주소 (예: 상옥리 산42)"
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
      />

      <div
        className={
          resolved
            ? "mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2"
            : "mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
        }
      >
        <MapPin
          size={13}
          className={
            resolved ? "shrink-0 text-emerald-600" : "shrink-0 text-slate-400"
          }
        />
        <span
          className={
            resolved
              ? "text-[11px] font-black text-emerald-800"
              : "text-[11px] font-bold text-slate-500"
          }
        >
          {resolved
            ? `${resolved.emdName} · 격자 ${resolved.gridId}`
            : "읍면동까지 선택하면 격자가 지정됩니다."}
        </span>
      </div>
    </div>
  );
}
