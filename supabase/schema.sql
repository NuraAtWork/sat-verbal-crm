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

-- ============================================================================
-- Пробные тесты (формат Bluebook): модули с лимитом времени, объяснения, оценка балла
-- ----------------------------------------------------------------------------
-- Тест — это сет с kind = 'test'. Вопросы идут подряд по модулям (у вопроса есть поле module),
-- modules = [{title, count, minutes}]. Ключ (answers) и объяснения (explanations) ученику не отдаются
-- до сдачи. Ученик проходит модули по очереди: start_test_module → submit_test_module; вернуться в
-- закрытый модуль нельзя. Время модуля считает сервер (module_starts); если модуль сдан позже лимита
-- (+2 мин запаса), ответы принимаются, но модуль помечается late — репетитор это видит.
-- Этот блок ПЕРЕОПРЕДЕЛЯЕТ get_assignment и submit_assignment из блока выше (create or replace).
-- ============================================================================

alter table public.question_sets add column if not exists kind text not null default 'set';
alter table public.question_sets drop constraint if exists question_sets_kind_check;
alter table public.question_sets add constraint question_sets_kind_check check (kind in ('set', 'test'));
-- [{title, count, minutes}] — только у тестов
alter table public.question_sets add column if not exists modules jsonb;
-- объяснения к ответам по порядку вопросов ('' — нет объяснения) — ученику только после сдачи
alter table public.question_sets add column if not exists explanations text[];

-- начало каждого модуля по часам сервера
alter table public.assignments add column if not exists module_starts timestamptz[] not null default '{}';
-- закрытые модули: [{answers: [..], times: [..], submitted_at, elapsed_sec, late}]
alter table public.assignments add column if not exists module_answers jsonb not null default '[]'::jsonb;
-- оценка балла Reading & Writing 200–800 (грубая таблица перевода, не официальная шкала)
alter table public.assignments add column if not exists score_estimate smallint;

-- Грубый перевод сырого балла в шкалу 200–800 (по доле верных; кусочно-линейно, шаг 10).
create or replace function public.estimate_rw_score(p_correct integer, p_total integer)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  xs numeric[] := array[0, 0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 0.95, 1.0];
  ys numeric[] := array[200, 240, 340, 440, 520, 600, 690, 760, 800];
  f numeric;
begin
  if p_total is null or p_total <= 0 then
    return null;
  end if;
  f := least(1, greatest(0, p_correct::numeric / p_total));
  for i in 2..cardinality(xs) loop
    if f <= xs[i] then
      return (round((ys[i - 1] + (ys[i] - ys[i - 1]) * (f - xs[i - 1]) / (xs[i] - xs[i - 1])) / 10) * 10)::smallint;
    end if;
  end loop;
  return 800;
end;
$$;

-- Вопросы задания без ключа (и без навыка/сложности); для теста — модули и время по серверу;
-- после сдачи — результаты, оценка балла и объяснения.
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
    'kind', s.kind,
    'modules', s.modules,
    'questions', (
      select coalesce(jsonb_agg(q - 'difficulty' - 'skill' order by ord), '[]'::jsonb)
      from jsonb_array_elements(s.questions) with ordinality as t(q, ord)
    ),
    'started_at', a.started_at,
    'submitted_at', a.submitted_at,
    'duration_sec', a.duration_sec,
    'correct_count', a.correct_count,
    'total_count', a.total_count,
    'results', a.results,
    'module_starts', to_jsonb(a.module_starts),
    'modules_done', jsonb_array_length(a.module_answers),
    'server_now', now(),
    'score_estimate', a.score_estimate,
    'explanations', case when a.submitted_at is not null then to_jsonb(s.explanations) end
  );
end;
$$;

