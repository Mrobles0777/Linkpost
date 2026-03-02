-- Ejecuta este comando en el editor SQL de tu panel de Supabase 
-- para habilitar la tabla de posts programados.

CREATE TABLE scheduled_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text REFERENCES profiles(id) ON DELETE CASCADE,
  content_text text NOT NULL,
  image_url text,
  scheduled_for timestamptz NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'published', 'failed'
  created_at timestamptz DEFAULT now(),
  error_message text
);


-- Si tienes configurado Row Level Security (RLS) en `profiles` y quieres 
-- limitarlo para que los usuarios solo puedan ver/crear sus posts programados:
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own scheduled posts" 
ON scheduled_posts FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can see their own scheduled posts" 
ON scheduled_posts FOR SELECT 
TO authenticated 
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own scheduled posts" 
ON scheduled_posts FOR UPDATE 
TO authenticated 
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own scheduled posts" 
ON scheduled_posts FOR DELETE 
TO authenticated 
USING (auth.uid()::text = user_id);
