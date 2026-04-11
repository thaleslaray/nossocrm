/**
 * @fileoverview Media Upload Mutation
 *
 * Hook para upload de mídia via API, retornando URL para uso em mensagens.
 *
 * @module lib/query/hooks/useMediaUploadMutation
 */

import { useMutation } from '@tanstack/react-query';

interface MediaUploadResult {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export function useMediaUploadMutation() {
  return useMutation({
    mutationFn: async ({
      file,
      conversationId,
    }: {
      file: File;
      conversationId: string;
    }): Promise<MediaUploadResult> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);

      const response = await fetch('/api/messaging/media/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
  });
}
