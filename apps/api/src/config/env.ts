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
  appPublicUrl: process.env.APP_PUBLIC_URL ?? process.env.WEB_PUBLIC_URL ?? "http://localhost:5175",
  databaseUrl: required("DATABASE_URL", "postgresql://test:test@localhost:5432/test"),
  jwtSecret: required("JWT_SECRET", "test-secret"),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  aiPrimaryProvider: process.env.AI_PRIMARY_PROVIDER ?? "gemini",
  aiFallbackProvider: process.env.AI_FALLBACK_PROVIDER,
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 120000),
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL,
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL,
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  systemSettingsEncryptionKey: process.env.SYSTEM_SETTINGS_ENCRYPTION_KEY,
  jwtAccessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL ?? "12h",
  jwtRefreshTokenDays: Number(process.env.JWT_REFRESH_TOKEN_DAYS ?? 365),
  reminderCron: process.env.REMINDER_CRON ?? "*/30 * * * *",
  morningBriefingCron: process.env.MORNING_BRIEFING_CRON ?? "30 4 * * *",
  morningBriefingTimezone: process.env.MORNING_BRIEFING_TIMEZONE ?? "Asia/Bangkok",
  sentimentCron: process.env.SENTIMENT_CRON ?? "0 2 * * *",
  feelingLogBatchCron: process.env.FEELING_LOG_BATCH_CRON ?? "0 2 * * *",
  feelingLogBatchTimezone: process.env.FEELING_LOG_BATCH_TIMEZONE ?? "Asia/Bangkok",
  feelingLogBatchIntervalDays: Number(process.env.FEELING_LOG_BATCH_INTERVAL_DAYS ?? 3),
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
  vapidSubject: process.env.VAPID_SUBJECT,
  asrBaseUrl: process.env.ASR_BASE_URL?.trim() || "",
  asrApiKey: process.env.ASR_API_KEY?.trim() || "",
  /** Remote Whisper/ASR call timeout (default 6h). Keep nginx `/ai/` proxy_read_timeout above this. */
  asrRequestTimeoutMs: Number(process.env.ASR_REQUEST_TIMEOUT_MS ?? 6 * 60 * 60 * 1000),
  /** Multipart audio upload limit — align with nginx `client_max_body_size` and ASR_MAX_UPLOAD_BYTES. */
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 500 * 1024 * 1024)
};
