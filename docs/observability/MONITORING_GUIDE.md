# Observability & Monitoring Guide

NossoCRM — Structured Logging, Health Checks, and HITL Alerting

**Date**: 2026-04-09  
**Status**: Complete  
**Scope**: AI Agent instrumentation, webhook reliability, HITL tracking  

---

## Overview

This guide documents the observability infrastructure for NossoCRM:

1. **Structured Logging** — JSON-formatted logs for Vercel Logs parsing
2. **Health Check Endpoint** — `GET /api/health` for availability monitoring
3. **HITL Alerting** — Automatic alerts when pending approvals exceed 24h

### Key Metrics to Monitor

| Component | Critical Metric | Alert Threshold | Notes |
|-----------|-----------------|-----------------|-------|
| AI Agent | Response latency (p99) | >2000ms | Gemini API timeout |
| AI Agent | Token budget exceeded | 100% of monthly quota | Prevents runaway costs |
| AI Agent | Error rate | >5% of requests | Failover issues |
| HITL | Pending approvals age | >24h without review | Escalates to ops |
| Webhooks | Delivery success rate | <95% | Message drops |
| System | Supabase connectivity | Any failure | Auth/data layer down |

---

## 1. Structured Logging

### Location
- **Module**: `lib/ai/agent/structured-logger.ts`
- **Integration**: `lib/ai/agent/agent.service.ts`
- **Format**: JSON via `console.info(JSON.stringify(...))`

### Log Events

#### `ai.response`
Emitted when AI successfully generates and sends a response.

```json
{
  "event": "ai.response",
  "timestamp": "2026-04-09T14:32:00.000Z",
  "org_id": "org-123",
  "conversation_id": "conv-456",
  "deal_id": "deal-789",
  "message_id": "msg-101",
  "action": "responded",
  "tokens_used": 245,
  "model": "gemini-2.0-flash",
  "latency_ms": 1250,
  "reason": "Resposta enviada com sucesso"
}
```

**Visibility**: Use this to track response throughput, latency distribution (p50, p95, p99), and token consumption.

---

#### `ai.error`
Emitted when AI generation fails (provider error, timeout, etc).

```json
{
  "event": "ai.error",
  "timestamp": "2026-04-09T14:32:00.000Z",
  "org_id": "org-123",
  "conversation_id": "conv-456",
  "error_code": "PROVIDER_TIMEOUT",
  "error_message": "Google Gemini API timeout after 30s",
  "deal_id": "deal-789"
}
```

**Visibility**: Track error categories, correlate with provider status pages, alert on error spike (>5%).

---

#### `ai.rate_limited`
Emitted when per-conversation rate limit is hit.

```json
{
  "event": "ai.rate_limited",
  "timestamp": "2026-04-09T14:32:00.000Z",
  "org_id": "org-123",
  "conversation_id": "conv-456",
  "retry_after_ms": 5000
}
```

**Visibility**: Track conversation velocity, identify potential spam/abuse patterns.

---

#### `ai.budget_exceeded`
Emitted when organization's monthly token budget is exhausted.

```json
{
  "event": "ai.budget_exceeded",
  "timestamp": "2026-04-09T14:32:00.000Z",
  "org_id": "org-123",
  "tokens_used": 2850000,
  "tokens_limit": 2000000
}
```

**Visibility**: Alert to ops immediately — org won't get AI responses until next billing period.

---

### Log Format

All logs follow this base structure:

```typescript
{
  timestamp: ISO8601,     // Injected by logStructured()
  event: string,          // Event type (e.g., "ai.response")
  org_id?: string,        // Organization ID (context)
  conversation_id?: string, // Conversation ID (context)
  deal_id?: string,       // Deal ID (context)
  message_id?: string,    // Message ID (traceability)
  // ... event-specific fields
}
```

### Parsing in Vercel Logs

Vercel automatically parses JSON from `console.info()`. Query with:

