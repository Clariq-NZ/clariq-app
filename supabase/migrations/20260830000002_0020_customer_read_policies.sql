-- Migration 0020: customer users read what their own dashboard and report need.
-- Until now container_events, products, chemical_batches and container_types
-- were staff-only, so a customer sign-in showed empty counts and no product
-- names. Customers see events tagged with their customer_id only; master
-- data reads are tenant-wide because product and type names are not secret
-- and the container rows themselves are already scoped to the customer.

create policy events_read_customer on container_events for select
  using (customer_id = actor_customer());

create policy products_read_customer on products for select
  using (tenant_id = actor_tenant() and actor_customer() is not null);

create policy chemical_batches_read_customer on chemical_batches for select
  using (tenant_id = actor_tenant() and actor_customer() is not null);

create policy container_types_read_customer on container_types for select
  using (tenant_id = actor_tenant() and actor_customer() is not null);
