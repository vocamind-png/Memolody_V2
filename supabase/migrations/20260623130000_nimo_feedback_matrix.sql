-- Nimo Feedback Matrix & Issue Tracker
-- Stores feedback, bugs, and feature requests generated automatically by Nimo AI.

CREATE TABLE IF NOT EXISTS public.nimo_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT, -- Can be null if anonymous or system-generated
    category TEXT NOT NULL CHECK (category IN ('bug', 'feature_request', 'complaint', 'praise', 'other')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sentiment_score NUMERIC(3, 2) DEFAULT 0.0, -- -1.0 to 1.0 (negative to positive)
    urgency_level INTEGER DEFAULT 1, -- 1 to 10
    similar_count INTEGER DEFAULT 1, -- Automatically incremented if it's a known issue
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'ignored')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security
ALTER TABLE public.nimo_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can insert feedback
CREATE POLICY "Anyone can insert feedback"
    ON public.nimo_feedback FOR INSERT
    WITH CHECK (true);

-- Only owner/admin can read feedback
CREATE POLICY "Owner can read feedback"
    ON public.nimo_feedback FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin' OR profiles.role = 'executive')
        )
    );

-- Only owner/admin can update feedback (e.g. changing status)
CREATE POLICY "Owner can update feedback"
    ON public.nimo_feedback FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin' OR profiles.role = 'executive')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role = 'owner' OR profiles.role = 'admin' OR profiles.role = 'executive')
        )
    );
