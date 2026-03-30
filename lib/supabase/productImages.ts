/**
 * Product Images Service
 * Upload and manage product images via Supabase Storage (public bucket).
 */
import { supabase } from './client';

const BUCKET = 'product-images';

export const productImagesService = {
  /**
   * Upload an image for a product. Returns the public URL.
   */
  async upload(productId: string, file: File): Promise<{ url: string | null; error: Error | null }> {
    if (!supabase) return { url: null, error: new Error('Supabase não configurado') };

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${productId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) return { url: null, error: uploadError };

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  },

  /**
   * Delete an image by its full public URL (extracts path from URL).
   */
  async deleteByUrl(publicUrl: string): Promise<{ error: Error | null }> {
    if (!supabase) return { error: new Error('Supabase não configurado') };

    // Extract path from public URL: .../storage/v1/object/public/product-images/...
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return { error: new Error('URL inválida') };

    const path = publicUrl.substring(idx + marker.length);
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return { error: error ?? null };
  },
};
