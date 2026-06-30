import { createApp } from "./app";
import { env } from "./config/env";
import { startCommunicationSentimentScheduler } from "./services/communicationSentimentService";
import { startReminderScheduler } from "./services/reminderService";

const app = createApp();

app.listen(env.port, "::", () => {
  console.log(`API listening on port ${env.port}`);
  startReminderScheduler();
  startCommunicationSentimentScheduler();
});
