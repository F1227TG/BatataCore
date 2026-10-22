import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regressões estáticas: testes de comportamento no banco devem ser executados
// separadamente contra um Supabase de desenvolvimento após aplicar o SQL.
const sql = readFileSync(new URL('../database/setup.sql', import.meta.url), 'utf8');
const block = (start, end) => {
  const begin = sql.indexOf(start);
  const finish = sql.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `Bloco SQL ausente: ${start}`);
  return sql.slice(begin, finish);
};

const admin = block('create or replace function private.is_admin()', 'create or replace function private.is_staff()');
assert.match(admin, /p\.role\s*=\s*'admin'/, 'Somente administradores são admins.');
assert.doesNotMatch(admin, /'organizador'/, 'Organizadores não são administradores.');

const staff = block('create or replace function private.is_staff()', 'create or replace function private.touch_updated_at()');
assert.match(staff, /'admin'\s*,\s*'organizador'/, 'Operações de staff preservam os dois papéis.');

const protectRole = block('create or replace function private.protect_profile_role()', 'create or replace function private.log_admin_action()');
assert.match(protectRole, /old\.role is distinct from new\.role[\s\S]*not private\.is_admin\(\)/,
  'Alterar o papel exige administrador.');
assert.match(sql, /create trigger protect_profile_role_trigger[\s\S]*?execute function private\.protect_profile_role\(\)/);

const profiles = block('-- Profiles', '-- Eventos');
assert.match(profiles, /profiles_update_own[\s\S]*?with check \(\(select auth\.uid\(\)\) = id or private\.is_admin\(\)\)/);

const checkin = block('create or replace function public.realizar_checkin(', 'create or replace function public.gerar_certificado(');
assert.match(checkin, /if not private\.is_staff\(\) then/, 'Somente staff faz check-in.');
assert.match(checkin, /for update;/, 'Bloqueio de linha necessário para impedir concorrência.');
assert.match(checkin, /if v_row\.status <> 'confirmado' then\s*raise exception/,
  'Inscrições não confirmadas devem ser rejeitadas.');
assert.match(checkin, /if v_row\.checked_in_at is not null then\s*raise exception/,
  'Check-in duplicado deve ser rejeitado.');
assert.match(checkin, /set checked_in_at = now\(\)/, 'Check-in não pode alterar o status da inscrição.');
assert.doesNotMatch(checkin, /set checked_in_at = now\(\),\s*status\s*=/,
  'Check-in não pode promover inscritos da lista de espera.');
assert.match(sql, /grant execute on function public\.realizar_checkin\(text\) to authenticated;/);
console.log('Regressões estáticas de permissões e check-in: OK.');
