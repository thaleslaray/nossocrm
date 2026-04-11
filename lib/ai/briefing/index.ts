/**
 * @fileoverview Meeting Briefing Module
 *
 * Exports briefing service and schemas.
 *
 * @module lib/ai/briefing
 */

export { generateMeetingBriefing } from './briefing.service';
export {
  BantStatusSchema,
  MeetingBriefingSchema,
  type BantStatus,
  type MeetingBriefing,
  type BriefingResponse,
} from './schemas';
