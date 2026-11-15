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

-- ============================================================================
-- Сеты вопросов и задания ученикам
-- ============================================================================

-- Сеты: вопросы (без ответов) + ключ. Читает и меняет только владелец;
-- ученики получают вопросы только через get_assignment() по токену задания.
create table if not exists public.question_sets (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  subtitle    text not null default '',
  skills      text[] not null default '{}',
  -- [{n, difficulty, stimulus, stem, choices: [{letter, html}]}]
  questions   jsonb not null check (jsonb_typeof(questions) = 'array'),
  -- ключ ответов (буквы A–D по порядку вопросов) — ученику не отдаётся до сдачи
  answers     text[] not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (jsonb_array_length(questions) = cardinality(answers))
);

create index if not exists question_sets_owner_idx on public.question_sets (owner_id);

drop trigger if exists question_sets_touch on public.question_sets;
create trigger question_sets_touch before update on public.question_sets
  for each row execute function public.touch_updated_at();

-- Материал может ссылаться на сет (без внешнего ключа: материалы и сеты загружаются независимо).
alter table public.materials add column if not exists set_id uuid;

-- Задания: сет, выданный ученику. Ученик открывает его по секретному токену без входа.
create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  set_id         uuid not null references public.question_sets (id) on delete cascade,
  token          text not null unique
                 default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  due_date       date,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  submitted_at   timestamptz,
  -- сумма времени по вопросам (сек), которое насчитал браузер ученика
  duration_sec   integer,
  correct_count  integer,
  total_count    integer,
  -- [{n, answer, correct, is_correct, time_sec}]
  results        jsonb
);

create index if not exists assignments_owner_idx on public.assignments (owner_id);
create index if not exists assignments_student_idx on public.assignments (student_id);

alter table public.question_sets enable row level security;
alter table public.assignments   enable row level security;

revoke all on public.question_sets, public.assignments from anon;
grant select, insert, update, delete on public.question_sets, public.assignments to authenticated;

drop policy if exists "question_sets: own rows" on public.question_sets;
create policy "question_sets: own rows" on public.question_sets
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "assignments: own rows" on public.assignments;
create policy "assignments: own rows" on public.assignments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.students s where s.id = student_id and s.owner_id = (select auth.uid()))
    and exists (select 1 from public.question_sets q where q.id = set_id and q.owner_id = (select auth.uid()))
  );

-- Функции для страницы ученика: доступны без входа, работают только по токену ----

-- Вопросы задания без ключа; после сдачи — ещё и результаты с правильными ответами.
create or replace function public.get_assignment(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  s public.question_sets;
  student_name text;
begin
  select * into a from public.assignments where token = p_token;
  if not found then
    return null;
  end if;
  select * into s from public.question_sets where id = a.set_id;
  select split_part(trim(name), ' ', 1) into student_name from public.students where id = a.student_id;

  return jsonb_build_object(
    'title', s.title,
    'student', student_name,
    'due_date', a.due_date,
    'questions', (
      select coalesce(jsonb_agg(q - 'difficulty' order by ord), '[]'::jsonb)
      from jsonb_array_elements(s.questions) with ordinality as t(q, ord)
    ),
    'started_at', a.started_at,
    'submitted_at', a.submitted_at,
    'duration_sec', a.duration_sec,
    'correct_count', a.correct_count,
    'total_count', a.total_count,
    'results', a.results
  );
end;
$$;

-- Отмечает начало решения (один раз).
create or replace function public.start_assignment(p_token text)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.assignments
     set started_at = coalesce(started_at, now())
   where token = p_token and submitted_at is null
  returning started_at;
$$;

-- Принимает ответы и время по вопросам и проверяет их по ключу на сервере.
-- Повторная сдача не перезаписывает результат: возвращается уже сохранённый.
create or replace function public.submit_assignment(p_token text, p_answers text[], p_times integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  answer_key text[];
  total integer;
  ans text;
  t integer;
  ok boolean;
  correct integer := 0;
  spent integer := 0;
  res jsonb := '[]'::jsonb;
begin
  select * into a from public.assignments where token = p_token for update;
  if not found then
    raise exception 'assignment not found';
  end if;

  if a.submitted_at is null then
    select q.answers into answer_key from public.question_sets q where q.id = a.set_id;
    total := coalesce(cardinality(answer_key), 0);

    for i in 1..total loop
      ans := upper(nullif(trim(coalesce(p_answers[i], '')), ''));
      if ans is not null and ans not in ('A', 'B', 'C', 'D') then
        ans := null;
      end if;
      t := greatest(0, least(coalesce(p_times[i], 0), 86400));
      ok := coalesce(ans = answer_key[i], false);
      if ok then
        correct := correct + 1;
      end if;
      spent := spent + t;
      res := res || jsonb_build_array(jsonb_build_object(
        'n', i, 'answer', ans, 'correct', answer_key[i], 'is_correct', ok, 'time_sec', t
      ));
    end loop;

    update public.assignments
       set started_at    = coalesce(started_at, now()),
           submitted_at  = now(),
           duration_sec  = spent,
           correct_count = correct,
           total_count   = total,
           results       = res
     where id = a.id
    returning * into a;
  end if;

  return jsonb_build_object(
    'submitted_at', a.submitted_at,
    'duration_sec', a.duration_sec,
    'correct_count', a.correct_count,
    'total_count', a.total_count,
    'results', a.results
  );
end;
$$;

revoke all on function public.get_assignment(text) from public;
revoke all on function public.start_assignment(text) from public;
revoke all on function public.submit_assignment(text, text[], integer[]) from public;
grant execute on function public.get_assignment(text) to anon, authenticated;
grant execute on function public.start_assignment(text) to anon, authenticated;
grant execute on function public.submit_assignment(text, text[], integer[]) to anon, authenticated;
