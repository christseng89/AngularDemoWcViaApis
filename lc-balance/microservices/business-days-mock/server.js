'use strict';

const express = require('express');
const calendar = require('./data/calendar.json');

/**
 * business-days-mock — a local, deliberately SIMPLE stand-in for a real business-day calendar service,
 * built for `lc-balance/`'s own F1 proposal §13.5 "Auto Close Grace Period" Phase 2 (see
 * ../../analysis/standing-microservice-reference/Auto-Close-Grace-Period-Business-Day-Requirement.md for
 * the actual requirement this implements — AUTO CLOSE only, not AUTO EXPIRY).
 *
 * Deliberately NOT a copy of `lc-balance-new/microservices/standing-mock` (that project's own mock, built
 * for a different feature — A6/B4 Calculated Maturity Date, a multi-party payment-settlement calculation
 * with calendar roles/combination rules/Business Day Conventions) — AUTO CLOSE has no counterparty at
 * all, so this mock intentionally has none of that: ONE calendar (`data/calendar.json`, the bank's own
 * single domestic operating calendar), ONE endpoint, ONE simple question answered — "add N business days
 * to this date."
 *
 * Implements ONLY `POST /business-days/add`. Not implemented (genuinely out of scope for this feature,
 * not just deferred): `POST /business-days/adjust` (calendar-adjusting an already-known date — that's
 * the Maturity Date use case), any multi-calendar/role/combination-rule concept, calendar-snapshot
 * versioning, OAuth2/scopes, correlation-ID/retry machinery.
 *
 * Matches `microservices/balance-component/src/domain/autoCloseGracePeriod.ts`'s own `addBusinessDays()`
 * shape exactly (same skip-weekend-then-holiday walk) — this mock is what a real Phase 2
 * `addBusinessDays()` implementation would call over HTTP instead of computing in-process; not yet wired
 * into `balanceService.ts` (Phase 1's own weekend-only mock still runs there).
 */

const PORT = process.env.PORT || 4500;
const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_WALK_DAYS = 3650; // safety cap (~10 years) so a misconfigured/huge businessDays value can't hang the request

function parseDateUTC(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/** Reason this date isn't a business day on `calendar`, or null if it is one. */
function nonBusinessDayReason(dateStr, date) {
  const weekday = WEEKDAY_CODES[date.getUTCDay()];
  if (calendar.weekendDays.includes(weekday)) {
    return { reasonCode: 'WEEKEND', reasonDescription: `Weekend (${weekday})` };
  }
  const holiday = calendar.holidays.find((h) => h.date === dateStr);
  if (holiday) {
    return { reasonCode: 'PUBLIC_HOLIDAY', reasonDescription: holiday.name };
  }
  return null;
}

/** Walk forward from `date`, counting business days, until `businessDays` of them have been consumed. */
function addBusinessDays(date, businessDays) {
  const skippedDates = [];
  let remaining = businessDays;
  let current = date;
  for (let i = 0; i < MAX_WALK_DAYS && remaining > 0; i++) {
    current = addDaysUTC(current, 1);
    const dateStr = formatDateUTC(current);
    const reason = nonBusinessDayReason(dateStr, current);
    if (reason) {
      skippedDates.push({ date: dateStr, ...reason });
    } else {
      remaining -= 1;
    }
  }
  return { adjustedDate: formatDateUTC(current), skippedDates, exhausted: remaining > 0 };
}

const app = express();
app.use(express.json());

app.post('/business-days/add', (req, res) => {
  const body = req.body || {};
  const { date, businessDays } = body;

  const dateObj = parseDateUTC(date);
  if (!dateObj) {
    return res.status(400).json({ errorCode: 'INVALID_DATE_FORMAT', message: 'date must be YYYY-MM-DD' });
  }
  if (!Number.isInteger(businessDays) || businessDays < 0) {
    return res.status(400).json({ errorCode: 'INVALID_BUSINESS_DAYS', message: 'businessDays must be a non-negative integer' });
  }

  const result = addBusinessDays(dateObj, businessDays);
  if (result.exhausted) {
    return res.status(422).json({ errorCode: 'CALENDAR_WALK_EXHAUSTED', message: `Could not resolve ${businessDays} business days within the allowed search window` });
  }

  res.status(200).json({
    date,
    businessDays,
    calendarCode: calendar.code,
    adjustedDate: result.adjustedDate,
    skippedDates: result.skippedDates,
  });
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok', calendarCode: calendar.code }));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`business-days-mock listening on http://localhost:${PORT} (POST /business-days/add only, calendar=${calendar.code})`);
  });
}

module.exports = app;
