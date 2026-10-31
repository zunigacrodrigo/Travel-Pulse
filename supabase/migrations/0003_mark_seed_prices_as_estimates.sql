-- Los precios del dataset local se calculan desde una tabla sintética; no provienen
-- de una cotización de Amadeus. Reducir su frescura y fiabilidad para el motor.
begin;

insert into public.sources (id, name, license, max_age_days, reliability, url)
values (
  'estimacion-tp',
  'Estimación experimental Travel Pulse',
  'Dataset sintético interno',
  1,
  0.25,
  null
)
on conflict (id) do update set
  name = excluded.name,
  license = excluded.license,
  max_age_days = excluded.max_age_days,
  reliability = excluded.reliability,
  url = excluded.url;

update public.price_snapshots
set flight_source_id = 'estimacion-tp',
    usual_source_id = 'estimacion-tp';

update public.destination_trends
set price_source_id = 'estimacion-tp';

commit;
