# SAT Verbal CRM

CRM для репетитора SAT Reading & Writing: ученики, уроки, пробные тесты и прогресс по навыкам.

**Сайт:** https://nuraatwork.github.io/sat-verbal-crm/

## Что уже есть

- **Обзор** — активные ученики, уроки за неделю, средний прирост балла, неоплаченные уроки, ближайшие экзамены, заявки.
- **Ученики** — список с поиском и фильтром по статусу (заявка / занимается / пауза / завершил).
- **Карточка ученика** — контакты, старт/цель/последний балл, дата экзамена, график баллов R&W, пробные тесты, журнал уроков (темы, ДЗ, оплата), покрытие навыков по 4 доменам цифрового SAT.
- **Материалы** — две полосы: «Вопросы по категориям» (карточка на каждый навык SAT R&W со своими сетами) и «Прошлые тесты».
- **Данные** — экспорт/импорт JSON, демо-данные, очистка.

## Где хранятся данные

Два режима, выбираются при сборке:

- **Облако (Supabase)** — если заданы `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
  Вход по email и паролю, данные доступны с любого устройства. Row Level Security в базе:
  каждый пользователь видит только свои строки.
- **Локальный** — если переменные не заданы: всё в `localStorage` этого браузера.

При первом входе в облачный режим, если в браузере остались локальные данные, а облако пустое,
сайт предложит перенести их.

В репозиторий данные учеников не попадают — он публичный.

## Настройка Supabase (один раз)

1. Создать проект на [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → вставить [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Authentication → Users → Add user → Create new user**: email + пароль, галочка *Auto Confirm User*.
4. **Authentication → Sign In / Providers**: выключить *Allow new users to sign up*
   (чтобы посторонние не регистрировались).
5. **Project Settings → API Keys**: взять Project URL и *publishable key* (или legacy *anon key*) и
   записать их в переменные репозитория (**Settings → Secrets and variables → Actions → Variables**):
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. Оба значения публичные по дизайну — защиту обеспечивает RLS.
6. Перезапустить деплой (**Actions → Deploy to GitHub Pages → Run workflow**).

Для локальной разработки с облаком: скопировать `.env.example` в `.env.local` и заполнить.

## Планы

Доска задач: https://github.com/users/NuraAtWork/projects/2 (задачи — issues этого репозитория, метки `отложено` и `идея`).

## Разработка

```bash
npm install
npm run dev      # локальный сервер
npm run build    # сборка в dist/
npm run lint
```

Стек: Vite + React + TypeScript + Supabase, роутинг через `HashRouter` (работает на GitHub Pages без настройки 404).

## Деплой

Каждый push в `main` собирается и публикуется на GitHub Pages через `.github/workflows/deploy.yml`.
