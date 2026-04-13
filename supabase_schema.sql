-- ═══════════════════════════════════════════════
--  TaskFlow v5 — Supabase Schema
--  Corre isto no SQL Editor do Supabase
-- ═══════════════════════════════════════════════

-- USERS
create table if not exists users (
  id text primary key,
  name text not null,
  email text unique not null,
  password text,
  role text default 'member',
  avatar text,
  color text default '#6366f1',
  bio text default '',
  department text default '',
  phone text default '',
  location text default '',
  online boolean default false,
  joined date default current_date,
  skills jsonb default '[]',
  google_id text
);

-- PROJECTS
create table if not exists projects (
  id text primary key,
  name text not null,
  color text default '#6366f1',
  icon text default '📁',
  description text default '',
  members jsonb default '[]',
  status text default 'active',
  deadline date,
  created date default current_date
);

-- TASKS
create table if not exists tasks (
  id text primary key,
  title text not null,
  description text default '',
  status text default 'A Fazer',
  priority text default 'medium',
  assignee text,
  tags jsonb default '[]',
  deadline date,
  project text,
  subtasks jsonb default '[]',
  comments jsonb default '[]',
  created date default current_date,
  pinned boolean default false
);

-- EVENTS
create table if not exists events (
  id text primary key,
  title text not null,
  start_time text,
  end_time text,
  color text default '#6366f1',
  project text,
  type text default 'meeting',
  description text default '',
  attendees jsonb default '[]',
  all_day boolean default false
);

-- NOTES
create table if not exists notes (
  id text primary key,
  user_id text,
  title text default 'Nova Nota',
  content text default '',
  created timestamp default now(),
  updated timestamp default now(),
  color text default '#6366f1',
  pinned boolean default false
);

-- NOTIFICATIONS
create table if not exists notifications (
  id text primary key,
  user_id text,
  type text,
  title text,
  message text,
  read boolean default false,
  created timestamp default now()
);

-- ACTIVITY
create table if not exists activity (
  id text primary key,
  user_id text,
  action text,
  target text,
  type text,
  time text,
  icon text,
  created timestamp default now()
);

-- ═══════════════════════════════════════════════
--  DADOS DEMO — corre depois do schema
-- ═══════════════════════════════════════════════

insert into users (id, name, email, password, role, avatar, color, bio, department, phone, location, online, skills) values
('u1','Ana Silva','ana@taskflow.io','admin123','admin','AS','#6366f1','CEO & Fundadora do TaskFlow','Gestão','+351 912 345 678','Lisboa, Portugal',true,'["Liderança","Estratégia","Product"]'),
('u2','Bruno Costa','bruno@taskflow.io','manager123','manager','BC','#8b5cf6','Engineering Manager','Tecnologia','+351 913 456 789','Porto, Portugal',true,'["Python","React","DevOps"]'),
('u3','Carla Mendes','carla@taskflow.io','membro123','member','CM','#ec4899','UX/UI Designer','Design','+351 914 567 890','Braga, Portugal',false,'["Figma","UI Design","Prototyping"]'),
('u4','David Lopes','david@taskflow.io','membro123','member','DL','#10b981','Full Stack Developer','Tecnologia','+351 915 678 901','Coimbra, Portugal',true,'["JavaScript","Python","SQL"]'),
('u5','Eva Rodrigues','eva@taskflow.io','viewer123','viewer','ER','#f59e0b','Stakeholder & Parceira','Parceiros','+351 916 789 012','Faro, Portugal',false,'["Marketing","Analytics"]')
on conflict (id) do nothing;

insert into projects (id, name, color, icon, description, members, status) values
('p1','TaskFlow App','#6366f1','⚡','Desenvolvimento da plataforma principal','["u1","u2","u3","u4"]','active'),
('p2','Website Corporativo','#ec4899','🌐','Redesign completo do site institucional','["u1","u3","u4"]','active'),
('p3','Infra & DevOps','#10b981','🔧','Modernização da infraestrutura','["u2","u4"]','active'),
('p4','App Mobile','#f59e0b','📱','Versão mobile nativa','["u1","u2","u3"]','planning')
on conflict (id) do nothing;

insert into tasks (id, title, description, status, priority, assignee, tags, deadline, project, subtasks, pinned) values
('t1','Redesign da Landing Page','Atualizar visual com novo branding e animações.','Em Progresso','high','u3','["design","feature"]',current_date + 3,'p1','[{"id":"s1","title":"Wireframes","done":true},{"id":"s2","title":"Mockup final","done":false}]',true),
('t2','API de Autenticação JWT','Refresh tokens e 2FA completo.','A Fazer','high','u4','["dev","feature"]',current_date + 7,'p1','[{"id":"s3","title":"Endpoint /login","done":false}]',false),
('t3','Corrigir bug no formulário','Validação falha em Safari 16+.','Revisão','medium','u4','["bug"]',current_date + 1,'p2','[{"id":"s4","title":"Reproduzir","done":true}]',false),
('t4','Documentação da API REST','Swagger completo com exemplos.','A Fazer','low','u2','["docs"]',current_date + 14,'p1','[]',false),
('t5','Dashboard Analytics','Métricas DAU e MAU em tempo real.','Em Progresso','medium','u4','["dev","feature"]',current_date + 10,'p1','[{"id":"s5","title":"Chart.js","done":true}]',false),
('t6','Setup CI/CD Pipeline','GitHub Actions com deploy automático.','Concluído','high','u2','["devops"]',current_date - 2,'p3','[{"id":"s6","title":"Workflow","done":true}]',false),
('t7','Design System','Biblioteca de componentes com Storybook.','Em Progresso','high','u3','["design","docs"]',current_date + 20,'p2','[{"id":"s7","title":"Tokens","done":true}]',false)
on conflict (id) do nothing;

insert into notifications (id, user_id, type, title, message, read) values
('nf1','u1','deadline','Prazo a aproximar-se','Redesign da Landing Page termina em 3 dias',false),
('nf2','u1','comment','Novo comentário','Carla comentou numa tarefa',false)
on conflict (id) do nothing;

insert into activity (id, user_id, action, target, type, time, icon) values
('a1','u4','moveu para Revisão','Corrigir bug no formulário','task','5 min','🔄'),
('a2','u2','concluiu','Setup CI/CD Pipeline','task','1h','✅'),
('a3','u1','criou','Dashboard Analytics','task','2h','✨'),
('a4','u3','comentou em','Redesign da Landing Page','comment','3h','💬')
on conflict (id) do nothing;