-- Обычная сдача — только для сетов; тесты сдаются по модулям (submit_test_module).
create or replace function public.submit_assignment(p_token text, p_answers text[], p_times integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  answer_key text[];
  set_kind text;
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
    select q.answers, q.kind into answer_key, set_kind from public.question_sets q where q.id = a.set_id;
    if set_kind = 'test' then
      raise exception 'tests are submitted by module';
    end if;
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

-- Открывает модуль p_module (с 1) теста: фиксирует время начала по серверу (один раз).
-- Открыть можно только следующий по порядку модуль.
create or replace function public.start_test_module(p_token text, p_module integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  s public.question_sets;
  done integer;
begin
  select * into a from public.assignments where token = p_token for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  select * into s from public.question_sets where id = a.set_id;
  if s.kind <> 'test' then
    raise exception 'not a test';
  end if;

  if a.submitted_at is null then
    done := jsonb_array_length(a.module_answers);
    if p_module <> done + 1 or p_module > jsonb_array_length(s.modules) then
      raise exception 'module % is not available', p_module;
    end if;
    if coalesce(cardinality(a.module_starts), 0) < p_module then
      update public.assignments
         set module_starts = module_starts || now(),
             started_at    = coalesce(started_at, now())
       where id = a.id
      returning * into a;
    end if;
  end if;

  return jsonb_build_object(
    'module_starts', to_jsonb(a.module_starts),
    'modules_done', jsonb_array_length(a.module_answers),
    'server_now', now()
  );
end;
$$;

-- Закрывает модуль p_module: сохраняет ответы и время по вопросам модуля. Повторный вызов для уже
-- закрытого модуля ничего не меняет. После последнего модуля тест проверяется по ключу.
create or replace function public.submit_test_module(
  p_token text, p_module integer, p_answers text[], p_times integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments;
  s public.question_sets;
  done integer;
  n_modules integer;
  cnt integer;
  lim integer;
  elapsed integer;
  ans_arr jsonb := '[]'::jsonb;
  time_arr jsonb := '[]'::jsonb;
  ans text;
  t integer;
  ok boolean;
  offs integer := 0;
  rec jsonb;
  correct integer := 0;
  spent integer := 0;
  res jsonb := '[]'::jsonb;
begin
  select * into a from public.assignments where token = p_token for update;
  if not found then
    raise exception 'assignment not found';
  end if;
  select * into s from public.question_sets where id = a.set_id;
  if s.kind <> 'test' then
    raise exception 'not a test';
  end if;
  n_modules := jsonb_array_length(s.modules);
  done := jsonb_array_length(a.module_answers);

  if a.submitted_at is null and p_module = done + 1 and p_module <= n_modules then
    if coalesce(cardinality(a.module_starts), 0) < p_module then
      raise exception 'module % was not started', p_module;
    end if;
    cnt := (s.modules -> (p_module - 1) ->> 'count')::integer;
    lim := (s.modules -> (p_module - 1) ->> 'minutes')::integer;
    elapsed := extract(epoch from now() - a.module_starts[p_module])::integer;

    for i in 1..cnt loop
      ans := upper(nullif(trim(coalesce(p_answers[i], '')), ''));
      if ans is not null and ans not in ('A', 'B', 'C', 'D') then
        ans := null;
      end if;
      t := greatest(0, least(coalesce(p_times[i], 0), 86400));
      ans_arr := ans_arr || jsonb_build_array(ans);
      time_arr := time_arr || jsonb_build_array(t);
    end loop;

    update public.assignments
       set module_answers = module_answers || jsonb_build_array(jsonb_build_object(
             'answers', ans_arr, 'times', time_arr, 'submitted_at', now(),
             'elapsed_sec', elapsed, 'late', elapsed > lim * 60 + 120
           ))
     where id = a.id
    returning * into a;
    done := done + 1;

    -- последний модуль: проверка всего теста
    if done = n_modules then
      for m in 1..n_modules loop
        rec := a.module_answers -> (m - 1);
        cnt := (s.modules -> (m - 1) ->> 'count')::integer;
        for i in 1..cnt loop
          ans := rec -> 'answers' ->> (i - 1);
          t := coalesce((rec -> 'times' ->> (i - 1))::integer, 0);
          ok := coalesce(ans = s.answers[offs + i], false);
          if ok then
            correct := correct + 1;
          end if;
          spent := spent + t;
          res := res || jsonb_build_array(jsonb_build_object(
            'n', offs + i, 'module', m, 'answer', ans, 'correct', s.answers[offs + i],
            'is_correct', ok, 'time_sec', t
          ));
        end loop;
        offs := offs + cnt;
      end loop;

      update public.assignments
         set submitted_at   = now(),
             duration_sec   = spent,
             correct_count  = correct,
             total_count    = offs,
             results        = res,
             score_estimate = public.estimate_rw_score(correct, offs)
       where id = a.id
      returning * into a;
    end if;
  end if;

  return jsonb_build_object(
    'modules_done', jsonb_array_length(a.module_answers),
    'submitted_at', a.submitted_at,
    'duration_sec', a.duration_sec,
    'correct_count', a.correct_count,
    'total_count', a.total_count,
    'results', a.results,
    'score_estimate', a.score_estimate,
    'explanations', case when a.submitted_at is not null then to_jsonb(s.explanations) end
  );
end;
$$;

revoke all on function public.estimate_rw_score(integer, integer) from public;
revoke all on function public.start_test_module(text, integer) from public;
revoke all on function public.submit_test_module(text, integer, text[], integer[]) from public;
grant execute on function public.start_test_module(text, integer) to anon, authenticated;
grant execute on function public.submit_test_module(text, integer, text[], integer[]) to anon, authenticated;

-- ============================================================================
-- Тренер словаря (Words in Context)
-- ----------------------------------------------------------------------------
-- vocab_words — словарь репетитора: слово, определение, перевод, контексты с пропуском.
-- vocab_enrollments — «подписка» ученика на тренер: постоянная ссылка #/vocab/<token> без входа.
-- vocab_progress — состояние слова у ученика: ступень (1–7) и дата следующего показа.
-- vocab_reviews — журнал ответов (для статистики репетитора и будущей настройки интервалов).
-- Ученик работает только через vocab_session / vocab_review по токену. Это тренировка, а не
-- контроль, поэтому слова отдаются вместе с ответами, а проверка идёт в браузере; расписание
-- повторений считает сервер.
-- Ступени: 1 — слово только что показано (упражнение в той же сессии); верный ответ поднимает
-- на ступень и откладывает показ на 1 / 3 / 7 / 16 / 35 / 70 дней (ступени 2–7); ошибка
-- опускает (до 1, а с 4-й и выше — на две ступени) и возвращает слово в текущую сессию.
-- ============================================================================

create table if not exists public.vocab_words (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word         text not null,
  -- часть речи: noun / verb / adj / adv или пусто
  pos          text not null default '',
  -- простое определение на английском
  definition   text not null,
  -- перевод на русский (для первого знакомства)
  translation  text not null default '',
  connotation  text not null default ''
               check (connotation in ('', 'positive', 'negative', 'neutral')),
  -- [{text: 'предложение с ____', answer?: 'форма слова', distractors: ['a','b','c'], note?: 'почему'}]
  contexts     jsonb not null default '[]'::jsonb check (jsonb_typeof(contexts) = 'array'),
  -- слова, с которыми путают
  confusables  text[] not null default '{}',
  -- название колоды ('' — общая)
  deck         text not null default '',
  -- порядок введения новых слов (меньше — раньше)
  rank         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vocab_words_owner_idx on public.vocab_words (owner_id);

drop trigger if exists vocab_words_touch on public.vocab_words;
create trigger vocab_words_touch before update on public.vocab_words
  for each row execute function public.touch_updated_at();

create table if not exists public.vocab_enrollments (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_id   uuid not null unique references public.students (id) on delete cascade,
  token        text not null unique
               default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  new_per_day  integer not null default 10 check (new_per_day between 0 and 50),
  -- колоды ученика; пусто — все слова репетитора
  decks        text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists vocab_enrollments_owner_idx on public.vocab_enrollments (owner_id);

create table if not exists public.vocab_progress (
  student_id        uuid not null references public.students (id) on delete cascade,
  word_id           uuid not null references public.vocab_words (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  stage             smallint not null default 1 check (stage between 1 and 7),
  due_at            timestamptz not null default now(),
  reps              integer not null default 0,
  lapses            integer not null default 0,
  introduced_at     timestamptz not null default now(),
  last_reviewed_at  timestamptz,
  primary key (student_id, word_id)
);

create index if not exists vocab_progress_due_idx on public.vocab_progress (student_id, due_at);
create index if not exists vocab_progress_owner_idx on public.vocab_progress (owner_id);

create table if not exists public.vocab_reviews (
  id            bigint generated always as identity primary key,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  word_id       uuid not null references public.vocab_words (id) on delete cascade,
  -- intro — показ карточки нового слова; meaning / cloze / reverse — упражнения
  exercise      text not null,
  correct       boolean not null,
  -- время на ответ, мс
  ms            integer not null default 0,
  stage_before  smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists vocab_reviews_student_idx on public.vocab_reviews (student_id, created_at);
create index if not exists vocab_reviews_owner_idx on public.vocab_reviews (owner_id);

alter table public.vocab_words       enable row level security;
alter table public.vocab_enrollments enable row level security;
alter table public.vocab_progress    enable row level security;
alter table public.vocab_reviews     enable row level security;

revoke all on public.vocab_words, public.vocab_enrollments, public.vocab_progress, public.vocab_reviews from anon;
grant select, insert, update, delete on public.vocab_words, public.vocab_enrollments to authenticated;
-- прогресс и журнал пишет только сервер (vocab_review); репетитор читает и может сбросить
revoke all on public.vocab_progress, public.vocab_reviews from authenticated;
grant select, delete on public.vocab_progress, public.vocab_reviews to authenticated;

drop policy if exists "vocab_words: own rows" on public.vocab_words;
create policy "vocab_words: own rows" on public.vocab_words
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "vocab_enrollments: own rows" on public.vocab_enrollments;
create policy "vocab_enrollments: own rows" on public.vocab_enrollments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.students s where s.id = student_id and s.owner_id = (select auth.uid()))
  );

drop policy if exists "vocab_progress: own rows" on public.vocab_progress;
create policy "vocab_progress: own rows" on public.vocab_progress
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "vocab_reviews: own rows" on public.vocab_reviews;
create policy "vocab_reviews: own rows" on public.vocab_reviews
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Сессия ученика: слова к повторению, новые слова на сегодня и запас слов для неверных вариантов.
-- p_day_start — начало «сегодня» по часам ученика (для лимита новых слов и серии дней).
create or replace function public.vocab_session(p_token text, p_day_start timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.vocab_enrollments;
  v_day timestamptz;
  v_student text;
  v_introduced integer;
  v_new_left integer;
  v_total integer;
  v_started integer;
  v_known integer;
  v_today integer;
  v_streak integer;
  v_due jsonb;
  v_fresh jsonb;
  v_pool jsonb;
begin
  select * into e from public.vocab_enrollments where token = p_token;
  if not found then
    return null;
  end if;
  -- начало дня не раньше чем сутки назад и не в будущем
  v_day := least(now(), greatest(coalesce(p_day_start, now() - interval '24 hours'), now() - interval '24 hours'));
  select split_part(trim(name), ' ', 1) into v_student from public.students where id = e.student_id;

  select count(*) into v_introduced
    from public.vocab_progress p
   where p.student_id = e.student_id and p.introduced_at >= v_day;
  v_new_left := greatest(0, e.new_per_day - v_introduced);

  select coalesce(jsonb_agg(x.j order by x.due_at), '[]'::jsonb) into v_due
    from (
      select (to_jsonb(w) - 'owner_id' - 'created_at' - 'updated_at' - 'rank')
             || jsonb_build_object('stage', p.stage, 'reps', p.reps) as j,
             p.due_at
        from public.vocab_progress p
        join public.vocab_words w on w.id = p.word_id
       where p.student_id = e.student_id and p.due_at <= now()
       order by p.due_at
       limit 80
    ) x;

  select coalesce(jsonb_agg(x.j order by x.rank, x.word), '[]'::jsonb) into v_fresh
    from (
      select to_jsonb(w) - 'owner_id' - 'created_at' - 'updated_at' - 'rank' as j, w.rank, w.word
        from public.vocab_words w
       where w.owner_id = e.owner_id
         and (cardinality(e.decks) = 0 or w.deck = any (e.decks))
         and not exists (
           select 1 from public.vocab_progress p where p.student_id = e.student_id and p.word_id = w.id
         )
       order by w.rank, w.word
       limit v_new_left
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('word', x.word, 'pos', x.pos, 'definition', x.definition)), '[]'::jsonb)
    into v_pool
    from (
      select w.word, w.pos, w.definition
        from public.vocab_words w
       where w.owner_id = e.owner_id
       order by random()
       limit 40
    ) x;

  select count(*) into v_total
    from public.vocab_words w
   where w.owner_id = e.owner_id and (cardinality(e.decks) = 0 or w.deck = any (e.decks));
  select count(*), count(*) filter (where p.stage >= 5) into v_started, v_known
    from public.vocab_progress p where p.student_id = e.student_id;
  select count(*) into v_today
    from public.vocab_reviews r
   where r.student_id = e.student_id and r.created_at >= v_day and r.exercise <> 'intro';

  -- серия: сколько дней подряд (заканчивая сегодня или вчера) были ответы
  with days as (
    select distinct floor(extract(epoch from (r.created_at - v_day)) / 86400)::integer as d
      from public.vocab_reviews r
     where r.student_id = e.student_id and r.created_at > v_day - interval '200 days'
  ), runs as (
    select d, d + row_number() over (order by d desc) as grp from days
  )
  select count(*) into v_streak
    from runs
   where grp = (select grp from runs order by d desc limit 1)
     and (select max(d) from days) >= -1;

  return jsonb_build_object(
    'student', v_student,
    'new_per_day', e.new_per_day,
    'due', v_due,
    'fresh', v_fresh,
    'pool', v_pool,
    'stats', jsonb_build_object(
      'total', v_total, 'started', v_started, 'known', v_known,
      'reviews_today', v_today, 'streak', v_streak
    )
  );
end;
$$;

-- Ответ ученика на слово. Первый вызов для слова (или exercise = 'intro') заводит прогресс на
-- ступени 1; дальше верный ответ поднимает ступень и откладывает показ, ошибка — опускает.
create or replace function public.vocab_review(
  p_token text, p_word_id uuid, p_exercise text, p_correct boolean, p_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.vocab_enrollments;
  p public.vocab_progress;
  v_days integer[] := array[0, 1, 3, 7, 16, 35, 70];
  v_exercise text;
  v_before smallint;
  v_stage smallint;
  v_due timestamptz;
  v_new boolean := false;
begin
  select * into e from public.vocab_enrollments where token = p_token;
  if not found then
    raise exception 'enrollment not found';
  end if;
  if not exists (select 1 from public.vocab_words w where w.id = p_word_id and w.owner_id = e.owner_id) then
    raise exception 'word not found';
  end if;
  v_exercise := case when p_exercise in ('intro', 'meaning', 'cloze', 'reverse') then p_exercise else 'other' end;

  insert into public.vocab_progress (student_id, word_id, owner_id)
  values (e.student_id, p_word_id, e.owner_id)
  on conflict do nothing;
  v_new := found;
  select * into p from public.vocab_progress
   where student_id = e.student_id and word_id = p_word_id for update;

  if v_new or v_exercise = 'intro' then
    v_before := case when v_new then 0 else p.stage end;
    v_exercise := 'intro';
  else
    v_before := p.stage;
    if coalesce(p_correct, false) then
      v_stage := least(7, p.stage + 1);
      -- минус 6 часов: «через день» должно наступать и тогда, когда ученик зашёл чуть раньше, чем вчера
      v_due := now() + make_interval(days => v_days[v_stage]) - interval '6 hours';
    else
      v_stage := case when p.stage <= 3 then 1 else p.stage - 2 end;
      v_due := now();
    end if;
    update public.vocab_progress
       set stage = v_stage,
           due_at = v_due,
           reps = reps + 1,
           lapses = lapses + case when coalesce(p_correct, false) then 0 else 1 end,
           last_reviewed_at = now()
     where student_id = e.student_id and word_id = p_word_id
    returning * into p;
  end if;

  insert into public.vocab_reviews (owner_id, student_id, word_id, exercise, correct, ms, stage_before)
  values (e.owner_id, e.student_id, p_word_id, v_exercise, coalesce(p_correct, false),
          greatest(0, least(coalesce(p_ms, 0), 600000)), v_before);

  return jsonb_build_object('stage', p.stage, 'due_at', p.due_at);
end;
$$;

-- Статистика словаря ученика для репетитора (работает под RLS: видны только свои строки).
-- p_tz — часовой пояс репетитора (например 'Asia/Almaty') для разбивки ответов по дням.
create or replace function public.vocab_stats(p_student_id uuid, p_tz text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'words_total', (select count(*) from public.vocab_words),
    'started', (select count(*) from public.vocab_progress p where p.student_id = p_student_id),
    'known', (select count(*) from public.vocab_progress p where p.student_id = p_student_id and p.stage >= 5),
    'due', (select count(*) from public.vocab_progress p where p.student_id = p_student_id and p.due_at <= now()),
    'last_reviewed_at', (select max(r.created_at) from public.vocab_reviews r where r.student_id = p_student_id),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', t.d, 'reviews', t.n, 'correct', t.c, 'intro', t.i, 'ms', t.ms) order by t.d), '[]'::jsonb)
        from (
          select (r.created_at at time zone p_tz)::date as d,
                 count(*) filter (where r.exercise <> 'intro') as n,
                 count(*) filter (where r.exercise <> 'intro' and r.correct) as c,
                 count(*) filter (where r.exercise = 'intro') as i,
                 coalesce(sum(r.ms), 0) as ms
            from public.vocab_reviews r
           where r.student_id = p_student_id and r.created_at > now() - interval '15 days'
           group by 1
        ) t
    ),
    'hard', (
      select coalesce(jsonb_agg(jsonb_build_object('word', t.word, 'lapses', t.lapses, 'stage', t.stage)
               order by t.lapses desc, t.word), '[]'::jsonb)
        from (
          select w.word, p.lapses, p.stage
            from public.vocab_progress p
            join public.vocab_words w on w.id = p.word_id
           where p.student_id = p_student_id and p.lapses >= 2
           order by p.lapses desc, w.word
           limit 12
        ) t
    )
  );
$$;

revoke all on function public.vocab_session(text, timestamptz) from public;
revoke all on function public.vocab_review(text, uuid, text, boolean, integer) from public;
revoke all on function public.vocab_stats(uuid, text) from public;
grant execute on function public.vocab_session(text, timestamptz) to anon, authenticated;
grant execute on function public.vocab_review(text, uuid, text, boolean, integer) to anon, authenticated;
grant execute on function public.vocab_stats(uuid, text) to authenticated;
