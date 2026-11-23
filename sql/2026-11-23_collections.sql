-- Lumen remote collections (1.7+): themed sets of poems/passages that arrive without an app update.
-- First use: Public Domain Day 2027 (works of authors who died in 1956 become free on 1 Jan 2027).
-- The app reads both tables with the anon key; writes stay closed to anon (no insert/update policy).
begin;

create table if not exists public.collections (
  id          text primary key,
  langs       text[]      not null,              -- app languages that see it
  titles      jsonb       not null,              -- {"tr": "...", "de": "...", "en": "..."}
  subtitles   jsonb       not null default '{}', -- one line under the title
  teasers     jsonb       not null default '{}', -- shown while the pieces are not out yet
  promo_from  timestamptz not null,              -- banner visible from (teaser before starts_at)
  starts_at   timestamptz not null,              -- pieces expected from
  ends_at     timestamptz,                       -- banner hidden after (pieces stay in the collection screen)
  free_until  timestamptz,                       -- pieces readable without Premium until
  debug_only  boolean     not null default false,-- only DEBUG builds show it (testing)
  sort        int         not null default 0
);

create table if not exists public.collection_pieces (
  id              text primary key,
  collection_id   text        not null references public.collections(id) on delete cascade,
  lang            text        not null,
  type            text        not null check (type in ('poem', 'passage')),
  title           text        not null,
  author          text        not null,
  text            text        not null,
  theme           text        not null default 'life',
  source          text,
  work            text,
  blocked_regions text[]      not null default '{}', -- App Store storefronts (ISO alpha-3, e.g. MEX, USA) that must not see it
  position        int         not null default 0,
  publish_at      timestamptz not null default now() -- anon cannot read a row before this moment
);

create index if not exists collection_pieces_coll_lang on public.collection_pieces (collection_id, lang, position);

alter table public.collections enable row level security;
alter table public.collection_pieces enable row level security;

drop policy if exists "anon reads collections" on public.collections;
create policy "anon reads collections" on public.collections for select to anon, authenticated using (true);

drop policy if exists "anon reads published pieces" on public.collection_pieces;
create policy "anon reads published pieces" on public.collection_pieces for select to anon, authenticated using (publish_at <= now());

grant select on public.collections, public.collection_pieces to anon, authenticated;

-- Public Domain Day 2027. Banner from 18 Dec (same day the App Store event goes up), pieces on 1 Jan,
-- free for everyone through January. Pieces are added on 1 Jan, never before.
insert into public.collections (id, langs, titles, subtitles, teasers, promo_from, starts_at, ends_at, free_until, sort)
values (
  'pd2027',
  array['tr', 'de', 'en'],
  '{"tr": "Kamu Malı Günü 2027",
    "de": "Tag der Gemeinfreiheit 2027",
    "en": "Public Domain Day 2027"}',
  '{"tr": "Cahit Sıtkı Tarancı ve Reşat Nuri Güntekin artık herkesin",
    "de": "Bertolt Brecht und Gottfried Benn gehören jetzt allen",
    "en": "Walter de la Mare and A. A. Milne now belong to everyone"}',
  '{"tr": "1 Ocak''ta telifleri sona eriyor. Şiirler ve Çalıkuşu''ndan bölümler o sabah burada, Ocak boyunca herkese ücretsiz.",
    "de": "Am 1. Januar endet der Urheberschutz. Die Gedichte erscheinen an diesem Morgen hier, im Januar für alle kostenlos.",
    "en": "Their copyright ends on 1 January. The poems arrive here that morning, free for everyone all January."}',
  '2026-12-18 00:00+03',
  '2027-01-01 00:00+03',
  '2027-02-01 00:00+03',
  '2027-02-01 00:00+03',
  10
)
on conflict (id) do update set
  langs = excluded.langs, titles = excluded.titles, subtitles = excluded.subtitles, teasers = excluded.teasers,
  promo_from = excluded.promo_from, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
  free_until = excluded.free_until, sort = excluded.sort;

-- Test collection, DEBUG builds only: two poems already in the bundled library.
insert into public.collections (id, langs, titles, subtitles, teasers, promo_from, starts_at, ends_at, free_until, debug_only, sort)
values ('devtest', array['tr'], '{"tr": "Test Koleksiyonu"}', '{"tr": "Yalnız geliştirme derlemesinde görünür"}', '{}',
        '2026-01-01 00:00+03', '2026-01-01 00:00+03', null, '2030-01-01 00:00+03', true, 99)
on conflict (id) do nothing;

insert into public.collection_pieces (id, collection_id, lang, type, title, author, text, theme, work, position)
values
  ('devtest_1', 'devtest', 'tr', 'poem', 'Anlatamıyorum', 'Orhan Veli Kanık',
   E'Ağlasam sesimi duyar mısınız,\nMısralarımda;\nDokunabilir misiniz,\nGözyaşlarıma, ellerinizle?\n\nBilmezdim şarkıların bu kadar güzel,\nKelimelerinse kifayetsiz olduğunu\nBu derde düşmeden önce.\n\nBir yer var, biliyorum;\nHer şeyi söylemek mümkün;\nEpice yaklaşmışım, duyuyorum;\n\nAnlatamıyorum.', 'sorrow', 'Vazife', 1),
  ('devtest_2', 'devtest', 'tr', 'poem', 'Gelecek Saat', 'Test', E'Bu satır yarın açılır.', 'life', null, 2)
on conflict (id) do nothing;
update public.collection_pieces set publish_at = '2030-01-01 00:00+03' where id = 'devtest_2';

commit;

select c.id, c.debug_only, (select count(*) from public.collection_pieces p where p.collection_id = c.id) as pieces
from public.collections c order by c.sort;
