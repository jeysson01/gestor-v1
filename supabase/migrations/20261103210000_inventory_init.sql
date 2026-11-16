-- Inventario Pro: productos, compras y detalle.
-- Aplícalo en el SQL Editor de Supabase o con `supabase db query --linked`.
-- La app solo usa la clave anon. La service_role no va en el cliente.
-- Autorización: cualquier usuario autenticado (un solo administrador).
-- No uses user_metadata para permisos.

create table if not exists public.products (
  id text primary key,
  code text not null,
  name text not null,
  category text not null default '',
  unit_price numeric not null default 0 check (unit_price >= 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists products_code_active
  on public.products (code)
  where deleted_at is null;

create index if not exists products_updated_at on public.products (updated_at);

create table if not exists public.purchases (
  id text primary key,
  number text not null,
  purchased_at timestamptz not null,
  supplier text not null default '',
  yape text not null default '',
  total numeric not null default 0 check (total >= 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists purchases_updated_at on public.purchases (updated_at);

create table if not exists public.purchase_items (
  id text primary key,
  purchase_id text not null references public.purchases (id) on delete cascade,
  product_id text,
  code text not null default '',
  name text not null default '',
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  subtotal numeric not null check (subtotal >= 0)
);

create index if not exists purchase_items_purchase on public.purchase_items (purchase_id);

alter table public.products enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on table public.products from anon;
revoke all on table public.purchases from anon;
revoke all on table public.purchase_items from anon;

grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.purchases to authenticated;
grant select, insert, update, delete on public.purchase_items to authenticated;

drop policy if exists "admin all products" on public.products;
create policy "admin all products"
  on public.products
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin all purchases" on public.purchases;
create policy "admin all purchases"
  on public.purchases
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin all purchase items" on public.purchase_items;
create policy "admin all purchase items"
  on public.purchase_items
  for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  begin
    alter publication supabase_realtime add table public.products;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.purchases;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.purchase_items;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
