create table public.ms_cloud_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 app text not null check (app in ('ms-plot','ms-generator')),
 kind text not null check (kind in ('project','presets')),
 name text not null check (length(btrim(name)) between 1 and 160),
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20971520),
 source_id text,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (user_id,app,kind,source_id)
);
create index ms_cloud_items_owner_app_updated on public.ms_cloud_items(user_id,app,updated_at desc);
alter table public.ms_cloud_items enable row level security;
revoke all on public.ms_cloud_items from anon;
grant select,insert,update,delete on public.ms_cloud_items to authenticated;
create policy own_items_select on public.ms_cloud_items for select to authenticated using ((select auth.uid())=user_id);
create policy own_items_insert on public.ms_cloud_items for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_items_update on public.ms_cloud_items for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_items_delete on public.ms_cloud_items for delete to authenticated using ((select auth.uid())=user_id);
create function public.ms_cloud_item_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.id := old.id; new.user_id := old.user_id; new.app := old.app; new.kind := old.kind;
 new.created_at := old.created_at; new.revision := old.revision+1; new.updated_at := now();
 return new;
end $$;
revoke all on function public.ms_cloud_item_revision() from public,anon,authenticated;
create trigger ms_cloud_revision before update on public.ms_cloud_items for each row execute function public.ms_cloud_item_revision();
