/**
 * POST /api/messaging/media/upload
 *
 * Upload media for messaging. Stores in Supabase Storage and returns the public URL.
 * Accepts multipart/form-data with:
 * - file: the media file
 * - conversationId: the target conversation (for org ownership validation)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 120;
import crypto from 'crypto';

// WhatsApp limits (Meta API v25 — https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB (Meta limit: 5MB)
const MAX_VIDEO_SIZE = 16 * 1024 * 1024; // 16MB (Meta limit: 16MB post-processing)
const MAX_AUDIO_SIZE = 16 * 1024 * 1024; // 16MB
const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/3gpp'];
const ALLOWED_AUDIO_TYPES = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/webm'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

function getMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' | null {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  return null;
}

function getMaxSize(mediaType: string): number {
  switch (mediaType) {
    case 'image': return MAX_IMAGE_SIZE;
    case 'video': return MAX_VIDEO_SIZE;
    case 'audio': return MAX_AUDIO_SIZE;
    case 'document': return MAX_DOCUMENT_SIZE;
    default: return MAX_DOCUMENT_SIZE;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user profile for org check
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const conversationId = formData.get('conversationId') as string | null;

  if (!file || !conversationId) {
    return NextResponse.json(
      { error: 'file and conversationId are required' },
      { status: 400 }
    );
  }

  // Validate conversation belongs to org
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Validate file type
  const mediaType = getMediaType(file.type);
  if (!mediaType) {
    return NextResponse.json(
      { error: `Tipo de arquivo não suportado: ${file.type}` },
      { status: 400 }
    );
  }

  // Validate file size
  const maxSize = getMaxSize(mediaType);
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return NextResponse.json(
      { error: `Arquivo excede o limite de ${maxMB}MB para ${mediaType}` },
      { status: 400 }
    );
  }

  try {
    // Derive extension from validated MIME type (not user-supplied filename)
    const MIME_TO_EXT: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'video/mp4': 'mp4', 'video/3gpp': '3gp',
      'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/amr': 'amr', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
      'application/pdf': 'pdf', 'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt', 'text/csv': 'csv',
    };
    const ext = MIME_TO_EXT[file.type] || 'bin';
    const uniqueId = crypto.randomUUID();
    const storagePath = `${profile.organization_id}/${conversationId}/${uniqueId}.${ext}`;

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from('messaging-media')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[API] Media upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('messaging-media')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      mediaUrl: urlData.publicUrl,
      mediaType,
      mimeType: file.type,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('[API] Media upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload media' },
      { status: 500 }
    );
  }
}
