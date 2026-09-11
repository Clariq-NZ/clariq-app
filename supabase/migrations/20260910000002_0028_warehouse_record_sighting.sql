-- 0028: migration 0012 enabled record_sighting for a role code spelled 'WAREHOUSE_OPERATOR';
-- the role is 'WAREHOUSE', so warehouse operators could neither start an audit session nor
-- record a sighting. Found by the 10 Sep 2026 end-to-end test.
-- Applied to clariq-demo 10 Sep 2026; production pending.
update roles set record_sighting = true where code = 'WAREHOUSE';