```sql
-- Find all AI responses in past 24h
SELECT * FROM logs 
WHERE message CONTAINS '"event":"ai.response"' 
AND timestamp > now() - 24h

-- Find errors by org
SELECT org_id, COUNT(*) as error_count 
FROM logs 
WHERE message CONTAINS '"event":"ai.error"' 
GROUP BY org_id 
ORDER BY error_count DESC

-- P95 latency by model
SELECT json->>'model' as model, percentile_cont(0.95) WITHIN GROUP (ORDER BY (json->>'latency_ms')::INT) as p95_ms
FROM logs 
WHERE message CONTAINS '"event":"ai.response"'
GROUP BY model
```

---

## 2. Health Check Endpoint

### Location
- **Route**: `GET /api/health`
- **Method**: `GET` or `HEAD`
- **Response**: JSON health status

### GET Response (200 or 503)

```json
{
  "status": "healthy",
  "timestamp": "2026-04-09T14:32:00.000Z",
  "uptime_ms": 42,
  "version": "a1b2c3d",
  "components": {
    "database": {
      "status": "ok",
      "latency_ms": 12
    },
    "ai_provider": {
      "status": "ok",
      "provider": "google"
    },
    "webhooks": {
      "status": "unknown",
      "edge_functions": []
    }
  }
}
```

**Status Codes**:
- `200` — Healthy (all critical components ok)
- `503` — Unhealthy (database or AI provider down)
- `206` — Degraded (some components down, but not critical)

**Components**:
- **database**: Supabase connection + simple query
- **ai_provider**: API key configured (basic validation)
- **webhooks**: Edge Functions status (informational)

### HEAD Response (200 or 503)

Lightweight health check with no response body — useful for load balancers:

```bash
curl -I https://nossocrm.vercel.app/api/health
# HTTP/1.1 200 OK
# Cache-Control: no-cache, no-store, must-revalidate
```

### Usage

**Vercel Deployment Status**:
- Add `/api/health` to Vercel deployment status checks
- Alerts fire automatically if endpoint returns 503 continuously

**Application Monitoring**:
```bash
# Check health every 30s
watch -n 30 'curl -s https://nossocrm.vercel.app/api/health | jq .'

# K6 load test with health threshold
k6 run -e HEALTH_ENDPOINT=https://nossocrm.vercel.app/api/health tests/health-check.js
```

---

## 3. HITL Pending Alerts

### Problem Statement

When AI suggests stage advancement, it waits for human approval (HITL). If pending approvals accumulate beyond 24 hours without review, ops should be alerted to potential bottleneck.

### Schema

**Table**: `ai_pending_stage_advances`

```sql
id UUID PRIMARY KEY
organization_id UUID
deal_id UUID
current_stage_id UUID
suggested_stage_id UUID
confidence NUMERIC(3,2)  -- 0.00 - 1.00
status TEXT              -- 'pending', 'approved', 'rejected', 'expired', 'auto_approved'
created_at TIMESTAMPTZ
expires_at TIMESTAMPTZ   -- Default: created_at + 24h
alert_triggered_at TIMESTAMPTZ  -- When alert was sent (NULL = not yet)
```

### Alert System

**Functions**:

1. **`trigger_hitl_alerts()`** — Run every 6 hours
   - Finds all `pending` records older than 24h
   - Creates `deal_activities` entry with type `hitl_alert`
   - Sets `alert_triggered_at` to prevent duplicate alerts
   - Returns `(alert_count, affected_deals)`

2. **`expire_old_pending_advances()`** — Run every 12 hours
   - Marks records beyond `expires_at` as `expired`
   - Prevents stale approvals from blocking workflow
   - Returns count of expired records

**pg_cron Jobs** (if extension available):
```sql
-- Check for old pending records every 6 hours
SELECT cron.schedule('hitl-pending-alerts', '0 */6 * * *', 'SELECT public.trigger_hitl_alerts();');

-- Expire old records every 12 hours
SELECT cron.schedule('expire-hitl-pending', '0 */12 * * *', 'SELECT public.expire_old_pending_advances();');
```

### Monitoring

**View**: `vw_hitl_pending_by_age`

```sql
SELECT * FROM public.vw_hitl_pending_by_age
WHERE pending_count > 0
ORDER BY age_gt_24h DESC;
```

