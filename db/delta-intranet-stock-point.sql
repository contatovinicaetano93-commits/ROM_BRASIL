-- Ponto de estoque atribuído ao colaborador (controlador P1/P2/P3).
-- null = vê todos (Sidney / almox / admin).
-- Idempotente. Roda no banco da intranet (ensureIntranetSchema).

alter table intranet_employees
  add column if not exists stock_point_code text;

alter table intranet_employees drop constraint if exists intranet_employees_stock_point_code_check;

alter table intranet_employees
  add constraint intranet_employees_stock_point_code_check
  check (
    stock_point_code is null
    or stock_point_code in ('piso_1', 'piso_2', 'piso_3', 'almox')
  );
