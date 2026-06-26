-- Migration: Game Themes and Assets
-- Description: Creates the game_themes table and configures the game-assets storage bucket.

-- 1. Create game_themes table
CREATE TABLE IF NOT EXISTS public.game_themes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    theme_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    icon_name TEXT,
    color_class TEXT,
    gradient_class TEXT,
    image_url TEXT,
    bgm_url TEXT,
    sfx_urls JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable RLS on game_themes
ALTER TABLE public.game_themes ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active game themes
CREATE POLICY "Public can view active game themes"
    ON public.game_themes
    FOR SELECT
    USING (is_active = true);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage game themes"
    ON public.game_themes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 3. Insert default themes (based on existing hardcoded themes)
INSERT INTO public.game_themes (theme_id, title, subtitle, icon_name, color_class, gradient_class, image_url)
VALUES 
    ('space', 'Space Odyssey', 'Syfri-urtahic', 'Rocket', 'text-indigo-400', 'from-indigo-600/40 to-purple-900/60', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop'),
    ('forest', 'Forest Concert', 'Happy Birdie', 'Bird', 'text-yellow-400', 'from-emerald-400/60 to-lime-500/60', 'https://images.unsplash.com/photo-1500964757637-c85e8a162699?w=600&auto=format&fit=crop'),
    ('history', 'Historical Quest', 'Omert Chiom', 'Theater', 'text-amber-400', 'from-blue-600/40 to-indigo-950/60', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop'),
    ('italian', 'Italian Ballot', '3D Mean Style', 'UtensilsCrossed', 'text-red-400', 'from-red-600/40 to-orange-900/60', 'https://images.unsplash.com/photo-1516483638261-f40af5ee2245?w=600&auto=format&fit=crop')
ON CONFLICT (theme_id) DO NOTHING;

-- 4. Create the game-assets storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policies for game-assets bucket
-- Public can read assets
CREATE POLICY "Public Access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'game-assets');

-- Admins can upload, update, and delete assets
CREATE POLICY "Admin Upload Access"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'game-assets' AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin Update Access"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'game-assets' AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admin Delete Access"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'game-assets' AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
