-- Fetch infection-grid positions for one report in a single RPC round trip.
-- The caller is the FastAPI backend using the service_role key.

drop function if exists public.get_infection_grid_positions(bigint[]);

create function public.get_infection_grid_positions(
  p_grid_ids bigint[]
)
returns table (
  positions jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grid_id', source.grid_id,
        'geometry_4326', source.geometry_4326,
        'infection_count_2016', source.infection_count_2016,
        'infection_count_2017', source.infection_count_2017,
        'infection_count_2018', source.infection_count_2018,
        'infection_count_2019', source.infection_count_2019,
        'infection_count_2020', source.infection_count_2020,
        'infection_count_2021', source.infection_count_2021,
        'infection_count_2016_2021', source.infection_count_2016_2021,
        'infection_data_version', source.infection_data_version
      )
      order by source.grid_id
    ),
    '[]'::jsonb
  ) as positions
  from public.infection_grid_positions as source
  where source.grid_id = any(coalesce(p_grid_ids, '{}'::bigint[]));
$$;

comment on function public.get_infection_grid_positions(bigint[]) is
  'Returns infection-grid positions for the requested grid IDs in ascending grid_id order; service_role only.';

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- Keep this RPC aligned with the service_role-only table access pattern.
revoke all on function public.get_infection_grid_positions(bigint[]) from public;
revoke all on function public.get_infection_grid_positions(bigint[]) from anon;
revoke all on function public.get_infection_grid_positions(bigint[]) from authenticated;
grant execute on function public.get_infection_grid_positions(bigint[]) to service_role;
