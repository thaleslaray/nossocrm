/**
 * @fileoverview AI Field Extraction Module
 *
 * Automatically extracts BANT fields from conversations.
 *
 * @module lib/ai/extraction
 */

export { extractAndUpdateBANT } from './extraction.service';
export {
  BANTExtractionSchema,
  type BANTExtraction,
  type AIExtractedData,
  type AIExtractedField,
} from './schemas';
