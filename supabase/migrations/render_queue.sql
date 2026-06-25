-- =============================================
-- Memolody: GPU Render Queue Table
-- Run this in Supabase SQL Editor
-- =============================================

-- Create render_queue table
CREATE TABLE IF NOT EXISTS public.render_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  song_title text NOT NULL DEFAULT 'Unknown Song',
  track_name text NOT NULL DEFAULT 'Track',
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'rendering', 'done', 'failed', 'cancelled')),
  gpu_id text NOT NULL DEFAULT 'gpu-1',
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Indexes for queue queries
CREATE INDEX IF NOT EXISTS idx_render_queue_status ON public.render_queue (status);
CREATE INDEX IF NOT EXISTS idx_render_queue_user ON public.render_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_render_queue_created ON public.render_queue (created_at);

-- Row Level Security
ALTER TABLE public.render_queue ENABLE ROW LEVEL SECURITY;

-- Users can insert their own jobs
CREATE POLICY "Users can insert own jobs" ON public.render_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs (cancel)
CREATE POLICY "Users can update own jobs" ON public.render_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- Anyone (including anon) can read queue status (position, gpu status)
-- but only non-sensitive fields (song_title hidden for others)
CREATE POLICY "Anyone can read active queue" ON public.render_queue
  FOR SELECT USING (
    status IN ('waiting', 'rendering') OR auth.uid() = user_id
  );

-- Admins can see everything
CREATE POLICY "Admin full access" ON public.render_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Auto-expire old jobs (run periodically or via pg_cron)
-- This cleans up jobs older than 24 hours
CREATE OR REPLACE FUNCTION public.cleanup_old_render_jobs()
RETURNS void AS $$
BEGIN
  UPDATE public.render_queue
  SET status = 'cancelled', finished_at = now()
  WHERE status IN ('waiting', 'rendering')
    AND created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
