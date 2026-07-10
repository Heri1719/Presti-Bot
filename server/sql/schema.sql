create extension if not exists "uuid-ossp";

do $$
begin
  create type user_role as enum ('mother', 'health_worker', 'doctor', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type user_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type screening_status as enum ('in_progress', 'completed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type risk_category as enum ('low', 'moderate', 'high', 'emergency');
exception when duplicate_object then null;
end $$;

create table if not exists health_facilities (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role user_role not null,
  phone text,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pregnant_mothers (
  id uuid primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  date_of_birth date,
  gestational_age integer check (gestational_age between 1 and 45),
  gravida_parity text,
  address text,
  health_facility_id uuid references health_facilities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists screening_sessions (
  id uuid primary key,
  mother_id uuid not null references pregnant_mothers(id) on delete cascade,
  status screening_status not null default 'in_progress',
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists ai_assessments (
  id uuid primary key,
  screening_session_id uuid not null unique references screening_sessions(id) on delete cascade,
  risk_score numeric(4, 2) not null check (risk_score >= 0 and risk_score <= 1),
  risk_category risk_category not null,
  triage_recommendation text not null,
  explanation text not null,
  created_at timestamptz not null default now()
);

create table if not exists clinical_validations (
  id uuid primary key,
  ai_assessment_id uuid not null references ai_assessments(id) on delete cascade,
  validator_id uuid not null references users(id),
  clinical_risk_category risk_category not null,
  is_match boolean not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists screening_questions (
  id uuid primary key,
  question_text text not null,
  yes_label text not null default 'Ya',
  no_label text not null default 'Tidak',
  yes_weight numeric(4, 3) not null default 0,
  no_weight numeric(4, 3) not null default 0,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sessions_mother on screening_sessions(mother_id);
create index if not exists idx_assessments_risk on ai_assessments(risk_category);
create index if not exists idx_validations_assessment on clinical_validations(ai_assessment_id);
create index if not exists idx_screening_questions_active_order on screening_questions(is_active, sort_order);