Output:
```
org_id          | pending_count | age_0_6h | age_6_12h | age_12_24h | age_gt_24h | oldest_pending_at
org-123         | 5             | 2        | 1         | 1          | 1          | 2026-04-08 10:30:00
org-456         | 12            | 0        | 0         | 3          | 9          | 2026-04-07 14:00:00
```

### Alert Activity Log

When `trigger_hitl_alerts()` runs, it creates entries in `deal_activities`:

```sql
SELECT 
  da.id,
  da.deal_id,
  da.type,
  da.description,
  da.metadata->>'pending_advance_id' as pending_id,
  (da.metadata->>'hours_pending')::INT as hours_pending,
  da.created_at
FROM deal_activities da
WHERE da.type = 'hitl_alert'
  AND da.created_at > NOW() - INTERVAL '24 hours'
ORDER BY da.created_at DESC;
```

**Description format**:
```
HITL pending advance sem revisão há 28 horas. ID: 6f8a9c2d-...
```

**Metadata**:
```json
{
  "pending_advance_id": "6f8a9c2d-1234-5678-abcd-ef0123456789",
  "confidence": 0.87,
  "created_at": "2026-04-08T10:30:00.000Z",
  "hours_pending": 28,
  "expires_at": "2026-04-09T10:30:00.000Z",
  "alert_type": "pending_timeout"
}
```

### Manual Triggering

If pg_cron is unavailable, call functions from application code:

```typescript
// In a cron endpoint or background job
const supabase = createClient(url, key);

// Trigger alerts
const { data: alertData } = await supabase
  .rpc('trigger_hitl_alerts');
console.log(`Triggered ${alertData[0].alert_count} alerts for ${alertData[0].affected_deals} deals`);

// Expire old records
const { data: expireData } = await supabase
  .rpc('expire_old_pending_advances');
console.log(`Expired ${expireData[0].expired_count} old pending advances`);
```

---

## 4. Integrating with External Monitoring

### Vercel Analytics

1. **Deployment Monitoring**: Add health check
   - Settings → Monitoring → Health Checks
   - Endpoint: `https://nossocrm.vercel.app/api/health`
   - Frequency: Every 60s
   - Alerts: If unhealthy for >5 min

2. **Edge Function Monitoring**
   - Supabase → Edge Functions → Logs
   - Filter by function name: `messaging-webhook-*`
   - Track invocation count, error rate, latency

### DataDog / New Relic (if enabled)

```typescript
// Log structured event to monitoring service
import { datadog } from '@datadog/browser-logs';

if (process.env.DATADOG_KEY) {
  datadog.setUser({
    id: userId,
    org_id: orgId,
  });

  // Send all structured logs automatically
  datadog.logger.info(JSON.stringify({
    event: 'ai.response',
    tokens_used: 245,
    latency_ms: 1250,
  }));
}
```

### Slack Alerts

Post to #ops-alerts when:
1. Health check returns 503 for >5 min
2. HITL alerts spike (>10 in 6h)
3. Token budget >80% of monthly quota

Example webhook:
```bash
#!/bin/bash
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK \
  -d '{
    "text": "⚠️ HITL Bottleneck",
    "blocks": [{
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*9 pending approvals* older than 24h\nOrg: Acme Inc (org-123)\nOldest: 2026-04-08 10:30 UTC"
      }
    }]
  }'
```

---

## 5. Runbooks

### Alert: "High Error Rate on AI Responses"
**Trigger**: `ai.error` rate >5% in last 5 min

**Investigation**:
1. Check Google Generative AI status page: https://status.ai.google.dev
2. Verify API key in `organization_settings.ai_google_key`
3. Check Vercel logs for error patterns: `event="ai.error"`
4. If failover misconfigured, check `provider-failover.ts`

**Resolution**:
- If provider down: Wait for provider recovery
- If API key invalid: Update in Settings → AI
- If timeout: Increase `generateWithFailover` timeout

---

### Alert: "HITL Pending Approvals >24h"
**Trigger**: `hitl_alert` in `deal_activities` for org

**Investigation**:
1. Query view: `SELECT * FROM vw_hitl_pending_by_age WHERE org_id = ?`
2. Identify old records: `SELECT * FROM ai_pending_stage_advances WHERE status='pending' AND created_at < NOW() - '24h'`
3. Check if sales team is away or backlogged

