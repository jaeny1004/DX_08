import {
  SidoOption,
} from "../types/auth";

let cachedRegions: SidoOption[] | null = null;

export async function loadAdministrativeRegions(): Promise<SidoOption[]> {
  if (cachedRegions) {
    return cachedRegions;
  }

  const response = await fetch(
    "/data/administrative_regions.json",
  );

  if (!response.ok) {
    throw new Error(
      "시도·시군구 목록을 불러오지 못했습니다.",
    );
  }

  const payload =
    await response.json() as SidoOption[];

  cachedRegions = payload;
  return payload;
}
