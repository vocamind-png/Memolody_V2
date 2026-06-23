-- Nimo Dynamic Actions (Admin-Only)
-- Allows the owner to add new AI capabilities via database without code deployments.

CREATE TABLE IF NOT EXISTS public.nimo_dynamic_actions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    script TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.nimo_dynamic_actions ENABLE ROW LEVEL SECURITY;

-- Anyone can read active actions
CREATE POLICY "Anyone can read active dynamic actions"
    ON public.nimo_dynamic_actions FOR SELECT
    USING (is_active = true);

-- Only owner/admin can read all actions (including inactive)
CREATE POLICY "Owner can read all dynamic actions"
    ON public.nimo_dynamic_actions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin')
        )
    );

-- Only owner can modify actions
CREATE POLICY "Owner can modify dynamic actions"
    ON public.nimo_dynamic_actions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin')
        )
    );