**Resolution**:
- Auto-approve if confidence >0.85 (already configured)
- Reach out to sales ops to clear backlog
- Review HITL threshold in `organization_settings.ai_hitl_threshold`

---

### Alert: "Token Budget Exceeded"
**Trigger**: `ai.budget_exceeded` event

**Investigation**:
1. Check current usage: `SELECT SUM(tokens_used) FROM ai_conversation_log WHERE DATE(created_at) >= current_date - 30`
2. Identify high-volume orgs: `SELECT org_id, SUM(tokens_used) FROM ai_conversation_log GROUP BY org_id ORDER BY 2 DESC`
3. Review model usage: `SELECT model_used, COUNT(*), AVG(tokens_used) FROM ai_conversation_log GROUP BY model_used`

**Resolution**:
- Increase monthly quota in `organization_settings.ai_token_limit`
- Optimize prompts to reduce token consumption
- Consider cheaper model (e.g., Gemini 1.5 Flash instead of Pro)

---

## 6. Dashboards

### Grafana / Vercel Dashboard Query Examples

**AI Response Rate (req/min)**:
```sql
SELECT 
  DATE_TRUNC('minute', timestamp) as minute,
  COUNT(*) as request_count
FROM logs
WHERE message CONTAINS '"event":"ai.response"'
GROUP BY minute
ORDER BY minute DESC
LIMIT 60
```

**Error Rate %**:
```sql
SELECT 
  DATE_TRUNC('minute', timestamp) as minute,
  100 * SUM(CASE WHEN message CONTAINS '"event":"ai.error"' THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as error_pct
FROM logs
WHERE message CONTAINS '"event":"ai.'
GROUP BY minute
```

**Token Usage Trend**:
```sql
SELECT 
  DATE(timestamp) as date,
  SUM((message->'tokens_used')::INT) as total_tokens
FROM logs
WHERE message CONTAINS '"event":"ai.response"'
GROUP BY date
ORDER BY date DESC
LIMIT 30
```

**HITL Bottleneck**:
```sql
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as alerts_triggered
FROM logs
WHERE message CONTAINS '"event":"hitl_alert"'
GROUP BY hour
ORDER BY hour DESC
```

---

## 7. Implementation Checklist

- [x] Structured logging in `lib/ai/agent/structured-logger.ts`
- [x] Integration in `lib/ai/agent/agent.service.ts`
- [x] Health check endpoint `app/api/health/route.ts`
- [x] HITL alerting functions in migration `20260409120000_hitl_pending_alerts.sql`
- [x] pg_cron jobs (automatic if extension available)
- [ ] Vercel health check integration (manual in dashboard)
- [ ] Slack alerts webhook (ops team to configure)
- [ ] Grafana dashboards (if using Grafana)
- [ ] SLO definitions (99.5% uptime, <1000ms p99 latency)

---

## 8. Cost Optimization

### Token Budget Tracking

Monitor token efficiency by organization:

```sql
SELECT 
  org_id,
  COUNT(*) as total_responses,
  SUM(tokens_used) as total_tokens,
  AVG(tokens_used) as avg_tokens_per_response,
  MAX(tokens_used) as max_tokens,
  DATE(created_at) as date
FROM ai_conversation_log
WHERE created_at >= DATE_TRUNC('day', NOW())
GROUP BY org_id, date
ORDER BY total_tokens DESC
LIMIT 20
```

### Cost Per Response

Assuming Google Gemini pricing (as of 2026-04-09):
- Input: $0.075 / 1M tokens
- Output: $0.30 / 1M tokens

Typical response: 200 input tokens + 50 output tokens = ~$0.000021 per response

For org with 10k responses/month:
- Cost: ~$0.21/month (negligible)
- Best case: Stay under $100/month with 2M token budget

---

## 9. References

- **Vercel Logs**: https://vercel.com/docs/observability/logs
- **Structured Logging**: https://www.kartar.net/2015/12/structured-logging/
- **Google Generative AI**: https://ai.google.dev/docs
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **pg_cron**: https://github.com/citusdata/pg_cron

---

**Last Updated**: 2026-04-09  
**Next Review**: 2026-05-09 (30 days)
