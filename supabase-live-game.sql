-- Supplemental schema for the automated Pujo Secret Society game.
-- The connected project has already received these migrations; this file is for reproducibility.
create table if not exists public.game_state (
 id integer primary key check(id=1), session_name text not null default 'Pujo Secret Society',
 status text not null default 'waiting' check(status in ('waiting','live','revealed','finished')),
 round_number integer not null default 0, question_order integer not null default 0 check(question_order between 0 and 4),
 prompt text not null default '', round_started_at timestamptz, deadline_at timestamptz,
 total_questions integer not null default 20 check(total_questions between 1 and 20), updated_at timestamptz not null default now()
);
insert into public.game_state(id) values(1) on conflict(id) do nothing;
create table if not exists public.game_answers (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references public.applications(id) on delete cascade,
 round_number integer not null, question_order integer not null default 1 check(question_order between 1 and 4),
 answer text not null, submitted_at timestamptz not null default now()
);
create unique index if not exists game_answers_app_round_question_uidx on public.game_answers(application_id,round_number,question_order);
create table if not exists public.game_scores (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
 points integer not null, note text not null default '', awarded_at timestamptz not null default now()
);
create table if not exists public.game_questions (
 id uuid primary key default gen_random_uuid(), round_number integer not null check(round_number between 1 and 5),
 question_order integer not null check(question_order between 1 and 4), category text not null,
 prompt text not null check(char_length(trim(prompt)) between 1 and 1000),
 timer_seconds integer not null default 60 check(timer_seconds between 15 and 300),
 is_active boolean not null default true, created_at timestamptz not null default now(), unique(round_number,question_order)
);
insert into public.game_questions(round_number,question_order,category,prompt,timer_seconds) values
(1,1,'Know Your Partner','What was the first thing you noticed about your partner when you met?',60),
(1,2,'Know Your Partner','Which small gesture from your partner instantly makes your day better?',60),
(1,3,'Know Your Partner','If your partner could plan a perfect day together, what would it include?',60),
(1,4,'Know Your Partner','What is one thing your partner is surprisingly good at?',60),
(2,1,'Secrets & Confessions','What is a harmless little habit you have never admitted to your partner?',60),
(2,2,'Secrets & Confessions','What is the funniest misunderstanding you have had as a couple?',60),
(2,3,'Secrets & Confessions','What is one song, film or food that reminds you of your relationship?',60),
(2,4,'Secrets & Confessions','What is one spontaneous thing you would love to do together?',60),
(3,1,'Chemistry & Compatibility','Who is more likely to start dancing in the middle of an ordinary day, and why?',60),
(3,2,'Chemistry & Compatibility','Choose one: a quiet night in, an unplanned road trip, or a dressed-up date. What would you both pick?',60),
(3,3,'Chemistry & Compatibility','What is one difference between you that makes your relationship more interesting?',60),
(3,4,'Chemistry & Compatibility','If your relationship had a title like a movie, what would it be?',60),
(4,1,'Pujo After Dark','Design your ideal Pujo date in three words, then explain your choices.',60),
(4,2,'Pujo After Dark','Which would you choose together: pandal-hopping till dawn, a late-night food trail, or a cozy movie marathon?',60),
(4,3,'Pujo After Dark','What outfit or look would your partner choose for a memorable Pujo evening?',60),
(4,4,'Pujo After Dark','Invent a secret couple nickname inspired by Pujo and explain its meaning.',60),
(5,1,'Final Couple Challenge','Name one shared memory you would happily relive for one more evening.',60),
(5,2,'Final Couple Challenge','What is one new experience you want to try together in the coming year?',60),
(5,3,'Final Couple Challenge','Complete this sentence together: “Our kind of magic is…”',60),
(5,4,'Final Couple Challenge','In one sentence, describe why your partner makes an ordinary day feel special.',60)
on conflict(round_number,question_order) do nothing;
create index if not exists game_answers_round_idx on public.game_answers(round_number);
create index if not exists game_scores_app_idx on public.game_scores(application_id);
create index if not exists game_questions_round_order_idx on public.game_questions(round_number,question_order) where is_active=true;
alter table public.game_state enable row level security;
alter table public.game_answers enable row level security;
alter table public.game_scores enable row level security;
alter table public.game_questions enable row level security;
-- No anon/authenticated policies: privileged game operations run through protected Netlify Functions.
