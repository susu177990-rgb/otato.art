-- Remove retired default packages. Keep only the CNY 100 package.
delete from public.credit_packages
where id in ('starter', 'creator', 'pro');
