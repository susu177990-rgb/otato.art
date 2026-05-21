-- 在 Supabase Dashboard → SQL Editor 中执行（修复画廊加载超时 / 图片「消失」）
-- 原因：image_gallery_records.data 内嵌了 data: base64 大图，单行可达数 MB，查询触发 statement timeout (57014)

-- 1) 清理已有内联图
update public.image_gallery_records
set data = data - 'referenceImages' - 'imageUrl'
where data ? 'referenceImages'
   or coalesce(data->>'imageUrl', '') like 'data:%'
   or length(coalesce(data->>'imageUrl', '')) > 8192;

-- 2) 可选：安装按用户压缩的 RPC（与 supabase/migrations/20260520100000_gallery_compact_inline_images.sql 一致）
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
