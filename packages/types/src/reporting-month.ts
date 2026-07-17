export const REPORTING_TIMEZONE = "Asia/Taipei" as const;

export interface ReportingMonthPeriod {
  reportMonth: string;
  timezone: typeof REPORTING_TIMEZONE;
  startAtInclusive: string;
  endAtExclusive: string;
}

const REPORT_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])(?![\s\S])/;
const ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})(?![\s\S])/;

const reportingDateTimeFormatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory", {
  timeZone: REPORTING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function utcMilliseconds(parts: DateTimeParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

function partsInReportingTimezone(timestamp: number): DateTimeParts {
  const values = new Map(
    reportingDateTimeFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function reportingMonthStartMilliseconds(year: number, month: number): number {
  const expected = utcMilliseconds({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
  let candidate = expected;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = utcMilliseconds(partsInReportingTimezone(candidate));
    const adjustment = expected - actual;
    candidate += adjustment;

    if (adjustment === 0) {
      return candidate;
    }
  }

  throw new RangeError(`Unable to resolve reporting month boundary in ${REPORTING_TIMEZONE}`);
}

export function parseReportingMonth(reportMonth: string): ReportingMonthPeriod {
  const match = REPORT_MONTH_PATTERN.exec(reportMonth);
  if (!match) {
    throw new RangeError("reportMonth must use the exact YYYY-MM format with a month from 01 to 12");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  return {
    reportMonth,
    timezone: REPORTING_TIMEZONE,
    startAtInclusive: new Date(reportingMonthStartMilliseconds(year, month)).toISOString(),
    endAtExclusive: new Date(reportingMonthStartMilliseconds(nextMonthYear, nextMonth)).toISOString(),
  };
}

export function isTimestampInReportingMonth(
  timestamp: string,
  period: ReportingMonthPeriod,
): boolean {
  if (!ISO_TIMESTAMP_WITH_TIMEZONE_PATTERN.test(timestamp)) {
    throw new RangeError("timestamp must be an ISO timestamp with an explicit timezone");
  }

  const timestampMilliseconds = Date.parse(timestamp);
  if (!Number.isFinite(timestampMilliseconds)) {
    throw new RangeError("timestamp must be a valid ISO timestamp");
  }

  return timestampMilliseconds >= Date.parse(period.startAtInclusive)
    && timestampMilliseconds < Date.parse(period.endAtExclusive);
}
