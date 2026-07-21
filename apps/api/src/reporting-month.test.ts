import assert from "node:assert/strict";
import test from "node:test";
import {
  isTimestampInReportingMonth,
  parseReportingMonth,
  REPORTING_TIMEZONE,
} from "@looper/types";

test("canonical reporting month resolves July boundaries in Taiwan", () => {
  assert.deepEqual(parseReportingMonth("2026-07"), {
    reportMonth: "2026-07",
    timezone: "Asia/Taipei",
    startAtInclusive: "2026-06-30T16:00:00.000Z",
    endAtExclusive: "2026-07-31T16:00:00.000Z",
  });
  assert.equal(REPORTING_TIMEZONE, "Asia/Taipei");
});

test("canonical reporting month resolves January and December across years", () => {
  assert.deepEqual(parseReportingMonth("2026-01"), {
    reportMonth: "2026-01",
    timezone: "Asia/Taipei",
    startAtInclusive: "2025-12-31T16:00:00.000Z",
    endAtExclusive: "2026-01-31T16:00:00.000Z",
  });
  assert.deepEqual(parseReportingMonth("2026-12"), {
    reportMonth: "2026-12",
    timezone: "Asia/Taipei",
    startAtInclusive: "2026-11-30T16:00:00.000Z",
    endAtExclusive: "2026-12-31T16:00:00.000Z",
  });
});

test("canonical reporting month uses inclusive start and exclusive end", () => {
  const period = parseReportingMonth("2026-07");

  assert.equal(isTimestampInReportingMonth("2026-06-30T16:00:00.000Z", period), true);
  assert.equal(isTimestampInReportingMonth("2026-07-31T15:59:59.999Z", period), true);
  assert.equal(isTimestampInReportingMonth("2026-07-31T16:00:00.000Z", period), false);
  assert.equal(isTimestampInReportingMonth("2026-06-30T15:59:59.999Z", period), false);
});

test("canonical reporting month rejects invalid month values and formats", () => {
  const invalidValues = [
    "2026-00",
    "2026-13",
    "2026-7",
    "2026-07-01",
    "",
    " 2026-07",
    "2026-07 ",
    "2026-07\n",
    "2026-07\t",
    "2026-07x",
  ];

  for (const value of invalidValues) {
    assert.throws(() => parseReportingMonth(value), RangeError, value);
  }
});

test("canonical reporting month does not use the process timezone", () => {
  const originalTimezone = process.env.TZ;

  try {
    process.env.TZ = "Pacific/Honolulu";
    const honoluluResult = parseReportingMonth("2026-07");
    process.env.TZ = "America/New_York";
    const newYorkResult = parseReportingMonth("2026-07");

    assert.deepEqual(newYorkResult, honoluluResult);
    assert.equal(newYorkResult.startAtInclusive, "2026-06-30T16:00:00.000Z");
    assert.equal(newYorkResult.endAtExclusive, "2026-07-31T16:00:00.000Z");
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }
});

test("canonical reporting month requires timestamps with an explicit timezone", () => {
  const period = parseReportingMonth("2026-07");

  assert.equal(isTimestampInReportingMonth("2026-07-01T00:00:00+08:00", period), true);
  assert.throws(
    () => isTimestampInReportingMonth("2026-07-01T00:00:00", period),
    RangeError,
  );
  assert.throws(() => isTimestampInReportingMonth("not-a-date", period), RangeError);
});
