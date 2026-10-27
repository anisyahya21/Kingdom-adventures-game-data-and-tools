import {
  AUTOMATION_USER_AGENT_PATTERN,
  isAnalyticsOrigin,
  isAutomationUserAgent,
} from "../../../kingdom-adventures/src/lib/analytics-policy";
export { isAnalyticsOrigin, isAutomationUserAgent };

// Constant policy only; no request data is interpolated into SQL.
export const HUMAN_TRAFFIC_SQL = `nullif(trim(analytics_events.user_agent),'') IS NOT NULL
  AND analytics_events.user_agent !~* '${AUTOMATION_USER_AGENT_PATTERN}'
  AND NOT EXISTS (SELECT 1 FROM analytics_traffic_exclusions excluded WHERE excluded.event_id=analytics_events.event_id)`;
