-- Migration 0009: grants required at evaluation time by RLS policies and column defaults.
-- Policy expressions and column defaults execute as the calling role, so the
-- helper functions they reference must be executable by authenticated.
grant execute on function actor_tenant() to authenticated;
grant execute on function actor_customer() to authenticated;
grant execute on function actor_is_staff() to authenticated;
grant execute on function next_code(text, regclass, int) to authenticated;
grant execute on function next_year_code(text, regclass) to authenticated;
;
