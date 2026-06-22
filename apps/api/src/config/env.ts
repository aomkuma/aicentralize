import dotenv from "dotenv";

dotenv.config();

const isTest = process.env.NODE_ENV === "test";

function required(name: string, testFallback?: string): string {
  const value = process.env[name];
  if (value) {
    return value;
  }

  if (isTest && testFallback) {
    return testFallback;
  }

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgresql://test:test@localhost:5432/test"),
  jwtSecret: required("JWT_SECRET", "test-secret"),
  jwtAccessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL ?? "12h",
  jwtRefreshTokenDays: Number(process.env.JWT_REFRESH_TOKEN_DAYS ?? 365),
  reminderCron: process.env.REMINDER_CRON ?? "*/30 * * * *",
  reminderLookAheadHours: Number(process.env.REMINDER_LOOKAHEAD_HOURS ?? 24),
  reminderDedupeHours: Number(process.env.REMINDER_DEDUPE_HOURS ?? 24),
  reminderOverdueShortAfterHours: Number(process.env.REMINDER_OVERDUE_SHORT_AFTER_HOURS ?? 24),
  reminderOverdueEscalateAfterHours: Number(process.env.REMINDER_OVERDUE_ESCALATE_AFTER_HOURS ?? 72),
  reminderOverdueShortIntervalHours: Number(process.env.REMINDER_OVERDUE_SHORT_INTERVAL_HOURS ?? 24),
  reminderOverdueEscalateIntervalHours: Number(process.env.REMINDER_OVERDUE_ESCALATE_INTERVAL_HOURS ?? 48),
  reminderEscalationFallbackEmail: process.env.REMINDER_ESCALATION_FALLBACK_EMAIL,
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  aiSimilarityThreshold: Number(process.env.AI_SIMILARITY_THRESHOLD ?? 0.2),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpSecure: process.env.SMTP_SECURE === "true",
  mailFrom: process.env.MAIL_FROM ?? "noreply@aicentralize.local",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidSubject: process.env.VAPID_SUBJECT
};
