-- ════════════════════════════════════════════════════════════════
-- Memolody V2 — Migration: Song Analytics & Engagement System
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. MODIFY EXISTING TABLES
-- ────────────────────────────────────────────────────────────────

-- Add country_code to profiles for analytics
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS country_code TEXT; -- e.g., 'TH', 'US', 'JP'

-- Add cache counters and genre to songs
ALTER TABLE public.songs
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0 NOT NULL CHECK (likes_count >= 0),
ADD COLUMN IF NOT EXISTS favorites_count INTEGER DEFAULT 0 NOT NULL CHECK (favorites_count >= 0),
ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0 NOT NULL CHECK (play_count >= 0),
ADD COLUMN IF NOT EXISTS genre TEXT;

-- ────────────────────────────────────────────────────────────────
-- 2. CREATE ENGAGEMENT TABLES (LIKES & FAVORITES)
-- ────────────────────────────────────────────────────────────────

-- Song Likes Table
CREATE TABLE IF NOT EXISTS public.song_likes (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, song_id)
);

ALTER TABLE public.song_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see all likes" ON public.song_likes FOR SELECT USING (true);
CREATE POLICY "Users can like a song" ON public.song_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike a song" ON public.song_likes FOR DELETE USING (auth.uid() = user_id);

-- Song Favorites Table
CREATE TABLE IF NOT EXISTS public.song_favorites (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, song_id)
);

ALTER TABLE public.song_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own favorites" ON public.song_favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can favorite a song" ON public.song_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfavorite a song" ON public.song_favorites FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 3. CREATE ANALYTICS EVENT LOGS
-- ────────────────────────────────────────────────────────────────

-- Song Play Events
CREATE TABLE IF NOT EXISTS public.song_play_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Allow anonymous plays if needed
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    country_code TEXT, -- Captured at play time for accurate geolocation tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.song_play_events ENABLE ROW LEVEL SECURITY;

-- Analytics logs are usually insert-only by clients
CREATE POLICY "Users can insert play events" ON public.song_play_events FOR INSERT WITH CHECK (true);
-- Users can view their own history
CREATE POLICY "Users can view their own play history" ON public.song_play_events FOR SELECT USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 4. AUTOMATION TRIGGERS FOR CACHE UPDATES
-- ────────────────────────────────────────────────────────────────

-- Function to increment/decrement likes count
CREATE OR REPLACE FUNCTION public.handle_song_like()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.songs SET likes_count = likes_count + 1 WHERE id = NEW.song_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.songs SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.song_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_song_like
    AFTER INSERT OR DELETE ON public.song_likes
    FOR EACH ROW EXECUTE FUNCTION public.handle_song_like();

-- Function to increment/decrement favorites count
CREATE OR REPLACE FUNCTION public.handle_song_favorite()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.songs SET favorites_count = favorites_count + 1 WHERE id = NEW.song_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.songs SET favorites_count = GREATEST(favorites_count - 1, 0) WHERE id = OLD.song_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_song_favorite
    AFTER INSERT OR DELETE ON public.song_favorites
    FOR EACH ROW EXECUTE FUNCTION public.handle_song_favorite();

-- Function to increment play count
CREATE OR REPLACE FUNCTION public.handle_song_play()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.songs SET play_count = play_count + 1 WHERE id = NEW.song_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_song_play
    AFTER INSERT ON public.song_play_events
    FOR EACH ROW EXECUTE FUNCTION public.handle_song_play();

-- ────────────────────────────────────────────────────────────────
-- 5. DATABASE VIEWS FOR BACKEND DASHBOARD
-- ────────────────────────────────────────────────────────────────

-- View: Top Songs All Time
CREATE OR REPLACE VIEW public.view_top_songs_all_time AS
SELECT 
    id AS song_id,
    title,
    artist,
    genre,
    difficulty_grade,
    play_count,
    likes_count,
    favorites_count,
    created_at
FROM public.songs
WHERE is_public = true
ORDER BY play_count DESC, likes_count DESC;

-- View: Analytics By Country (All Time)
CREATE OR REPLACE VIEW public.view_analytics_by_country AS
SELECT 
    country_code,
    COUNT(*) as total_plays,
    COUNT(DISTINCT user_id) as unique_users
FROM public.song_play_events
WHERE country_code IS NOT NULL
GROUP BY country_code
ORDER BY total_plays DESC;
