-- clariq-demo only. Standing user set for the demonstration site.
-- Each row becomes an app_users row on that person's first magic-link sign-in (migration 0010).
-- Admins mirror production. The two demo accounts are Gmail plus-addresses on the Clariq inbox,
-- so their magic links land where Clariq staff can open them on a phone during a walkthrough.
-- The demo customer account is attached to Waikato Dairy Services (CUS-0001), the largest seeded customer.
insert into user_invites (tenant_id, email, display_name, role_id, can_authorise, customer_id)
select t.id, v.email, v.display_name, r.id, v.can_authorise,
       case when v.customer_code is null then null else (select id from customers where code = v.customer_code) end
from tenants t
join (values
  ('gregf0202@gmail.com',        'Greg Ferguson',  'ADMIN',     true,  null),
  ('jnf1306@gmail.com',          'Jay Ferguson',   'ADMIN',     true,  null),
  ('info@clariq.nz',             'Jay Ferguson (info)', 'ADMIN', true,  null),
  ('clariqnz@gmail.com',         'Clariq Admin',   'ADMIN',     true,  null),
  ('clariqnz+staff@gmail.com',   'Demo Staff',     'WAREHOUSE', false, null),
  ('clariqnz+customer@gmail.com','Demo Customer',  'CUSTOMER',  false, 'CUS-0001')
) as v(email, display_name, role_code, can_authorise, customer_code) on true
join roles r on r.code = v.role_code
on conflict (tenant_id, email) do nothing;
