# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- (Upcoming features will appear here)

### Changed
- (Upcoming changes will appear here)

### Fixed
- (Upcoming fixes will appear here)

### Removed
- (Upcoming removals will appear here)

---

## [0.1.0] - 2026-04-09

### Added

#### Evolution API Integration
- End-to-end Evolution API WhatsApp provider support
- Display WhatsApp phone number from Evolution channel
- Support for Evolution API webhooks with multi-tenant authentication
- Evolution API option in channel setup wizard
- Capture outbound messages from WhatsApp app as sent messages

#### AI Agent Enhancements
- `agent_goal_stage_id` field — autonomous agent scope per funnel
- Visual feedback for out-of-scope stages in goal stage config
- MCP server tools for AI agent stress-testing (`crm.ai.simulate.*`)
- Log handoff actions in `ai_conversation_log`
- Await `processIncomingMessage()` in dev mode for proper execution

#### Settings & Configuration
- Dynamic AI model list from provider APIs
- Telegram integration with auto-detect chat_id via polling (zero-config UX)
- Test message button for Telegram validation

#### Testing & Monitoring
- Vitest coverage for `agent_goal_stage_id` scope validation

### Fixed

#### AI Configuration
- Fix 3 silent bugs in AI configuration by stage
- Await `processIncomingMessage` execution in dev mode

#### Evolution API
- Fix 3 Evolution code review issues
- Security improvements for Evolution webhook processing
- Content type handling and missing event handlers
- Fix 2 Evolution code review bugs

#### Simulation & Reliability
- Fix reliability of S2/S3/S6 simulation scenarios
- Improve AI logging in simulation mode

#### Webhook Processing
- Extract `channelId` by UUID regex to support `webhookByEvents` mode
- Remove non-existent columns from deals insert
- Fix 4 inbox bugs found by ultraplan audit

#### Messaging
- Show outbound messages sent from phone in inbox
- Fix email channel realtime updates

#### Telegram Integration
- Support groups in Telegram integration
- Fix Telegram disconnect handling
- Polish connected state display
- Fix Telegram notification sending on all handoff paths
- Fix CSPRNG usage in crypto operations

### Removed
- References to OpenAI and Anthropic providers (100% consolidation to Google Gemini)
- Voice feature (ElevenLabs Conversational AI + WhatsApp Business Calling API) — tables preserved in database

### Changed

#### Provider Consolidation
- Consolidated to 100% Google Gemini for AI operations
- Removed OpenAI and Anthropic provider code

### Refactored

- Remove remaining references to OpenAI/Anthropic
- Clean up provider abstraction layer

---

## Release Notes

**Version 0.1.0** is the first development release of NossoCRM with core messaging and AI agent capabilities.

### Status
- ✅ Messaging MVP complete (WhatsApp via Meta & Evolution, Email via Resend, Telegram, Instagram)
- ✅ AI Agent MVP complete (autonomous stage advancement with HITL, briefing generation)
- ⏳ Public API: Planned for v0.2.0 or v1.0.0

### Next Milestone (v0.2.0)
- Public API for message ingestion
- GraphQL API for CRM data
- Webhook signature verification hardening

### Path to v1.0.0
- Stabilize public APIs
- Security audit and penetration testing
- Performance optimization
- Comprehensive documentation
