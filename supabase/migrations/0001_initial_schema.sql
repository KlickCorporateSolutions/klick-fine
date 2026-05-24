-- ============================================================
-- Klick FINE — Schema inicial multi-tenant
-- Migration: 0001_initial_schema
-- ============================================================

-- ---------- TABELAS ----------

-- 1. Organizações (cada agência IC cliente)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  bdp_registry_number text,
  branding_logo_url text,
  branding_primary_color text default '#D4AF37',
  branding_secondary_color text default '#1A472A',
  branding_app_name text,
  is_demo boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Roles e Memberships (utilizador <-> org)
create type public.org_role as enum ('owner', 'member');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  organization_id uuid references public.organizations on delete cascade not null,
  role public.org_role not null default 'member',
  invited_by uuid references auth.users,
  joined_at timestamptz default now(),
  unique (user_id, organization_id)
);
create index idx_memberships_user on public.memberships(user_id);
create index idx_memberships_org on public.memberships(organization_id);

-- 3. Super admins (Klick — acesso global)
create table public.super_admins (
  user_id uuid primary key references auth.users on delete cascade,
  granted_at timestamptz default now(),
  granted_by uuid references auth.users
);

-- 4. Clientes finais do crédito (mutuários)
create table public.credit_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete cascade not null,
  name text not null,
  nif text,
  email text,
  phone text,
  notes text,
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_credit_clients_org on public.credit_clients(organization_id);

-- 5. Processos de crédito
create type public.process_status as enum ('active', 'won', 'lost', 'archived');

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete cascade not null,
  credit_client_id uuid references public.credit_clients on delete cascade not null,
  reference text,
  finalidade text,
  montante_pretendido numeric,
  status public.process_status default 'active',
  closed_with_bank text,
  notes text,
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_processes_org on public.processes(organization_id);
create index idx_processes_client on public.processes(credit_client_id);

-- 6. Propostas (cada FINE carregada)
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes on delete cascade not null,
  pdf_filename text not null,
  pdf_storage_path text,
  banco text,
  extraction_mode text check (extraction_mode in ('text','vision','vision_thinking')),
  extracted_data jsonb not null,
  extraction_warnings text[] default '{}',
  manual_overrides jsonb default '{}'::jsonb,
  created_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_proposals_process on public.proposals(process_id);

-- 7. Audit log
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete set null,
  user_id uuid references auth.users on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index idx_activity_org on public.activity_log(organization_id, created_at desc);

-- 8. Support access log (Klick a aceder a tenants — transparência)
create table public.support_access_log (
  id uuid primary key default gen_random_uuid(),
  super_admin_id uuid references auth.users not null,
  organization_id uuid references public.organizations on delete cascade not null,
  reason text,
  accessed_at timestamptz default now()
);
create index idx_support_org on public.support_access_log(organization_id, accessed_at desc);

-- ---------- HELPER FUNCTIONS PARA RLS ----------

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = org_id
  );
$$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and organization_id = org_id and role = 'owner'
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- ---------- RLS ----------

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.super_admins enable row level security;
alter table public.credit_clients enable row level security;
alter table public.processes enable row level security;
alter table public.proposals enable row level security;
alter table public.activity_log enable row level security;
alter table public.support_access_log enable row level security;

-- organizations
create policy "View own orgs" on public.organizations for select
  using (is_org_member(id) or is_super_admin());
create policy "Create org" on public.organizations for insert
  with check (auth.uid() is not null);
create policy "Owner updates org" on public.organizations for update
  using (is_org_owner(id) or is_super_admin());

-- memberships
create policy "View org memberships" on public.memberships for select
  using (is_org_member(organization_id) or is_super_admin());
create policy "Owner manages memberships" on public.memberships for all
  using (is_org_owner(organization_id) or is_super_admin());
create policy "Self-insert first membership" on public.memberships for insert
  with check (user_id = auth.uid());

-- super_admins
create policy "Super admins view themselves" on public.super_admins for select
  using (is_super_admin());

-- credit_clients
create policy "Members manage clients" on public.credit_clients for all
  using (is_org_member(organization_id) or is_super_admin())
  with check (is_org_member(organization_id));

-- processes
create policy "Members manage processes" on public.processes for all
  using (is_org_member(organization_id) or is_super_admin())
  with check (is_org_member(organization_id));

-- proposals (via process)
create policy "Members manage proposals" on public.proposals for all
  using (exists (select 1 from public.processes p where p.id = proposals.process_id
                  and (is_org_member(p.organization_id) or is_super_admin())))
  with check (exists (select 1 from public.processes p where p.id = proposals.process_id
                       and is_org_member(p.organization_id)));

-- activity_log
create policy "View org activity" on public.activity_log for select
  using (is_org_member(organization_id) or is_super_admin());
create policy "Insert activity" on public.activity_log for insert
  with check (auth.uid() is not null);

-- support_access_log
create policy "Super admin views all support logs" on public.support_access_log for select
  using (is_super_admin());
create policy "Org members see their support logs" on public.support_access_log for select
  using (is_org_member(organization_id));
create policy "Super admin inserts support access" on public.support_access_log for insert
  with check (is_super_admin() and super_admin_id = auth.uid());

-- ---------- STORAGE BUCKET PARA PDFS ----------

insert into storage.buckets (id, name, public)
values ('proposal-pdfs', 'proposal-pdfs', false)
on conflict (id) do nothing;

-- PDFs guardados em path: <organization_id>/<process_id>/<filename>.pdf
create policy "Upload PDFs to own org folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proposal-pdfs'
    and is_org_member( (string_to_array(name, '/'))[1]::uuid )
  );

create policy "Read PDFs from own org folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'proposal-pdfs'
    and (is_org_member( (string_to_array(name, '/'))[1]::uuid ) or is_super_admin())
  );

create policy "Delete PDFs from own org folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'proposal-pdfs'
    and is_org_member( (string_to_array(name, '/'))[1]::uuid )
  );

-- ---------- TRIGGER updated_at ----------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger trg_credit_clients_updated before update on public.credit_clients
  for each row execute function public.set_updated_at();
create trigger trg_processes_updated before update on public.processes
  for each row execute function public.set_updated_at();
create trigger trg_proposals_updated before update on public.proposals
  for each row execute function public.set_updated_at();

-- ---------- SEED: organização demo da Klick ----------

insert into public.organizations (name, slug, branding_app_name, is_demo, branding_primary_color)
values ('Klick Demo', 'klick-demo', 'Comparador Klick (Demo)', true, '#D4AF37')
on conflict (slug) do nothing;
