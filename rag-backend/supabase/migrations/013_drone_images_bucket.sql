-- 드론 가시광·열화상 분석 이미지 버킷.
--
-- 배경
--   열화상 업로드가 "Bucket not found" 로 실패했다. 웹의
--   ThermalAnalysisSection / DroneVisionAnalysisSection 이 drone-images 버킷에
--   올리는데 그 버킷이 없었다. 011 에서 앱이 쓰는 버킷 3개만 만들고 웹 전용
--   버킷을 빠뜨렸다.
--
--   버킷 자체는 Storage API 로 만들었지만 RLS 정책이 없어 anon 업로드가
--   "new row violates row-level security policy" 로 막힌다. 011 에서 다른
--   버킷에 준 것과 같은 정책을 준다.
--
--   키는 UUID 로 만들고 있어(thermal/날짜/UUID.ext) 한글 파일명 문제는 없다.

insert into storage.buckets (id, name, public)
values ('drone-images', 'drone-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'drone-images_all'
  ) then
    create policy "drone-images_all" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 'drone-images')
      with check (bucket_id = 'drone-images');
  end if;
end $$;
