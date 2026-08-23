'use strict';

const express = require('express');
const crypto = require('crypto');
const calendarData = require('./data/calendars.json');

/**
 * standing-mock — a local, deliberately SIMPLIFIED stand-in for the external Standing microservice
 * described in ../../analysis/maturity_date/Standing_Microservice_Maturity_Date_OAS_Design.md (v2.10.0).
 * Built so lc-balance's A6/B4 Calculated Maturity Date work (see Maturity-Date-Business-Day-Convention-
 * Decision-Request.md, resolved 2026-08-23) has something real to call in dev/demo without a live Standing
 * instance — swap the base URL for a real one later, the request/response shape below follows the OAS.
 *
 * Implements ONLY `POST /business-days/adjust` — the one endpoint A6/B4's Maturity Date calc needs
 * (compute a calendar-adjusted date from a candidate sourceDate). Deliberately NOT implemented (out of
 * scope for a local demo mock, see the design doc's own §3.10/§3.4/§3.3 for what real Standing does here):
 * `POST /business-days/add`, the 5 read-only reference-data GET endpoints, OAuth2/scopes, calendarSnapshotId/
 * asOfDateTime historical versioning (every response uses a fixed `calendarSnapshotId: 'mock-snapshot-v1'`),
 * force-majeure/closure-status tracking (`data/calendars.json` has no such records, so that branch of the
 * OAS's `CalendarAssessment` shape never fires here), and `X-Correlation-ID`/retry/timeout machinery.
 * `contractualDateChanged` is still always `false`, and `calendarAssessments`/`adjustedDateAssessments`/
 * `skippedDates`/`combinationRuleApplied`/`conventionApplied` are still populated — those are what make the
 * response usable as a real Maturity Date result, not just a bare date.
 */

const PORT = process.env.PORT || 4400;
const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CONVENTIONS = new Set(['FOLLOWING', 'PRECEDING', 'MODIFIED_FOLLOWING', 'MODIFIED_PRECEDING', 'NEAREST']);
const COMBINATION_RULES = new Set(['ALL_REQUIRED_OPEN', 'ANY_ELIGIBLE_OPEN']);
const MAX_WALK_DAYS = 60; // safety cap so a misconfigured calendar (e.g. every day a holiday) can't hang the request

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

function findCalendar(calendarType, code) {
  return calendarData.calendars.find((c) => c.calendarType === calendarType && c.code === code) || null;
}

/** Assess a single date against a single requested calendar reference ({calendarType, code, role, required, pathGroup}). */
function assessOne(dateStr, ref) {
  const calendar = findCalendar(ref.calendarType, ref.code);
  if (!calendar) {
    return { error: { errorCode: 'CALENDAR_NOT_CONFIGURED', calendarType: ref.calendarType, calendarCode: ref.code } };
  }
  const date = parseDateUTC(dateStr);
  const weekday = WEEKDAY_CODES[date.getUTCDay()];
  const isWeekend = calendar.weekendDays.includes(weekday);
  const holiday = calendar.holidays.find((h) => h.date === dateStr);
  const businessDay = !isWeekend && !holiday;
  const assessment = {
    calendarType: ref.calendarType,
    code: ref.code,
    role: ref.role,
    date: dateStr,
    businessDay,
    calendarVersion: 'mock-v1',
  };
  if (!businessDay) {
    assessment.reasonCode = isWeekend ? 'WEEKEND' : 'PUBLIC_HOLIDAY';
    assessment.reasonDescription = isWeekend ? `Weekend (${weekday}) per ${ref.code}'s own weekendDays` : holiday.name;
  }
  return { assessment };
}

/** Assess a date against every requested calendar. Returns {assessments} or {error} on the first unconfigured calendar. */
function assessAll(dateStr, calendars) {
  const assessments = [];
  for (const ref of calendars) {
    const { assessment, error } = assessOne(dateStr, ref);
    if (error) return { error };
    assessments.push(assessment);
  }
  return { assessments };
}

/**
 * §3.2 of the design doc: ALL_REQUIRED_OPEN requires every `required !== false` calendar open, pathGroup or
 * not. ANY_ELIGIBLE_OPEN additionally requires every ungrouped required calendar open, but only ONE
 * pathGroup (not every calendar) needs to be fully open. Simplified from the real spec's own
 * SERVER-ENFORCED `ANY_ELIGIBLE_OPEN` completeness check (§3.16) — this mock does not validate that a
 * `pathGroup` is itself a product-approved alternate route, only that its member calendars are all open.
 */
