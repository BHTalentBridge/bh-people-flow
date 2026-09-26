-- Tickets can come from any tracker, not just Jira. Rename rather than
-- add-and-copy, so existing values carry over untouched.
ALTER TABLE "Task" RENAME COLUMN "jiraId" TO "ticketId";
ALTER TABLE "Task" RENAME COLUMN "jiraUrl" TO "ticketUrl";
