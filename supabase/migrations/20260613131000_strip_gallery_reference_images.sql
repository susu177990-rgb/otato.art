-- Current gallery policy: only generated result images are gallery assets.
-- Reference images remain request-time inputs and local restore cache, not cloud assets.

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
  set data =
    case
      when coalesce(data->>'imageUrl', '') like 'data:%'
        or length(coalesce(data->>'imageUrl', '')) > 8192
      then data - 'referenceImages' - 'imageUrl'
      else data - 'referenceImages'
    end
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
