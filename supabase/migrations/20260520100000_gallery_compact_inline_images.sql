-- 画廊 data 中内嵌 data: URL / 参考图会使单行 JSONB 达数 MB，查询触发 statement timeout (57014)。
-- 剥离内联二进制，仅保留元数据；原图由客户端 localStorage 缓存或上游 http(s) URL 承担。

create or replace function public.compact_image_gallery_records()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update public.image_gallery_records
  set data = data - 'referenceImages' - 'imageUrl'
  where user_id = auth.uid()
    and (
      data ? 'referenceImages'
      or coalesce(data->>'imageUrl', '') like 'data:%'
      or length(coalesce(data->>'imageUrl', '')) > 8192
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.compact_image_gallery_records() to authenticated;

-- 一次性：全表清理历史内联图（部署后在 SQL Editor 执行 migration 即可）
update public.image_gallery_records
set data = data - 'referenceImages' - 'imageUrl'
where data ? 'referenceImages'
   or coalesce(data->>'imageUrl', '') like 'data:%'
   or length(coalesce(data->>'imageUrl', '')) > 8192;
