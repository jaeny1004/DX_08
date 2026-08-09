/**
 * Supabase 브라우저 클라이언트 (공용).
 *
 * App.tsx / MonitoringSection.tsx / ThermalAnalysisSection.tsx /
 * DroneVisionAnalysisSection.tsx 가 각자 createClient 를 호출하고 있어서
 * 같은 프로젝트에 클라이언트가 4개 생긴다. 새로 쓰는 코드는 여기를 쓴다.
 * (기존 4곳은 동작 중이라 이번 작업에서 건드리지 않는다)
 *
 * 키가 없을 때 throw 하지 않고 null 을 반환한다. 현장 앱 연동 기능은
 * Supabase가 없어도 나머지 화면이 뜨는 편이 낫기 때문이다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

if (url && anonKey) {
  client = createClient(url, anonKey);
} else {
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없어 Supabase 연동 기능이 꺼집니다.",
  );
}

export const supabase = client;
