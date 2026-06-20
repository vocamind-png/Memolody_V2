-- ════════════════════════════════════════════════════════════════
-- Memolody V2 — Migration: Song Grading System & Imported Songs
-- ════════════════════════════════════════════════════════════════

-- 1. Modify existing `songs` table to support grading
ALTER TABLE public.songs
ADD COLUMN IF NOT EXISTS difficulty_grade TEXT,
ADD COLUMN IF NOT EXISTS grading_status TEXT DEFAULT 'pending' CHECK (grading_status IN ('auto_graded', 'verified', 'user_defined', 'pending'));

-- 2. Create `user_imported_songs` table for user uploads & AI analysis
CREATE TABLE IF NOT EXISTS public.user_imported_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    original_file_url TEXT, -- URL to PDF, Image, MIDI, or MXL
    parsed_musicxml_url TEXT, -- URL to processed MusicXML (output of OMR/AI)
    difficulty_grade TEXT,
    grading_status TEXT DEFAULT 'pending' CHECK (grading_status IN ('auto_graded', 'verified', 'user_defined', 'pending')),
    ai_confidence_score NUMERIC(4, 2) CHECK (ai_confidence_score >= 0.00 AND ai_confidence_score <= 1.00),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on new table
ALTER TABLE public.user_imported_songs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for `user_imported_songs`
CREATE POLICY "Users can view their own imported songs and public ones" 
    ON public.user_imported_songs FOR SELECT USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert their own imported songs" 
    ON public.user_imported_songs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own imported songs" 
    ON public.user_imported_songs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own imported songs" 
    ON public.user_imported_songs FOR DELETE USING (auth.uid() = user_id);
