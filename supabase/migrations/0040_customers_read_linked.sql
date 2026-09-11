-- 0040: a linked end-user organisation may read the supplier customer
-- records that point at it. Needed so its users can resolve their own
-- customer lens (name, sites, containers by current_customer_id).
create policy customers_read_linked on public.customers
  for select to authenticated
  using (linked_tenant_id = public.actor_tenant());
