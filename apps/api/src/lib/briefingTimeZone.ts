import { env } from "../config/env";

export function getBriefingTimeZone(): string {
  return env.morningBriefingTimezone || "Asia/Bangkok";
}

function getZonedYmd(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0")
  };
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  );

  return asUtc - date.getTime();
}

/** Midnight on the briefing calendar day in the configured timezone (default Asia/Bangkok). */
export function startOfBriefingDay(date: Date, timeZone = getBriefingTimeZone()): Date {
  const { year, month, day } = getZonedYmd(date, timeZone);
  const utcMidnightGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMs = getTimezoneOffsetMs(new Date(utcMidnightGuess), timeZone);
  return new Date(utcMidnightGuess - offsetMs);
}
