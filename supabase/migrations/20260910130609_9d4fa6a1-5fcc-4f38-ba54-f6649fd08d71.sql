CREATE TABLE public.data_sources (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  project_url text not null,
  anon_key text not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sources TO authenticated;
GRANT ALL ON public.data_sources TO service_role;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own data sources" ON public.data_sources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS handoff_message text not null default 'تم تحويل محادثتك إلى أحد موظفينا، سيتواصل معك في أقرب وقت.';