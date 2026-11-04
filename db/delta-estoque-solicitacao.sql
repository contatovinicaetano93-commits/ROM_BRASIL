-- Solicitação de produtos (retirada nos pontos P1/P2/P3).
-- ROM = pedido/retirada física; Avec = baixa contábil (só leitura no painel).
-- Idempotente. Só Brasil no V1 (registrado em migrations.json).

create table if not exists stock_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references stock_products (id) on delete restrict,
  location_id uuid not null references stock_locations (id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_label text,
  note text,
  status text not null default 'solicitado'
    check (status in (
      'solicitado',
      'em_separacao',
      'pronto',
      'retirado',
      'baixado_avec',
      'cancelado'
    )),
  requested_by_employee_id uuid,
  requested_by_name text not null,
  professional_name text,
  prepared_by_name text,
  delivered_by_name text,
  avec_bailed_at timestamptz,
  avec_ref text,
  requested_at timestamptz not null default now(),
  prepared_at timestamptz,
  ready_at timestamptz,
  withdrawn_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists stock_withdrawal_requests_status_idx
  on stock_withdrawal_requests (status, requested_at desc);

create index if not exists stock_withdrawal_requests_location_idx
  on stock_withdrawal_requests (location_id, status, requested_at desc);

create index if not exists stock_withdrawal_requests_requester_idx
  on stock_withdrawal_requests (requested_by_employee_id, requested_at desc);

create index if not exists stock_withdrawal_requests_product_idx
  on stock_withdrawal_requests (product_id, requested_at desc);
