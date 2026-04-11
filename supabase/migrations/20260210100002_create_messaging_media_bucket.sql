-- Migration: create_messaging_media_bucket
-- Cria bucket no Supabase Storage para mídia de messaging.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messaging-media',
  'messaging-media',
  true,
  104857600, -- 100MB (video limit)
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow authenticated users to upload to their OWN org path only
CREATE POLICY "Users can upload messaging media to own org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'messaging-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- RLS: Allow public read (needed for WhatsApp API to fetch the file)
CREATE POLICY "Public read messaging media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'messaging-media');

-- RLS: Allow users to delete media from their own org path
CREATE POLICY "Users can delete own org messaging media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'messaging-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
