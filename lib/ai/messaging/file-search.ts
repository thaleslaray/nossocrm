/**
 * Google GenAI File Search Store — RAG gerenciado.
 *
 * Usa @google/genai (não o Vercel AI SDK que não expõe File Search Tool).
 * O store é permanente: criado uma vez, reutilizado em todas as conversas.
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Cria um File Search Store para um board.
 * Retorna o nome do store (ex: "fileSearchStores/xxx-yyy-zzz").
 */
export async function createFileSearchStore(
  apiKey: string,
  displayName: string,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  const store = await client.fileSearchStores.create({
    config: { displayName },
  });
  return store.name!;
}

/**
 * Faz upload de um arquivo para o store.
 */
export async function uploadToFileSearchStore(
  apiKey: string,
  storeId: string,
  file: Blob,
  mimeType: string,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey });
  await client.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName: storeId,
    file,
    config: { mimeType },
  });
}

/**
 * Gera uma resposta usando @google/genai com File Search Store ativo.
 * tools ficam em config.tools conforme GenerateContentParameters.
 */
export async function generateWithFileSearch({
  apiKey,
  model,
  systemPrompt,
  userMessage,
  storeId,
}: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  storeId: string;
}): Promise<{ text: string }> {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [storeId],
          },
        },
      ],
    },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { text };
}
