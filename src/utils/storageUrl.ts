/**
 * Supabase Storage 공개 URL 조립.
 *
 * 앱은 파일을 버킷에 올리고 DB 에는 storage_path 만 남긴다. 화면에서 보여주려면
 * 매번 전체 URL 로 만들어야 해서 한 곳에 모았다.
 *
 * pine-images / field-photos / field-audio 세 버킷은 public 이라 서명 없이 열린다
 * (011_app_shared_tables.sql 에서 public=true 로 만든다).
 */
const SUPABASE_URL = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""
).replace(/\/+$/, "");

export function buildStorageUrl(
  bucket: string,
  path: string,
): string {
  if (!SUPABASE_URL || !path) return "";

  // 이미 전체 URL 이면 그대로 쓴다. 예전 데이터에 절대 URL 이 섞여 있다.
  if (/^https?:\/\//i.test(path)) return path;

  // Storage key 에는 한글·공백이 들어갈 수 있어 세그먼트 단위로 인코딩한다.
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}
