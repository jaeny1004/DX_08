import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

const VWORLD_API_KEY =
  process.env.VWORLD_API_KEY ||
  process.env.VITE_VWORLD_API_KEY;

type VWorldAddressResult = {
  type?: string;
  text?: string;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "GET 요청만 허용됩니다.",
    });
  }

  if (!VWORLD_API_KEY) {
    return res.status(500).json({
      ok: false,
      error:
        "VWORLD_API_KEY 서버 환경변수가 없습니다.",
    });
  }

  const latitude = Number(
    Array.isArray(req.query.latitude)
      ? req.query.latitude[0]
      : req.query.latitude,
  );

  const longitude = Number(
    Array.isArray(req.query.longitude)
      ? req.query.longitude[0]
      : req.query.longitude,
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return res.status(400).json({
      ok: false,
      error: "올바른 위도·경도가 필요합니다.",
    });
  }

  try {
    const params = new URLSearchParams({
      service: "address",
      request: "getAddress",
      version: "2.0",
      crs: "EPSG:4326",
      point: `${longitude},${latitude}`,
      format: "json",
      type: "BOTH",
      zipcode: "false",
      simple: "false",
      key: VWORLD_API_KEY,
    });

    const requestOrigin =
      typeof req.headers.origin === "string"
        ? req.headers.origin
        : "";

    const requestReferer =
      typeof req.headers.referer === "string"
        ? req.headers.referer
        : "";

    const vworldResponse = await fetch(
      `https://api.vworld.kr/req/address?${params.toString()}`,
      {
        headers: {
          ...(requestOrigin
            ? { Origin: requestOrigin }
            : {}),
          ...(requestReferer
            ? { Referer: requestReferer }
            : {}),
        },
      },
    );

    const responseText =
      await vworldResponse.text();

    let payload: any;

    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(
        `VWorld 응답 해석 실패: ${responseText}`,
      );
    }

    if (!vworldResponse.ok) {
      throw new Error(
        `VWorld HTTP ${vworldResponse.status}`,
      );
    }

    const results: VWorldAddressResult[] =
      Array.isArray(payload?.response?.result)
        ? payload.response.result
        : [];

    if (
      payload?.response?.status !== "OK" ||
      results.length === 0
    ) {
      return res.status(404).json({
        ok: false,
        error:
          payload?.response?.error?.text ||
          "주소를 찾지 못했습니다.",
        rawStatus:
          payload?.response?.status ?? null,
      });
    }

    const parcelAddress = results.find(
      result =>
        String(result.type ?? "").toLowerCase() ===
        "parcel",
    );

    const address =
      parcelAddress?.text?.trim() ||
      results[0]?.text?.trim();

    if (!address) {
      return res.status(404).json({
        ok: false,
        error: "주소 결과가 비어 있습니다.",
      });
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800",
    );

    return res.status(200).json({
      ok: true,
      address,
      latitude,
      longitude,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "/api/reverse-geocode 오류:",
      message,
    );

    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
}