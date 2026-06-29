-- R2 reference restore needs persisted referenceImages URLs.
-- Keep stable http(s) reference URLs while continuing to remove inline data URLs.

create or replace function public.compact_image_gallery_records()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
  total integer := 0;
begin
  update public.image_gallery_records
  set data =
    case
      when jsonb_typeof(data->'referenceImages') = 'array' then
        jsonb_set(
          case
            when coalesce(data->>'imageUrl', '') like 'data:%'
              or length(coalesce(data->>'imageUrl', '')) > 8192
            then data - 'imageUrl'
            else data
          end,
          '{referenceImages}',
          (
            select coalesce(jsonb_agg(item), '[]'::jsonb)
            from jsonb_array_elements(data->'referenceImages') as ref(item)
            where coalesce(item->>'dataUrl', '') not like 'data:%'
              and length(coalesce(item->>'dataUrl', '')) <= 8192
              and coalesce(item->>'dataUrl', '') ~* '^https?://'
          ),
          true
        )
      else
        case
          when coalesce(data->>'imageUrl', '') like 'data:%'
            or length(coalesce(data->>'imageUrl', '')) > 8192
          then data - 'imageUrl'
          else data
        end
    end
  where user_id = auth.uid()
    and (
      coalesce(data->>'imageUrl', '') like 'data:%'
      or length(coalesce(data->>'imageUrl', '')) > 8192
      or exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(data->'referenceImages') = 'array' then data->'referenceImages'
            else '[]'::jsonb
          end
        ) as ref(item)
        where coalesce(item->>'dataUrl', '') like 'data:%'
          or length(coalesce(item->>'dataUrl', '')) > 8192
          or coalesce(item->>'dataUrl', '') !~* '^https?://'
      )
    );

  get diagnostics affected = row_count;
  total := total + affected;

  update public.image_gallery_records
  set data = data - 'referenceImages'
  where user_id = auth.uid()
    and jsonb_typeof(data->'referenceImages') = 'array'
    and jsonb_array_length(data->'referenceImages') = 0;

  get diagnostics affected = row_count;
  total := total + affected;
  return total;
end;
$$;

grant execute on function public.compact_image_gallery_records() to authenticated;
