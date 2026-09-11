-- 0033: enum values only. New values cannot be referenced in the same
-- transaction that adds them, so the rules live in 0034.
alter type public.event_type add value if not exists 'RECEIVED' after 'DELIVERED';
alter type public.event_type add value if not exists 'EMPTIED' after 'RECEIVED';
