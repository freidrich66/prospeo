-- ============================================================
--  PROSPEO — Schéma Supabase complet
--  À coller dans : Supabase > SQL Editor > New Query
-- ============================================================

-- ─── 1. EXTENSION UUID ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. TABLE PROFILES ───────────────────────────────────────
-- Complète la table auth.users de Supabase avec le rôle
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'commercial' CHECK (role IN ('commercial', 'manager')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. TABLE CONTACTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name  text        NOT NULL,
  last_name   text        NOT NULL,
  company     text,
  role        text,
  email       text,
  phone       text,
  source      text        NOT NULL DEFAULT 'manuel' CHECK (source IN ('carte', 'manuel', 'vocal')),
  status      text        NOT NULL DEFAULT 'froid'  CHECK (status IN ('chaud', 'tiède', 'froid', 'converti')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. TABLE SYNTHESES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.syntheses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. INDEX (performances) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS contacts_user_id_idx    ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS contacts_created_at_idx ON public.contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_status_idx     ON public.contacts(status);
CREATE INDEX IF NOT EXISTS contacts_source_idx     ON public.contacts(source);
CREATE INDEX IF NOT EXISTS syntheses_contact_id_idx ON public.syntheses(contact_id);

-- ─── 6. TRIGGER updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 7. TRIGGER : créer profil à l'inscription ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'commercial')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 8. ROW LEVEL SECURITY ───────────────────────────────────
ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syntheses ENABLE ROW LEVEL SECURITY;

-- Profiles : chacun voit et modifie son propre profil
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Contacts : commercial voit uniquement les siens, manager voit tout
CREATE POLICY "contacts_select" ON public.contacts
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

CREATE POLICY "contacts_insert" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update" ON public.contacts
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Syntheses : même logique que contacts
CREATE POLICY "syntheses_select" ON public.syntheses
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

CREATE POLICY "syntheses_insert" ON public.syntheses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "syntheses_delete" ON public.syntheses
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 9. VUES POUR LES RAPPORTS ───────────────────────────────
-- Vue enrichie des contacts avec nom du commercial
CREATE OR REPLACE VIEW public.contacts_with_owner AS
SELECT
  c.*,
  p.full_name  AS owner_name,
  p.email      AS owner_email
FROM public.contacts c
JOIN public.profiles p ON p.id = c.user_id;

-- Vue agrégée par commercial + période
CREATE OR REPLACE VIEW public.stats_by_user AS
SELECT
  p.id           AS user_id,
  p.full_name,
  p.email,
  COUNT(c.id)                                              AS total,
  COUNT(c.id) FILTER (WHERE c.status = 'chaud')           AS chaud,
  COUNT(c.id) FILTER (WHERE c.status = 'tiède')           AS tiede,
  COUNT(c.id) FILTER (WHERE c.status = 'froid')           AS froid,
  COUNT(c.id) FILTER (WHERE c.status = 'converti')        AS converti,
  COUNT(c.id) FILTER (WHERE c.source = 'carte')           AS source_carte,
  COUNT(c.id) FILTER (WHERE c.source = 'manuel')          AS source_manuel,
  COUNT(c.id) FILTER (WHERE c.source = 'vocal')           AS source_vocal,
  COUNT(c.id) FILTER (WHERE c.created_at >= now() - interval '7 days')  AS cette_semaine,
  COUNT(c.id) FILTER (WHERE c.created_at >= date_trunc('month', now())) AS ce_mois
FROM public.profiles p
LEFT JOIN public.contacts c ON c.user_id = p.id
GROUP BY p.id, p.full_name, p.email;

-- ─── 10. CRÉER LE PREMIER MANAGER MANUELLEMENT ───────────────
-- ⚠️  À exécuter APRÈS avoir créé votre compte via l'interface
-- Remplacez 'votre@email.com' par votre email réel
--
-- UPDATE public.profiles
-- SET role = 'manager'
-- WHERE email = 'votre@email.com';

-- ============================================================
--  FIN DU SCRIPT
--  Vérification : vous devez voir 3 tables dans Table Editor
--  profiles / contacts / syntheses
-- ============================================================
