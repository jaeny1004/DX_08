const VWORLD_KEY = String(
  import.meta.env.VITE_VWORLD_API_KEY ?? "",
).trim();

export const HAS_VWORLD_KEY = VWORLD_KEY.length > 0;

const OSM_BASE_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const VWORLD_BASE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`;
const VWORLD_SATELLITE_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`;
const VWORLD_HYBRID_URL =
  `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Hybrid/{z}/{y}/{x}.png`;

export const MAP_TILE_CONFIG = {
  base: {
    url: HAS_VWORLD_KEY ? VWORLD_BASE_URL : OSM_BASE_URL,
    attribution: HAS_VWORLD_KEY
      ? "© VWorld"
      : "© OpenStreetMap contributors",
  },
  satellite: {
    url: HAS_VWORLD_KEY
      ? VWORLD_SATELLITE_URL
      : ESRI_SATELLITE_URL,
    attribution: HAS_VWORLD_KEY ? "© VWorld" : "Tiles © Esri",
  },
  hybrid: HAS_VWORLD_KEY
    ? {
        url: VWORLD_HYBRID_URL,
        attribution: "© VWorld",
      }
    : null,
} as const;
