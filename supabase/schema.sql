-- SAT Verbal CRM — схема базы для Supabase.
-- Запуск: Supabase Dashboard → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно: он ничего не удаляет.

-- Ученики -------------------------------------------------------------------
create table if not exists public.students (
  id              uuid primary key,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  contact         text not null default '',
  parent_contact  text not null default '',
  status          text not null default 'active'
                  check (status in ('lead', 'active', 'paused', 'finished')),
  start_date      date,
  exam_date       date,
  baseline_score  smallint check (baseline_score between 200 and 800),
  target_score    smallint check (target_score between 200 and 800),
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Уроки ---------------------------------------------------------------------
create table if not exists public.lessons (
  id            uuid primary key,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  date          date not null,
  duration_min  integer not null default 60 check (duration_min >= 0),
  topics        text[] not null default '{}',
  homework      text not null default '',
  notes         text not null default '',
  paid          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Пробные тесты -------------------------------------------------------------
create table if not exists public.scores (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  date        date not null,
  source      text not null default '',
  score       smallint not null check (score between 200 and 800),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists students_owner_idx on public.students (owner_id);
create index if not exists lessons_owner_idx on public.lessons (owner_id);
create index if not exists lessons_student_idx on public.lessons (student_id);
create index if not exists scores_owner_idx on public.scores (owner_id);
create index if not exists scores_student_idx on public.scores (student_id);

-- updated_at обновляется автоматически -------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();

drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons
  for each row execute function public.touch_updated_at();

drop trigger if exists scores_touch on public.scores;
create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();

-- Доступ: каждый пользователь видит и меняет только свои строки -------------
alter table public.students enable row level security;
alter table public.lessons  enable row level security;
alter table public.scores   enable row level security;

revoke all on public.students, public.lessons, public.scores from anon;
grant select, insert, update, delete on public.students, public.lessons, public.scores to authenticated;

drop policy if exists "students: own rows" on public.students;
create policy "students: own rows" on public.students
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Для уроков и тестов дополнительно проверяем, что ученик тоже свой.
drop policy if exists "lessons: own rows" on public.lessons;
create policy "lessons: own rows" on public.lessons
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "scores: own rows" on public.scores;
create policy "scores: own rows" on public.scores
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.owner_id = (select auth.uid())
    )
  );

-- Материалы (библиотека: тесты, сеты, словари, теория, видео) ----------------
create table if not exists public.materials (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  url         text not null default '',
  kind        text not null default 'other'
              check (kind in ('test', 'practice', 'vocab', 'theory', 'video', 'other')),
  skills      text[] not null default '{}',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists materials_owner_idx on public.materials (owner_id);

drop trigger if exists materials_touch on public.materials;
create trigger materials_touch before update on public.materials
  for each row execute function public.touch_updated_at();

alter table public.materials enable row level security;
revoke all on public.materials from anon;
grant select, insert, update, delete on public.materials to authenticated;

drop policy if exists "materials: own rows" on public.materials;
create policy "materials: own rows" on public.materials
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