function isOverallOpen(assessments, calendars, combinationRule) {
  const requiredUngrouped = assessments.filter((a, i) => calendars[i].required !== false && !calendars[i].pathGroup);
  if (requiredUngrouped.some((a) => !a.businessDay)) return false;
  if (combinationRule === 'ALL_REQUIRED_OPEN') {
    const requiredGrouped = assessments.filter((a, i) => calendars[i].required !== false && calendars[i].pathGroup);
    return requiredGrouped.every((a) => a.businessDay);
  }
  // ANY_ELIGIBLE_OPEN
  const groups = new Map();
  calendars.forEach((ref, i) => {
    if (!ref.pathGroup) return;
    if (!groups.has(ref.pathGroup)) groups.set(ref.pathGroup, []);
    groups.get(ref.pathGroup).push(assessments[i]);
  });
  if (groups.size === 0) return true; // no alternate paths offered — ungrouped-required check above already covers everything
  return [...groups.values()].some((group) => group.every((a) => a.businessDay));
}

/** Walk from sourceDate per `convention`, returning {adjustedDate, skippedDates} or {conflict: true}. */
function walkToBusinessDay(sourceDate, calendars, combinationRule, convention) {
  const skippedDates = [];

  function checkDay(date) {
    const dateStr = formatDateUTC(date);
    const { assessments } = assessAll(dateStr, calendars); // caller already validated calendars exist
    return { dateStr, open: isOverallOpen(assessments, calendars, combinationRule), assessments };
  }

  function walkDirection(startDate, stepDays, withinMonth) {
    let date = startDate;
    for (let i = 0; i < MAX_WALK_DAYS; i++) {
      const { dateStr, open, assessments } = checkDay(date);
      if (open) return { dateStr };
      if (dateStr !== formatDateUTC(sourceDate)) skippedDates.push(buildSkipped(dateStr, assessments));
      date = addDaysUTC(date, stepDays);
      if (withinMonth && date.getUTCMonth() !== startDate.getUTCMonth()) return null;
    }
    return null;
  }

  function buildSkipped(dateStr, assessments) {
    const closed = assessments.find((a) => !a.businessDay);
    return { date: dateStr, reasonCode: closed ? closed.reasonCode : 'PUBLIC_HOLIDAY', reasonDescription: closed ? closed.reasonDescription : undefined };
  }

  if (convention === 'FOLLOWING') {
    const result = walkDirection(sourceDate, 1, false);
    return result ? { adjustedDate: result.dateStr, skippedDates } : { conflict: true };
  }
  if (convention === 'PRECEDING') {
    const result = walkDirection(sourceDate, -1, false);
    return result ? { adjustedDate: result.dateStr, skippedDates } : { conflict: true };
  }
  if (convention === 'MODIFIED_FOLLOWING') {
    const forward = walkDirection(sourceDate, 1, true);
    if (forward) return { adjustedDate: forward.dateStr, skippedDates };
    const backward = walkDirection(sourceDate, -1, true);
    return backward ? { adjustedDate: backward.dateStr, skippedDates } : { conflict: true };
  }
  if (convention === 'MODIFIED_PRECEDING') {
    const backward = walkDirection(sourceDate, -1, true);
    if (backward) return { adjustedDate: backward.dateStr, skippedDates };
    const forward = walkDirection(sourceDate, 1, true);
    return forward ? { adjustedDate: forward.dateStr, skippedDates } : { conflict: true };
  }
  // NEAREST — check both directions at the same distance each step; tie-break PRECEDING (design doc §3.7/UAT-19)
  for (let d = 1; d <= MAX_WALK_DAYS; d++) {
    const back = checkDay(addDaysUTC(sourceDate, -d));
    const fwd = checkDay(addDaysUTC(sourceDate, d));
    if (back.dateStr !== formatDateUTC(sourceDate)) skippedDates.push(buildSkipped(back.dateStr, back.assessments));
    if (fwd.dateStr !== formatDateUTC(sourceDate)) skippedDates.push(buildSkipped(fwd.dateStr, fwd.assessments));
    if (back.open) return { adjustedDate: back.dateStr, skippedDates };
    if (fwd.open) return { adjustedDate: fwd.dateStr, skippedDates };
  }
  return { conflict: true };
}

