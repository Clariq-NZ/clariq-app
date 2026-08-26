-- Per-customer names for the four location levels. Keys are fixed
-- (level1..level4 map to faculty, building, room, cabinet columns); labels vary by industry.
alter table customers add column if not exists location_labels jsonb not null default
  '{"preset":"UNIVERSITY","faculty":"Faculty","building":"Building","room":"Room / Lab","cabinet":"Cabinet"}'::jsonb;;
