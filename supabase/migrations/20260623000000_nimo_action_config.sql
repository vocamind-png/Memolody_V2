-- Nimo Action Configuration (Owner-only control)
-- Allows the system owner (Jiew/Paisan) to enable/disable actions
-- and customize their descriptions for the AI system prompt.

CREATE TABLE IF NOT EXISTS public.nimo_action_config (
    action_id TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT true,
    custom_desc_th TEXT,
    custom_desc_en TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.nimo_action_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read action config (needed for prompt generation)
CREATE POLICY "Anyone can read nimo action config"
    ON public.nimo_action_config FOR SELECT
    USING (true);

-- Only owner role can insert/update/delete
CREATE POLICY "Only owner can modify nimo action config"
    ON public.nimo_action_config FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin')
        )
    );

CREATE POLICY "Only owner can update nimo action config"
    ON public.nimo_action_config FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin')
        )
    );

CREATE POLICY "Only owner can delete nimo action config"
    ON public.nimo_action_config FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'owner'
        )
    );

-- Update profiles role constraint to support 'owner' role
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('member', 'user', 'admin', 'executive', 'owner'));
