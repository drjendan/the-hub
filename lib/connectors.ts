/**
 * Curated connector catalog. An agent stores the selected connector *keys* in
 * agents.connectors (jsonb string[]). Actual connector execution is wired up
 * later — for now this is metadata describing what the agent is meant to reach.
 */
export interface ConnectorDef {
  key: string;
  label: string;
  category: string;
}

export const CONNECTORS: ConnectorDef[] = [
  { key: "gmail", label: "Gmail", category: "Email" },
  { key: "outlook", label: "Outlook", category: "Email" },
  { key: "slack", label: "Slack", category: "Messaging" },
  { key: "teams", label: "Microsoft Teams", category: "Messaging" },
  { key: "google_drive", label: "Google Drive", category: "Files" },
  { key: "sharepoint", label: "SharePoint", category: "Files" },
  { key: "notion", label: "Notion", category: "Knowledge" },
  { key: "confluence", label: "Confluence", category: "Knowledge" },
  { key: "salesforce", label: "Salesforce", category: "CRM" },
  { key: "hubspot", label: "HubSpot", category: "CRM" },
  { key: "zendesk", label: "Zendesk", category: "Support" },
  { key: "jira", label: "Jira", category: "Project" },
  { key: "github", label: "GitHub", category: "Dev" },
  { key: "netsuite", label: "NetSuite", category: "Finance" },
  { key: "quickbooks", label: "QuickBooks", category: "Finance" },
  { key: "greenhouse", label: "Greenhouse", category: "HR" },
  { key: "google_calendar", label: "Google Calendar", category: "Calendar" },
  { key: "web_search", label: "Web Search", category: "Research" },
  { key: "http_api", label: "Generic HTTP API", category: "Custom" },
];

const BY_KEY = new Map(CONNECTORS.map((c) => [c.key, c]));

/** Human label for a connector key (falls back to the key itself). */
export function connectorLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/** Keep only keys that exist in the catalog. */
export function sanitizeConnectors(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return Array.from(
    new Set(keys.filter((k): k is string => typeof k === "string" && BY_KEY.has(k)))
  );
}
