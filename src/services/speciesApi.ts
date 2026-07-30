import { buildApiUrl } from "../config/api";

export interface RecommendedSpecies {
  species: string;
  reason: string;
}

export interface RegionalBroadleaf {
  species: string;
  regional_score: number;
}

export interface SpeciesRecommendation {
  grid_id: number;
  region: string;
  site_summary: {
    climate_zone?: string | null;
    forest_soil_type?: string | null;
    soil_depth_class?: string | null;
    aspect_deg?: number | null;
    [key: string]: unknown;
  };
  current_composition: Record<string, number>;
  regional_broadleaf: RegionalBroadleaf[];
  recommended_species: RecommendedSpecies[];
  rationale: string;
  budget_estimate: string;
  notes: string;
  is_ai_generated: boolean;
}

/** 격자 기반 AI 친환경 수종전환 추천을 요청한다. */
export async function recommendSpecies(
  gridId: number,
): Promise<SpeciesRecommendation> {
  const response = await fetch(buildApiUrl("/api/species/recommendation"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grid_id: gridId }),
  });

  if (!response.ok) {
    let message = "수종전환 추천을 불러오지 못했습니다.";
    try {
      const data = await response.json();
      if (data?.detail) message = String(data.detail);
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await response.json()) as SpeciesRecommendation;
}