const app = express();
app.use(express.json());

app.post('/business-days/adjust', (req, res) => {
  const body = req.body || {};
  const { sourceDate, sourceDateType, calculationPurpose, calendars, combinationRule, convention } = body;

  if (!sourceDate || !parseDateUTC(sourceDate)) {
    return res.status(400).json({ errorCode: 'INVALID_DATE_FORMAT', message: 'sourceDate must be YYYY-MM-DD', correlationId: crypto.randomUUID(), retryable: false });
  }
  if (!Array.isArray(calendars) || calendars.length === 0) {
    return res
      .status(400)
      .json({ errorCode: 'INVALID_CALENDAR_REFERENCE', message: 'calendars[] must be a non-empty array', correlationId: crypto.randomUUID(), retryable: false });
  }
  if (!COMBINATION_RULES.has(combinationRule)) {
    return res
      .status(400)
      .json({ errorCode: 'INVALID_COMBINATION_RULE', message: `combinationRule must be one of ${[...COMBINATION_RULES].join('/')}`, correlationId: crypto.randomUUID(), retryable: false });
  }
  if (!CONVENTIONS.has(convention)) {
    return res
      .status(400)
      .json({ errorCode: 'INVALID_CALENDAR_REFERENCE', message: `convention must be one of ${[...CONVENTIONS].join('/')}`, correlationId: crypto.randomUUID(), retryable: false });
  }
  // §3.1: sourceDateType=CONTRACTUAL_MATURITY_DATE must pair with calculationPurpose=OPERATIONAL_PAYMENT_DATE (UAT-23/UAT-24)
  if (sourceDateType === 'CONTRACTUAL_MATURITY_DATE' && calculationPurpose !== 'OPERATIONAL_PAYMENT_DATE') {
    return res.status(400).json({
      errorCode: 'INVALID_DATE_PURPOSE_COMBINATION',
      message: 'sourceDateType=CONTRACTUAL_MATURITY_DATE requires calculationPurpose=OPERATIONAL_PAYMENT_DATE',
      correlationId: crypto.randomUUID(),
      retryable: false,
    });
  }

  const sourceDateObj = parseDateUTC(sourceDate);
  const sourceAssessment = assessAll(sourceDate, calendars);
  if (sourceAssessment.error) {
    return res.status(422).json({ ...sourceAssessment.error, message: `No configured ${sourceAssessment.error.calendarType}/${sourceAssessment.error.calendarCode} calendar in this mock's data/calendars.json`, correlationId: crypto.randomUUID(), retryable: false });
  }

  const sourceOpen = isOverallOpen(sourceAssessment.assessments, calendars, combinationRule);
  const walked = sourceOpen ? { adjustedDate: sourceDate, skippedDates: [] } : walkToBusinessDay(sourceDateObj, calendars, combinationRule, convention);
  if (walked.conflict) {
    return res.status(409).json({
      errorCode: 'CALENDAR_CONFLICT',
      message: `${convention} could not resolve to an open date within the allowed search window`,
      correlationId: crypto.randomUUID(),
      retryable: false,
    });
  }

  const adjustedAssessment = walked.adjustedDate === sourceDate ? sourceAssessment : assessAll(walked.adjustedDate, calendars);
  const adjustmentDays = Math.round((parseDateUTC(walked.adjustedDate).getTime() - sourceDateObj.getTime()) / 86400000);

  res.status(200).json({
    calculationId: crypto.randomUUID(),
    sourceDate,
    sourceDateType,
    calculationPurpose,
    adjustedDate: walked.adjustedDate,
    wasAdjusted: walked.adjustedDate !== sourceDate,
    adjustmentDays,
    contractualDateChanged: false,
    combinationRuleApplied: combinationRule,
    conventionApplied: convention,
    calendarSnapshotId: 'mock-snapshot-v1',
    calendarVersions: calendars.map((c) => ({ calendarType: c.calendarType, code: c.code, version: 'mock-v1' })),
    calendarAssessments: sourceAssessment.assessments,
    adjustedDateAssessments: adjustedAssessment.assessments,
    skippedDates: walked.skippedDates,
    warnings: [],
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`standing-mock listening on http://localhost:${PORT} (POST /business-days/adjust only — see server.js header comment for scope)`);
  });
}

module.exports = app;
