# -*- coding: utf-8 -*-
"""
Schema contract tests for standing-calendar-service.oas.yaml.

Usage:
    python validate_semantics.py [path/to/standing-calendar-service.oas.yaml]

If no path is given, defaults to the file of that name next to this script,
so it works out of the box in this delivery folder and also when copied
into a repo/CI job alongside the YAML.

Scope note: this script only tests what a JSON Schema validator can catch.
Several rules in the spec are documented as SERVICE- or GATEWAY-enforced,
not schema-enforced, because OpenAPI 3.0.3's Schema Object (a Draft-4
compatible subset) cannot express them declaratively:
  - ANY_ELIGIBLE_OPEN requiring at least one pathGroup present in calendars[]
    (needs JSON Schema `contains`, draft-06+)
  - the standing.calendars.institution.read scope requirement (OpenAPI
    `security:` cannot condition a scope on request-body content)
  - that every HTTP response actually carries an X-Correlation-ID header at
    runtime (the schema declares the header; only a live HTTP test, not a
    JSON payload validator, can confirm a real response sends it)
These are called out in the design doc's test-pyramid section (Schema
tests / Service tests / Gateway tests / Integration tests / UAT) as the
job of a different test layer, not this script.

Round 7: `format: date` / `format: date-time` are now actually checked
(previously declared in the schema but never enforced by this script --
see the FORMAT_CHECKER note below for why the generic jsonschema
FormatChecker() is used instead of Draft4Validator.FORMAT_CHECKER).
"""
import argparse
import copy
import sys
from pathlib import Path

import yaml
from jsonschema import Draft4Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT4

# Round 7 note: we deliberately use the generic jsonschema.FormatChecker()
# here, NOT Draft4Validator.FORMAT_CHECKER. The reviewer's round-7 suggestion
# was `format_checker=Draft4Validator.FORMAT_CHECKER`, but that object only
# registers checkers for {date-time, email, idn-email, ipv4, ipv6, regex} --
# 'date' is not part of the Draft 4 format vocabulary, so it would silently
# NOT catch the reviewer's own example (sourceDate="2026-02-30"), since every
# date-only field in this spec uses `format: date`, not `format: date-time`.
# The generic FormatChecker() additionally registers 'date' (and 'time',
# 'uuid'), so it actually rejects invalid calendar dates as well as invalid
# timestamps. Verified directly: Draft4Validator.FORMAT_CHECKER lets
# {"d": "2026-02-30"} through against {"type":"string","format":"date"};
# the generic FormatChecker() rejects it. We use the generic one so the
# negative tests below are real, not cosmetic.
#
# Round 8 fail-fast note: even the generic FormatChecker() is not a
# guarantee by itself. jsonschema registers its "date-time" checker inside
# `with suppress(ImportError): from rfc3339_validator import ...` -- if
# rfc3339_validator is not installed (e.g. requirements-dev.txt was
# installed without the [format-nongpl] extra, or a stale/cached env is
# used), "date-time" is silently absent from FORMAT_CHECKER.checkers and
# every format:date-time field -- resolvedAt, asOfDateTime, lastApprovedAt
# -- passes validation unchecked, with no error or warning. "date" itself
# has no such optional import (it's plain stdlib date.fromisoformat), so
# it can't silently vanish the same way, but we check both defensively.
# We fail fast here rather than let CI go green on a validator that quietly
# stopped checking half of what this file claims to check.
FORMAT_CHECKER = FormatChecker()
_REQUIRED_FORMATS = {"date", "date-time"}
_missing_formats = _REQUIRED_FORMATS - set(FORMAT_CHECKER.checkers)
if _missing_formats:
    raise RuntimeError(
        "Required JSON Schema format checkers are unavailable: "
        + ", ".join(sorted(_missing_formats))
        + ". Install jsonschema[format-nongpl] (see requirements-dev.txt) "
        + "rather than plain jsonschema, then re-run."
    )


def _base_registry_resolve(registry, spec_uri, pointer):
    """Look up an RFC 6901 JSON Pointer (e.g. "/paths/~1currencies~1{code}/...")
    against `spec_uri` in `registry`, returning the resolved contents.
    Used only as a startup self-check that currency_schema_ptr /
    country_schema_ptr in main() still point at the schema a plain dict
    navigation would find -- see the round-10 comment in main().
    """
    return registry.resolver().lookup(f"{spec_uri}#{pointer}").contents


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "oas_file",
        type=Path,
        nargs="?",
        default=Path(__file__).with_name("standing-calendar-service.oas.yaml"),
        help="Path to the OpenAPI YAML file (default: alongside this script)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.oas_file.exists():
        print(f"ERROR: OAS file not found: {args.oas_file}", file=sys.stderr)
        sys.exit(2)

    with open(args.oas_file, encoding="utf-8") as f:
        spec = yaml.safe_load(f)

    # Round 9 note: RefResolver (used here through jsonschema 4.x) has been
    # deprecated since jsonschema 4.18.0 in favor of the `referencing`
    # library's Registry/Resolver. We migrate now rather than pin an old
    # jsonschema version, since referencing.Registry is the actively
    # maintained mechanism and pinning would only defer the same migration.
    #
    # Round 10 note: the round-9 version of this fix used the `_resolver=`
    # constructor argument, which is an underscore-prefixed, undocumented
    # jsonschema internal -- not the officially documented integration
    # point, and a real risk of breaking on a future jsonschema release
    # (`TypeError: unexpected keyword argument '_resolver'`). This version
    # uses ONLY the public `registry=` argument, as jsonschema's own
    # referencing docs recommend, by registering the full spec under a
    # fixed synthetic URI (`SPEC_URI`, not a real resolvable network
    # location -- it never needs to be dereferenced, only used as a
    # registry key) and building every schema handed to Draft4Validator as
    # an ABSOLUTE `{"$ref": f"{SPEC_URI}#..."}` pointing into it, rather
    # than passing a bare sub-schema dict as the validator's root schema.
    #
    # This sidesteps the round-9 problem directly: Draft4Validator(schema,
    # registry=registry) always treats whatever `schema` you pass it as
    # the "root" resource for resolving BARE `#/...` refs (see
    # jsonschema.validators' `__attrs_post_init__`, which calls
    # `registry.resolver_with_root(...)` on that schema) -- so a bare
    # fragment-only ref inside a sub-schema extracted from the full spec
    # would resolve against the sub-schema itself, not the full document,
    # and fail with PointerToNowhere. An ABSOLUTE-URI ref sidesteps that
    # entirely: it names the full-spec resource explicitly by its
    # registered URI, so it resolves correctly regardless of what the
    # validator's own root schema happens to be. Verified directly for
    # both named components and raw inline (GET /currencies-style)
    # schemas before adopting this over the round-9 version.
    SPEC_URI = "urn:standing:calendar-service:oas"
    _resource = Resource.from_contents(spec, default_specification=DRAFT4)
    _registry = Registry().with_resource(SPEC_URI, _resource)
    failures = []

    def validator_for(name_or_schema):
        # Accepts either a named component ("AdjustBusinessDayRequest") or
        # a JSON Pointer string (e.g. "/paths/~1currencies~1{code}/get/...")
        # into the full spec, for endpoints like GET /currencies that
        # define their response schema inline rather than as a named
        # component. JSON Pointers always start with "/"; component names
        # in this file never do, so that's the disambiguator -- see the
        # currency_schema_ptr / country_schema_ptr definitions below for
        # why we pass a pointer rather than the extracted dict itself
        # (the dict alone has no memory of "where in the document" it
        # came from, which an absolute $ref needs).
        if isinstance(name_or_schema, str) and name_or_schema.startswith("/"):
            ref = f"{SPEC_URI}#{name_or_schema}"
        else:
            ref = f"{SPEC_URI}#/components/schemas/{name_or_schema}"
        return Draft4Validator(
            {"$ref": ref},
            registry=_registry,
            format_checker=FORMAT_CHECKER,
        )

    def expect_valid(name_or_schema, instance, label):
        errors = list(validator_for(name_or_schema).iter_errors(instance))
        if errors:
            print(f"[FAIL] {label}: expected VALID but got errors:")
            for e in errors:
                print("   -", e.message)
            failures.append(label)
            return
        print(f"[OK]   {label}: valid as expected")

    def expect_invalid(name_or_schema, instance, label):
        errors = list(validator_for(name_or_schema).iter_errors(instance))
        if not errors:
            print(f"[FAIL] {label}: expected INVALID but validation PASSED")
            failures.append(label)
            return
        print(f"[OK]   {label}: correctly rejected ({len(errors)} error(s)) e.g. {errors[0].message[:120]}")

    # -----------------------------------------------------------------
    # Pull embedded request/response examples straight out of the spec
    # -----------------------------------------------------------------
    adjust_req_example = spec["paths"]["/business-days/adjust"]["post"]["requestBody"]["content"]["application/json"]["examples"]["christmasRollover"]["value"]
    adjust_resp_example = spec["paths"]["/business-days/adjust"]["post"]["responses"]["200"]["content"]["application/json"]["examples"]["christmasRollover"]["value"]
    add_req_example = spec["paths"]["/business-days/add"]["post"]["requestBody"]["content"]["application/json"]["examples"]["examinationPeriod"]["value"]

    # -----------------------------------------------------------------
    # POSITIVE: the embedded worked examples must still validate cleanly
    # -----------------------------------------------------------------
    expect_valid("AdjustBusinessDayRequest", adjust_req_example, "Christmas rollover request example")
    expect_valid("AdjustBusinessDayResponse", adjust_resp_example, "Christmas rollover response example")
    expect_valid("AddBusinessDaysRequest", add_req_example, "UCP Art.14(b) request example")

    # -----------------------------------------------------------------
    # P0 (round 1->2): contractualDateChanged must be enum:[false]
    # -----------------------------------------------------------------
    bad = copy.deepcopy(adjust_resp_example)
    bad["contractualDateChanged"] = True
    expect_invalid("AdjustBusinessDayResponse", bad, "contractualDateChanged=true")

    # -----------------------------------------------------------------
    # P0 (round 2): response schemas require every always-returned field
    # -----------------------------------------------------------------
    expect_invalid("AdjustBusinessDayResponse", {}, "empty AdjustBusinessDayResponse {}")
    partial = copy.deepcopy(adjust_resp_example)
    del partial["calendarVersions"]
    expect_invalid("AdjustBusinessDayResponse", partial, "AdjustBusinessDayResponse missing calendarVersions")

    add_resp_valid = {
        "calculationId": "CALC-X",
        "startDate": "2026-12-24",
        "businessDaysAdded": 5,
        "resultDate": "2027-01-02",
        "calendarSnapshotId": "CAL-SNAPSHOT-20261220-001",
        "calendarVersions": [{"calendarType": "INSTITUTION", "code": "BOFAAE2X", "version": "2026.12.10"}],
        "skippedDates": [],
        "calculationWindowStartDate": "2026-12-24",
        "calculationWindowEndDate": "2027-01-02",
    }
    expect_valid("AddBusinessDaysResponse", add_resp_valid, "well-formed AddBusinessDaysResponse")
    expect_invalid("AddBusinessDaysResponse", {}, "empty AddBusinessDaysResponse {}")

    # -----------------------------------------------------------------
    # P0 (round 2): sourceDateType / calculationPurpose legal combinations
    # -----------------------------------------------------------------
    bad = copy.deepcopy(adjust_req_example)
    bad["calculationPurpose"] = "EXAMINATION_DEADLINE"  # illegal with CONTRACTUAL_MATURITY_DATE
    expect_invalid("AdjustBusinessDayRequest", bad, "CONTRACTUAL_MATURITY_DATE + EXAMINATION_DEADLINE")

    good_other = copy.deepcopy(adjust_req_example)
    good_other["sourceDateType"] = "OTHER"
    good_other["calculationPurpose"] = "OTHER"
    expect_valid("AdjustBusinessDayRequest", good_other, "OTHER + OTHER is legal")

    good_exam = copy.deepcopy(adjust_req_example)
    good_exam["sourceDateType"] = "EXAMINATION_PERIOD_START"
    good_exam["calculationPurpose"] = "EXAMINATION_DEADLINE"
    expect_valid("AdjustBusinessDayRequest", good_exam, "EXAMINATION_PERIOD_START + EXAMINATION_DEADLINE is legal")

    # -----------------------------------------------------------------
    # P0 (round 2): calendarSnapshotId / asOfDateTime mutual exclusivity
    # -----------------------------------------------------------------
    bad = copy.deepcopy(adjust_req_example)
    bad["asOfDateTime"] = "2026-12-20T15:00:00+04:00"  # already has calendarSnapshotId
    expect_invalid("AdjustBusinessDayRequest", bad, "adjust request with BOTH calendarSnapshotId and asOfDateTime")

    bad_add = copy.deepcopy(add_req_example)
    bad_add["calendarSnapshotId"] = "CAL-SNAPSHOT-20261220-001"
    bad_add["asOfDateTime"] = "2026-12-20T15:00:00+04:00"
    expect_invalid("AddBusinessDaysRequest", bad_add, "add request with BOTH calendarSnapshotId and asOfDateTime")

    ok_one = copy.deepcopy(adjust_req_example)
    del ok_one["calendarSnapshotId"]
    ok_one["asOfDateTime"] = "2026-12-20T15:00:00+04:00"
    expect_valid("AdjustBusinessDayRequest", ok_one, "adjust request with ONLY asOfDateTime is legal")

    # -----------------------------------------------------------------
    # P1 (round 2): CalendarVersionRef / CalendarAssessment / CalendarReference
    # -----------------------------------------------------------------
    expect_invalid("CalendarVersionRef", {"calendarType": "COUNTRY"}, "CalendarVersionRef missing code/version")
    expect_valid("CalendarVersionRef", {"calendarType": "COUNTRY", "code": "AE", "version": "2026.01"}, "well-formed CalendarVersionRef")

    expect_invalid(
        "CalendarAssessment",
        {"calendarType": "COUNTRY", "code": "AE", "date": "2026-12-25", "businessDay": False, "calendarVersion": "2026.01"},
        "CalendarAssessment businessDay=false missing reasonCode",
    )
    expect_valid(
        "CalendarAssessment",
        {"calendarType": "COUNTRY", "code": "AE", "date": "2026-12-25", "businessDay": True, "calendarVersion": "2026.01"},
        "CalendarAssessment businessDay=true without reasonCode is fine",
    )

    expect_invalid("CalendarReference", {"calendarType": "INSTITUTION", "code": "BOFAAE2X"}, "CalendarReference missing role")
    expect_valid("CalendarReference", {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "PAYING_BANK"}, "well-formed CalendarReference")

    expect_invalid("ErrorResponse", {"errorCode": "CALENDAR_NOT_CONFIGURED", "message": "x"}, "ErrorResponse missing correlationId/retryable")
    expect_valid(
        "ErrorResponse",
        {"errorCode": "CALENDAR_NOT_CONFIGURED", "message": "x", "correlationId": "c-1", "retryable": False},
        "well-formed ErrorResponse",
    )

    # -----------------------------------------------------------------
    # P0 (round 3): FORCE_MAJEURE_EVENT must force manualReviewRequired=true
    # and automaticAdjustmentAllowed=false -- the unsafe defaults must not
    # silently apply when this reasonCode is used.
    # -----------------------------------------------------------------
    fm_missing_flags = {
        "calendarType": "COUNTRY", "code": "AE", "date": "2026-12-25",
        "businessDay": False, "reasonCode": "FORCE_MAJEURE_EVENT",
        "calendarVersion": "2026.01",
    }
    expect_invalid("CalendarAssessment", fm_missing_flags, "FORCE_MAJEURE_EVENT without manualReviewRequired/automaticAdjustmentAllowed")

    fm_wrong_flags = dict(fm_missing_flags, manualReviewRequired=False, automaticAdjustmentAllowed=True)
    expect_invalid("CalendarAssessment", fm_wrong_flags, "FORCE_MAJEURE_EVENT with unsafe flag values (false/true)")

    fm_correct = dict(fm_missing_flags, manualReviewRequired=True, automaticAdjustmentAllowed=False)
    expect_valid("CalendarAssessment", fm_correct, "FORCE_MAJEURE_EVENT with correct safe flags (true/false)")

    # -----------------------------------------------------------------
    # P1 (round 3): evidence arrays must not be empty (minItems: 1)
    # -----------------------------------------------------------------
    empty_evidence = copy.deepcopy(adjust_resp_example)
    empty_evidence["calendarVersions"] = []
    expect_invalid("AdjustBusinessDayResponse", empty_evidence, "AdjustBusinessDayResponse with empty calendarVersions[]")

    empty_evidence2 = copy.deepcopy(adjust_resp_example)
    empty_evidence2["calendarAssessments"] = []
    expect_invalid("AdjustBusinessDayResponse", empty_evidence2, "AdjustBusinessDayResponse with empty calendarAssessments[]")

    empty_evidence3 = copy.deepcopy(adjust_resp_example)
    empty_evidence3["adjustedDateAssessments"] = []
    expect_invalid("AdjustBusinessDayResponse", empty_evidence3, "AdjustBusinessDayResponse with empty adjustedDateAssessments[]")

    empty_add = dict(add_resp_valid, calendarVersions=[])
    expect_invalid("AddBusinessDaysResponse", empty_add, "AddBusinessDaysResponse with empty calendarVersions[]")

    # -----------------------------------------------------------------
    # P1 (round 3): AUTHENTICATION_REQUIRED is a schema-legal errorCode
    # distinct from INSUFFICIENT_CALENDAR_SCOPE
    # -----------------------------------------------------------------
    expect_valid(
        "ErrorResponse",
        {"errorCode": "AUTHENTICATION_REQUIRED", "message": "missing token", "correlationId": "c-2", "retryable": False},
        "AUTHENTICATION_REQUIRED is a valid errorCode (for 401 responses)",
    )
    expect_valid(
        "ErrorResponse",
        {"errorCode": "MANUAL_REVIEW_REQUIRED", "message": "force majeure", "correlationId": "c-3", "retryable": False},
        "MANUAL_REVIEW_REQUIRED is a valid errorCode (for 422 fail-closed force-majeure responses)",
    )

    # -----------------------------------------------------------------
    # round 4/5, item 1: skippedDates MAY carry FORCE_MAJEURE_EVENT as a
    # historical/informational trail, but round-5 review correctly flagged
    # that round 4's version of this test left "resolved" as free-text in
    # reasonDescription only -- no structured field distinguished it from a
    # live, ACTIVE closure. ClosureStatus (round-5 addition) fixes that:
    # this test now sets closureStatus=RESOLVED explicitly. The fail-closed
    # gate for an ACTIVE force-majeure date anywhere in the evaluated
    # window is enforced by the SERVICE per the description on
    # /business-days/adjust and /business-days/add (a schema cannot express
    # "if any array item matches X, the whole response must be a 4xx
    # instead") -- this test only proves the RESOLVED shape itself is
    # schema-valid, not that a live ACTIVE entry would be blocked, which is
    # a Service/Integration-test-layer concern (see design doc section 7).
    # -----------------------------------------------------------------
    fm_in_skipped = copy.deepcopy(adjust_resp_example)
    fm_in_skipped["skippedDates"].append({
        "date": "2026-12-26",
        "reasonCode": "FORCE_MAJEURE_EVENT",
        "closureStatus": "RESOLVED",
        "resolvedAt": "2026-12-27T10:00:00+04:00",
        "reasonDescription": "Resolved prior to this calculation; retained for audit trail",
    })
    expect_valid("AdjustBusinessDayResponse", fm_in_skipped, "FORCE_MAJEURE_EVENT with closureStatus=RESOLVED recorded in skippedDates[] is schema-valid (service-layer gate is separate, see endpoint description)")

    # -----------------------------------------------------------------
    # round 5, item extra: an omitted closureStatus on a skippedDates entry
    # must still validate (it defaults to ACTIVE per the schema default and
    # per the endpoint description -- omission is not a way to bypass the
    # service-side fail-closed gate).
    # -----------------------------------------------------------------
    fm_active_default = copy.deepcopy(adjust_resp_example)
    fm_active_default["skippedDates"].append({
        "date": "2026-12-26",
        "reasonCode": "FORCE_MAJEURE_EVENT",
    })
    expect_valid("AdjustBusinessDayResponse", fm_active_default, "skippedDates entry with FORCE_MAJEURE_EVENT and omitted closureStatus (implicitly ACTIVE) is schema-valid shape-wise")

    # -----------------------------------------------------------------
    # round 4, item 2: adjustedDateAssessments item missing a required
    # CalendarAssessment field (calendarVersion) must fail, same as it does
    # for calendarAssessments -- both arrays share the CalendarAssessment
    # item schema, so this guards against the two arrays silently diverging.
    # -----------------------------------------------------------------
    bad_adjusted_assessment = copy.deepcopy(adjust_resp_example)
    del bad_adjusted_assessment["adjustedDateAssessments"][0]["calendarVersion"]
    expect_invalid("AdjustBusinessDayResponse", bad_adjusted_assessment, "adjustedDateAssessments[] item missing required calendarVersion")

    # -----------------------------------------------------------------
    # round 4, item 3: a fully-populated 401 ErrorResponse (all optional
    # fields present, not just the required minimum) still validates --
    # guards against an overly narrow schema that only tolerates the bare
    # minimum shape.
    # -----------------------------------------------------------------
    full_401 = {
        "errorCode": "AUTHENTICATION_REQUIRED",
        "message": "Bearer token missing or expired",
        "correlationId": "c-401-full",
        "retryable": False,
        "calendarType": "INSTITUTION",
        "calendarCode": "BANK_AE",
        "requiredDate": "2026-12-25",
        "details": {"hint": "re-authenticate and retry"},
    }
    expect_valid("ErrorResponse", full_401, "fully-populated 401 ErrorResponse (all optional fields present) is valid")

    # -----------------------------------------------------------------
    # round 5, item 1: CALENDAR_NOT_FOUND is a distinct, schema-legal
    # errorCode from CALENDAR_NOT_CONFIGURED (they used to be the same code
    # returned at two different HTTP statuses, which the errorCode
    # description's own "same code, same status" rule prohibited).
    # -----------------------------------------------------------------
    expect_valid(
        "ErrorResponse",
        {"errorCode": "CALENDAR_NOT_FOUND", "message": "no such calendar", "correlationId": "c-4", "retryable": False},
        "CALENDAR_NOT_FOUND is a valid, distinct errorCode (404, Calendars GET endpoints)",
    )

    # -----------------------------------------------------------------
    # round 5, item 2: GET /currencies/{code} and GET /countries/{code}
    # success schemas (inline, not named components) now declare required[]
    # -- {} must fail, and the full example shape must still pass.
    # -----------------------------------------------------------------
    # Round 10: these are JSON Pointers into the full spec (RFC 6901: "/"
    # inside a key escapes to "~1"), not extracted dicts -- validator_for()
    # turns each into an absolute {"$ref": f"{SPEC_URI}#{pointer}"} so it
    # resolves through the public registry= API (see the note above).
    currency_schema_ptr = "/paths/~1currencies~1{code}/get/responses/200/content/application~1json/schema"
    country_schema_ptr = "/paths/~1countries~1{code}/get/responses/200/content/application~1json/schema"

    # Sanity-check the two pointers actually land on the same schema dict
    # a plain dict-navigation extraction would produce, so a future
    # restructure of the YAML can't silently point these tests at the
    # wrong node with no error raised at all.
    assert (
        spec["paths"]["/currencies/{code}"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        is _base_registry_resolve(_registry, SPEC_URI, currency_schema_ptr)
    ), "currency_schema_ptr no longer points at the GET /currencies/{code} 200 response schema"
    assert (
        spec["paths"]["/countries/{code}"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        is _base_registry_resolve(_registry, SPEC_URI, country_schema_ptr)
    ), "country_schema_ptr no longer points at the GET /countries/{code} 200 response schema"

    expect_invalid(currency_schema_ptr, {}, "empty GET /currencies/{code} 200 response {}")
    expect_valid(currency_schema_ptr, {"code": "USD", "name": "US Dollar", "minorUnitDecimals": 2}, "well-formed GET /currencies/{code} 200 response")

    expect_invalid(country_schema_ptr, {}, "empty GET /countries/{code} 200 response {}")
    # Round 12 fix: AE's actual federal weekend has been Saturday/Sunday
    # since 2022-01-01 (it was Friday/Saturday before that) -- this fixture
    # previously used the pre-2022 ["FRI", "SAT"] value, which is now stale
    # and would misrepresent AE's current weekend if copied as a reference
    # example. weekendDays here is a WeekendDay enum value (MON..SUN), so
    # SAT/SUN was already schema-legal before this fix -- this is a data
    # accuracy correction, not a new schema constraint.
    # Round 13 fix: the GET /countries/{code} 200 response now also
    # requires effectiveFrom/calendarVersion/lastApprovedAt/sourceAuthority
    # (P2-1 governance fields) -- this fixture is updated to include them,
    # otherwise this "well-formed" example would itself now be rejected.
    country_valid = {
        "code": "AE",
        "name": "United Arab Emirates",
        "defaultCountryCalendarCode": "AE",
        "weekendDays": ["SAT", "SUN"],
        "effectiveFrom": "2022-01-01",
        "calendarVersion": "AE-2022.01",
        "lastApprovedAt": "2026-08-01T10:00:00Z",
        "sourceAuthority": "UAE_GOVERNMENT",
    }
    expect_valid(
        country_schema_ptr,
        country_valid,
        "well-formed GET /countries/{code} 200 response (AE's current post-2022 SAT/SUN weekend, with round-13 governance fields)",
    )

    # -----------------------------------------------------------------
    # round 13, item P1-1: weekendDays minItems/maxItems/uniqueItems
    # -----------------------------------------------------------------
    expect_invalid(country_schema_ptr, dict(country_valid, weekendDays=[]), "weekendDays=[] (empty) is now rejected")
    expect_invalid(country_schema_ptr, dict(country_valid, weekendDays=["SAT", "SAT"]), "weekendDays with a duplicated day (['SAT','SAT']) is now rejected")
    expect_invalid(
        country_schema_ptr,
        dict(country_valid, weekendDays=["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
        "weekendDays with all seven days is now rejected (exceeds maxItems:3)",
    )
    expect_invalid(country_schema_ptr, dict(country_valid, weekendDays=["HOLIDAY"]), "weekendDays with an illegal value ('HOLIDAY') is rejected")
    expect_valid(country_schema_ptr, dict(country_valid, weekendDays=["SAT"]), "weekendDays with exactly 1 day (e.g. Nepal Saturday-only) remains legal")
    expect_valid(country_schema_ptr, dict(country_valid, weekendDays=["FRI", "SAT", "SUN"]), "weekendDays with exactly 3 distinct days (e.g. a Sharjah-style Fri-Sun pattern) remains legal")

    # -----------------------------------------------------------------
    # round 13, item P2-1: new required governance fields on GET
    # /countries/{code} -- each individually required.
    # -----------------------------------------------------------------
    for field in ("effectiveFrom", "calendarVersion", "lastApprovedAt", "sourceAuthority"):
        missing = dict(country_valid)
        del missing[field]
        expect_invalid(country_schema_ptr, missing, f"GET /countries/{{code}} 200 response missing required '{field}' is now rejected")

    # -----------------------------------------------------------------
    # round 13, item P2-2: CountryCode / CurrencyCode / BicCode patterns.
    # Exercised through the same country_schema_ptr / currency_schema_ptr
    # response schemas, since `code` on both is now $ref'd to the new
    # pattern-constrained components rather than a bare string.
    # -----------------------------------------------------------------
    expect_invalid(country_schema_ptr, dict(country_valid, code="ae"), "GET /countries/{code} 200 response code='ae' (lowercase) is now rejected")
    expect_invalid(country_schema_ptr, dict(country_valid, code="UAE"), "GET /countries/{code} 200 response code='UAE' (3 letters) is now rejected")
    expect_invalid(country_schema_ptr, dict(country_valid, defaultCountryCalendarCode="ae"), "GET /countries/{code} 200 response defaultCountryCalendarCode='ae' (lowercase) is now rejected")
    expect_valid(country_schema_ptr, dict(country_valid, code="SA"), "GET /countries/{code} 200 response code='SA' (valid 2-letter code) remains legal")

    currency_valid_base = {"code": "USD", "name": "US Dollar", "minorUnitDecimals": 2}
    expect_invalid(currency_schema_ptr, dict(currency_valid_base, code="usd"), "GET /currencies/{code} 200 response code='usd' (lowercase) is now rejected")
    expect_invalid(currency_schema_ptr, dict(currency_valid_base, code="US"), "GET /currencies/{code} 200 response code='US' (2 letters) is now rejected")
    expect_invalid(currency_schema_ptr, dict(currency_valid_base, code="USD123"), "GET /currencies/{code} 200 response code='USD123' is now rejected")
    expect_valid(currency_schema_ptr, currency_valid_base, "GET /currencies/{code} 200 response code='USD' (valid 3-letter code) remains legal")

    expect_invalid("CountryCode", "AE ", "CountryCode with trailing whitespace is rejected")
    expect_invalid("CurrencyCode", "usd", "CurrencyCode lowercase is rejected")
    expect_valid("BicCode", "BOFAAE2X", "BicCode 8-character form is legal")
    expect_valid("BicCode", "BOFAAE2XXXX", "BicCode 11-character (with branch code) form is legal")
    expect_invalid("BicCode", "BOFAAE2", "BicCode with only 7 characters is rejected")

    # -----------------------------------------------------------------
    # round 14, item P2 (BicCode pattern fix): round 13's pattern
    # (^[A-Z0-9]{8}([A-Z0-9]{3})?$) wrongly treated positions 5-6 (the ISO
    # country-code segment of a real BIC) as generic alphanumeric, so it
    # incorrectly ACCEPTED all-digit or digit-in-country-code-position
    # values. These two cases were reviewer-supplied counterexamples that
    # the round-13 pattern would have wrongly let through; both must now
    # be rejected under the round-14 pattern
    # (^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$).
    # -----------------------------------------------------------------
    expect_invalid("BicCode", "12345678", "BicCode='12345678' (all digits, no letter country-code segment) is now rejected")
    expect_invalid("BicCode", "BANK12XX", "BicCode='BANK12XX' (digits in the country-code position 5-6) is now rejected")
    expect_valid("BicCode", "BANKGBXX", "BicCode with a valid letter country-code segment (GB) remains legal")

    # -----------------------------------------------------------------
    # round 14, item P2 (defaultCountryCalendarCode loosened to
    # CalendarCode): round 13 wrongly assumed a country's default COUNTRY
    # calendar identifier always equals its 2-letter country code. Proves
    # the field now accepts a longer, non-CountryCode-shaped identifier,
    # while still rejecting lower-case/malformed values.
    # -----------------------------------------------------------------
    expect_valid(
        country_schema_ptr,
        dict(country_valid, defaultCountryCalendarCode="AE_FEDERAL"),
        "GET /countries/{code} 200 response defaultCountryCalendarCode='AE_FEDERAL' (no longer forced to 2-letter CountryCode) is now legal",
    )
    expect_invalid(
        country_schema_ptr,
        dict(country_valid, defaultCountryCalendarCode="ae"),
        "GET /countries/{code} 200 response defaultCountryCalendarCode='ae' (lowercase) is still rejected under CalendarCode's pattern",
    )
    expect_invalid(
        country_schema_ptr,
        dict(country_valid, defaultCountryCalendarCode="A"),
        "GET /countries/{code} 200 response defaultCountryCalendarCode='A' (below CalendarCode's minLength:2) is rejected",
    )

    # -----------------------------------------------------------------
    # round 12, item 1: GET /currencies/{code} and GET /countries/{code}
    # 404 responses now have their own dedicated errorCode (CURRENCY_
    # NOT_FOUND / COUNTRY_NOT_FOUND) instead of no legal enum member at
    # all, and each 404 response (these two plus the three Calendars GET
    # endpoints) is schema-narrowed per-response so the WRONG errorCode
    # for that endpoint is itself rejected, not just undocumented.
    # -----------------------------------------------------------------
    currency_404_ptr = "/paths/~1currencies~1{code}/get/responses/404/content/application~1json/schema"
    country_404_ptr = "/paths/~1countries~1{code}/get/responses/404/content/application~1json/schema"
    is_business_day_404_ptr = "/paths/~1calendars~1{calendarType}~1{code}~1is-business-day/get/responses/404/content/application~1json/schema"
    holidays_404_ptr = "/paths/~1calendars~1{calendarType}~1{code}~1holidays/get/responses/404/content/application~1json/schema"
    completeness_404_ptr = "/paths/~1calendars~1{calendarType}~1{code}~1completeness/get/responses/404/content/application~1json/schema"

    def error_body(code):
        return {"errorCode": code, "message": "x", "correlationId": "c-404", "retryable": False}

    expect_valid(currency_404_ptr, error_body("CURRENCY_NOT_FOUND"), "GET /currencies/{code} 404 with CURRENCY_NOT_FOUND is legal")
    expect_invalid(currency_404_ptr, error_body("CALENDAR_NOT_FOUND"), "GET /currencies/{code} 404 with CALENDAR_NOT_FOUND (wrong endpoint's code) is now rejected")
    expect_invalid(currency_404_ptr, error_body("COUNTRY_NOT_FOUND"), "GET /currencies/{code} 404 with COUNTRY_NOT_FOUND (wrong endpoint's code) is now rejected")

    expect_valid(country_404_ptr, error_body("COUNTRY_NOT_FOUND"), "GET /countries/{code} 404 with COUNTRY_NOT_FOUND is legal")
    expect_invalid(country_404_ptr, error_body("CALENDAR_NOT_FOUND"), "GET /countries/{code} 404 with CALENDAR_NOT_FOUND (wrong endpoint's code) is now rejected")
    expect_invalid(country_404_ptr, error_body("CURRENCY_NOT_FOUND"), "GET /countries/{code} 404 with CURRENCY_NOT_FOUND (wrong endpoint's code) is now rejected")

    for label, ptr in [
        ("is-business-day", is_business_day_404_ptr),
        ("holidays", holidays_404_ptr),
        ("completeness", completeness_404_ptr),
    ]:
        expect_valid(ptr, error_body("CALENDAR_NOT_FOUND"), f"GET .../{label} 404 with CALENDAR_NOT_FOUND is legal")
        expect_invalid(ptr, error_body("CURRENCY_NOT_FOUND"), f"GET .../{label} 404 with CURRENCY_NOT_FOUND (wrong endpoint's code) is now rejected")

    # round 12, item 2: CURRENCY_NOT_FOUND / COUNTRY_NOT_FOUND are legal
    # errorCode values on the shared ErrorResponse component itself too
    # (not just within the narrowed per-endpoint responses above).
    expect_valid("ErrorResponse", error_body("CURRENCY_NOT_FOUND"), "ErrorResponse.errorCode=CURRENCY_NOT_FOUND is a valid enum member")
    expect_valid("ErrorResponse", error_body("COUNTRY_NOT_FOUND"), "ErrorResponse.errorCode=COUNTRY_NOT_FOUND is a valid enum member")

    # -----------------------------------------------------------------
    # round 6, item 1: businessDay=true must no longer be able to
    # self-contradict by also carrying force-majeure/closure fields.
    # -----------------------------------------------------------------
    open_day_base = {"calendarType": "COUNTRY", "code": "AE", "date": "2026-12-25", "businessDay": True, "calendarVersion": "2026.01"}

    expect_invalid(
        "CalendarAssessment",
        dict(open_day_base, reasonCode="FORCE_MAJEURE_EVENT"),
        "businessDay=true with reasonCode=FORCE_MAJEURE_EVENT is self-contradictory and now rejected",
    )
    expect_invalid(
        "CalendarAssessment",
        dict(open_day_base, manualReviewRequired=True),
        "businessDay=true with manualReviewRequired=true is self-contradictory and now rejected",
    )
    expect_invalid(
        "CalendarAssessment",
        dict(open_day_base, automaticAdjustmentAllowed=False),
        "businessDay=true with automaticAdjustmentAllowed=false is self-contradictory and now rejected",
    )
    expect_invalid(
        "CalendarAssessment",
        dict(open_day_base, closureStatus="RESOLVED", resolvedAt="2026-12-24T10:00:00+04:00"),
        "businessDay=true carrying closureStatus/resolvedAt at all is now rejected, even a RESOLVED one",
    )
    expect_valid(
        "CalendarAssessment",
        dict(open_day_base, manualReviewRequired=False, automaticAdjustmentAllowed=True),
        "businessDay=true with EXPLICIT default-matching manualReviewRequired=false/automaticAdjustmentAllowed=true is still legal (not overly restrictive)",
    )

    # -----------------------------------------------------------------
    # round 6, item 2: CalendarAssessment.resolvedAt required iff
    # closureStatus is RESOLVED/CANCELLED (mirrors skippedDates[]).
    # -----------------------------------------------------------------
    fm_resolved_no_timestamp = dict(fm_correct, closureStatus="RESOLVED")
    expect_invalid("CalendarAssessment", fm_resolved_no_timestamp, "closureStatus=RESOLVED without resolvedAt is now rejected")

    fm_active_with_timestamp = dict(fm_correct, closureStatus="ACTIVE", resolvedAt="2026-12-24T10:00:00+04:00")
    expect_invalid("CalendarAssessment", fm_active_with_timestamp, "closureStatus=ACTIVE with a resolvedAt present is now rejected")

    fm_resolved_with_timestamp = dict(fm_correct, closureStatus="RESOLVED", resolvedAt="2026-12-24T10:00:00+04:00")
    expect_valid("CalendarAssessment", fm_resolved_with_timestamp, "closureStatus=RESOLVED with resolvedAt present is valid")

    # -----------------------------------------------------------------
    # round 6, item 3: same resolvedAt-iff-RESOLVED/CANCELLED rule on
    # skippedDates[] items, exercised through the full response schema.
    # -----------------------------------------------------------------
    skipped_resolved_no_timestamp = copy.deepcopy(adjust_resp_example)
    skipped_resolved_no_timestamp["skippedDates"].append({
        "date": "2026-12-26", "reasonCode": "FORCE_MAJEURE_EVENT", "closureStatus": "CANCELLED",
    })
    expect_invalid("AdjustBusinessDayResponse", skipped_resolved_no_timestamp, "skippedDates[] entry with closureStatus=CANCELLED but no resolvedAt is now rejected")

    skipped_active_with_timestamp = copy.deepcopy(adjust_resp_example)
    skipped_active_with_timestamp["skippedDates"].append({
        "date": "2026-12-26", "reasonCode": "FORCE_MAJEURE_EVENT", "resolvedAt": "2026-12-27T10:00:00+04:00",
    })
    expect_invalid("AdjustBusinessDayResponse", skipped_active_with_timestamp, "skippedDates[] entry with resolvedAt but closureStatus omitted (implicitly ACTIVE) is now rejected")

    # -----------------------------------------------------------------
    # round 7, item 1 (P1): date / date-time FORMAT is now actually
    # enforced (see the FORMAT_CHECKER note near the top of this file --
    # this must use the generic jsonschema.FormatChecker(), not
    # Draft4Validator.FORMAT_CHECKER, or 'format: date' fields would pass
    # through unchecked). Covers sourceDate, startDate, adjustedDate,
    # resultDate, resolvedAt, asOfDateTime, requiredDate as requested.
    # -----------------------------------------------------------------
    bad_source_date = copy.deepcopy(adjust_req_example)
    bad_source_date["sourceDate"] = "2026-02-30"  # February has no 30th
    expect_invalid("AdjustBusinessDayRequest", bad_source_date, "sourceDate=2026-02-30 (invalid calendar date) is now rejected")

    ok_source_date = copy.deepcopy(adjust_req_example)
    ok_source_date["sourceDate"] = "2026-02-28"
    expect_valid("AdjustBusinessDayRequest", ok_source_date, "sourceDate=2026-02-28 (valid calendar date) remains legal")

    bad_start_date = copy.deepcopy(add_req_example)
    bad_start_date["startDate"] = "2026-13-01"  # month 13 does not exist
    expect_invalid("AddBusinessDaysRequest", bad_start_date, "startDate=2026-13-01 (invalid month) is now rejected")

    bad_adjusted_date = copy.deepcopy(adjust_resp_example)
    bad_adjusted_date["adjustedDate"] = "2026-04-31"  # April has 30 days
    expect_invalid("AdjustBusinessDayResponse", bad_adjusted_date, "adjustedDate=2026-04-31 (invalid calendar date) is now rejected")

    bad_result_date = dict(add_resp_valid, resultDate="2027-02-29")  # 2027 is not a leap year
    expect_invalid("AddBusinessDaysResponse", bad_result_date, "resultDate=2027-02-29 (2027 is not a leap year) is now rejected")

    bad_resolved_at = dict(fm_correct, closureStatus="RESOLVED", resolvedAt="not-a-valid-timestamp")
    expect_invalid("CalendarAssessment", bad_resolved_at, "resolvedAt with an invalid date-time format is now rejected (independent of the round-6 presence/absence rule)")

    bad_as_of = copy.deepcopy(adjust_req_example)
    del bad_as_of["calendarSnapshotId"]
    bad_as_of["asOfDateTime"] = "definitely-not-a-timestamp"
    expect_invalid("AdjustBusinessDayRequest", bad_as_of, "asOfDateTime with an invalid date-time format is now rejected")

    bad_required_date = {
        "errorCode": "CALENDAR_YEAR_NOT_AVAILABLE",
        "message": "next year's calendar has not been loaded",
        "correlationId": "11111111-1111-1111-1111-111111111111",
        "retryable": False,
        "requiredDate": "2026-06-31",  # June has 30 days
    }
    expect_invalid("ErrorResponse", bad_required_date, "ErrorResponse.requiredDate=2026-06-31 (invalid calendar date) is now rejected")

    ok_required_date = dict(bad_required_date, requiredDate="2026-06-30")
    expect_valid("ErrorResponse", ok_required_date, "ErrorResponse.requiredDate=2026-06-30 (valid calendar date) remains legal")

    # -----------------------------------------------------------------
    # round 8, item 1 (P2): leap-year / year-rollover / timezone boundary
    # cases requested by the reviewer, on top of round 7's basic invalid-
    # date coverage.
    # -----------------------------------------------------------------
    ok_leap_year = dict(add_resp_valid, resultDate="2028-02-29")  # 2028 IS a leap year
    expect_valid("AddBusinessDaysResponse", ok_leap_year, "resultDate=2028-02-29 (2028 is a leap year) is legal")

    ok_year_rollover = dict(
        add_resp_valid,
        startDate="2026-12-31",
        resultDate="2027-01-01",
        calculationWindowStartDate="2026-12-31",
        calculationWindowEndDate="2027-01-01",
    )
    expect_valid("AddBusinessDaysResponse", ok_year_rollover, "startDate=2026-12-31 rolling over to resultDate=2027-01-01 across a year boundary is legal")

    ok_utc_z = dict(fm_correct, closureStatus="RESOLVED", resolvedAt="2026-12-27T06:00:00Z")
    expect_valid("CalendarAssessment", ok_utc_z, "resolvedAt using RFC 3339 'Z' (UTC) suffix is legal, not just numeric offsets")

    ok_as_of_z = copy.deepcopy(adjust_req_example)
    del ok_as_of_z["calendarSnapshotId"]
    ok_as_of_z["asOfDateTime"] = "2026-12-27T06:00:00Z"
    expect_valid("AdjustBusinessDayRequest", ok_as_of_z, "asOfDateTime using RFC 3339 'Z' (UTC) suffix is legal")

    bad_as_of_no_tz = copy.deepcopy(adjust_req_example)
    del bad_as_of_no_tz["calendarSnapshotId"]
    bad_as_of_no_tz["asOfDateTime"] = "2026-12-27T10:00:00"  # RFC 3339 date-time requires an offset or 'Z'
    expect_invalid("AdjustBusinessDayRequest", bad_as_of_no_tz, "asOfDateTime missing a timezone offset/'Z' (bare local time) is now rejected under RFC 3339")

    # -----------------------------------------------------------------
    # round 13, item P1-2: CalendarReference.pathGroup minLength/maxLength/
    # pattern -- an empty or malformed pathGroup value is now rejected at
    # the schema level. The deeper rule (pathGroup must resolve to a
    # complete, policy-approved path; no duplicate calendar within one
    # group) remains SERVER-ENFORCED -- see CombinationRule's description
    # -- and is deliberately NOT asserted here, since a JSON payload
    # validator cannot check "does this path group match product policy".
    # -----------------------------------------------------------------
    expect_invalid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "PAYING_BANK", "pathGroup": ""},
        "CalendarReference.pathGroup='' (empty string) is now rejected",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "PAYING_BANK", "pathGroup": "a b"},
        "CalendarReference.pathGroup with a space (fails the pattern) is now rejected",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "PAYING_BANK", "pathGroup": "x" * 51},
        "CalendarReference.pathGroup exceeding 50 characters is now rejected",
    )
    expect_valid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "PAYING_BANK", "pathGroup": "route-1"},
        "CalendarReference.pathGroup='route-1' (well-formed) remains legal",
    )

    # -----------------------------------------------------------------
    # round 13, item P1-3: GET .../is-business-day's 422 is now
    # schema-narrowed to CALENDAR_YEAR_NOT_AVAILABLE only, matching the
    # round-12 narrowing pattern already used on this spec's 404 responses.
    # -----------------------------------------------------------------
    is_business_day_422_ptr = "/paths/~1calendars~1{calendarType}~1{code}~1is-business-day/get/responses/422/content/application~1json/schema"
    expect_valid(is_business_day_422_ptr, error_body("CALENDAR_YEAR_NOT_AVAILABLE"), "GET .../is-business-day 422 with CALENDAR_YEAR_NOT_AVAILABLE is legal")
    expect_invalid(is_business_day_422_ptr, error_body("CALENDAR_NOT_CONFIGURED"), "GET .../is-business-day 422 with CALENDAR_NOT_CONFIGURED (wrong code for this endpoint) is now rejected")
    expect_invalid(is_business_day_422_ptr, error_body("MANUAL_REVIEW_REQUIRED"), "GET .../is-business-day 422 with MANUAL_REVIEW_REQUIRED (wrong code for this endpoint) is now rejected")

    # -----------------------------------------------------------------
    # round 13, item P1-4: GET .../holidays now has a dedicated 400
    # response schema-narrowed to INVALID_DATE_RANGE. The 366-day ceiling
    # ITSELF is SERVER-ENFORCED (a cross-parameter date-arithmetic
    # comparison OAS 3.0.3 cannot express), so only the shape of this new
    # error response is exercised here, not the actual range check.
    # -----------------------------------------------------------------
    holidays_400_ptr = "/paths/~1calendars~1{calendarType}~1{code}~1holidays/get/responses/400/content/application~1json/schema"
    expect_valid(holidays_400_ptr, error_body("INVALID_DATE_RANGE"), "GET .../holidays 400 with INVALID_DATE_RANGE is legal")
    expect_invalid(holidays_400_ptr, error_body("CALENDAR_NOT_FOUND"), "GET .../holidays 400 with CALENDAR_NOT_FOUND (wrong code for this response) is now rejected")
    expect_valid("ErrorResponse", error_body("INVALID_DATE_RANGE"), "ErrorResponse.errorCode=INVALID_DATE_RANGE is a valid enum member")

    # -----------------------------------------------------------------
    # round 13, item P2-3: additionalProperties:false on the two core
    # calculation request schemas -- an unknown/typo'd top-level property
    # is now schema-rejected rather than silently ignored. Deliberately
    # NOT applied to response schemas (see the round-13 hardening notes).
    # -----------------------------------------------------------------
    typo_adjust = copy.deepcopy(adjust_req_example)
    typo_adjust["sourceData"] = typo_adjust.pop("sourceDate")  # typo: sourceData instead of sourceDate
    expect_invalid("AdjustBusinessDayRequest", typo_adjust, "AdjustBusinessDayRequest with unknown property 'sourceData' (typo for sourceDate) is now rejected")

    typo_add = copy.deepcopy(add_req_example)
    typo_add["startDatte"] = typo_add.pop("startDate")  # typo: startDatte instead of startDate
    expect_invalid("AddBusinessDaysRequest", typo_add, "AddBusinessDaysRequest with unknown property 'startDatte' (typo for startDate) is now rejected")

    ok_no_typo = copy.deepcopy(adjust_req_example)
    expect_valid("AdjustBusinessDayRequest", ok_no_typo, "AdjustBusinessDayRequest with only known properties still validates under additionalProperties:false")

    # -----------------------------------------------------------------
    # round 15, item P1-2 (design doc 3.56), CORRECTED round 16 (design doc
    # 3.61): CalendarReference.code is format-enforced, conditional on the
    # sibling calendarType, via a discriminated oneOf. The round-15 version
    # used CountryCode (strict ^[A-Z]{2}$) for COUNTRY/FINANCIAL_CENTER,
    # which contradicted this document's own v2.8.0 decision that a COUNTRY
    # calendar identifier is not confirmed to always equal the 2-letter
    # country code (GET /countries/{code} can legally return
    # defaultCountryCalendarCode="AE_FEDERAL"). Round 16 fixes this: COUNTRY/
    # FINANCIAL_CENTER/CURRENCY_CLEARING all use the permissive CalendarCode
    # component; only INSTITUTION keeps the strict BicCode branch.
    # -----------------------------------------------------------------
    expect_valid(
        "CalendarReference",
        {"calendarType": "COUNTRY", "code": "AE", "role": "PAYING_BANK"},
        "CalendarReference calendarType=COUNTRY with a plain 2-letter code ('AE') remains legal",
    )
    expect_valid(
        "CalendarReference",
        {"calendarType": "COUNTRY", "code": "AE_FEDERAL", "role": "PAYING_BANK"},
        "CalendarReference calendarType=COUNTRY with a non-2-letter CalendarCode ('AE_FEDERAL') is legal (round-16 fix)",
    )
    expect_valid(
        "CalendarReference",
        {"calendarType": "FINANCIAL_CENTER", "code": "MY_KEDAH", "role": "PAYING_BANK"},
        "CalendarReference calendarType=FINANCIAL_CENTER with a sub-national CalendarCode ('MY_KEDAH') is legal (round-16 fix)",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "COUNTRY", "code": "ae", "role": "PAYING_BANK"},
        "CalendarReference calendarType=COUNTRY with a lowercase code ('ae') is still rejected (CalendarCode requires uppercase)",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "COUNTRY", "code": "A", "role": "PAYING_BANK"},
        "CalendarReference calendarType=COUNTRY with a 1-character code ('A', below CalendarCode's minLength:2) is rejected",
    )
    expect_valid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BOFAAE2X", "role": "CORRESPONDENT_BANK"},
        "CalendarReference calendarType=INSTITUTION with a well-formed BicCode ('BOFAAE2X') is legal",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BANK_AE", "role": "CORRESPONDENT_BANK"},
        "CalendarReference calendarType=INSTITUTION with a non-BIC-shaped code ('BANK_AE') is rejected",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "INSTITUTION", "code": "BANK12XX", "role": "CORRESPONDENT_BANK"},
        "CalendarReference calendarType=INSTITUTION with a digit in the BIC country-code position ('BANK12XX') is now rejected",
    )
    expect_valid(
        "CalendarReference",
        {"calendarType": "CURRENCY_CLEARING", "code": "USD_FEDWIRE", "role": "CURRENCY_CLEARING"},
        "CalendarReference calendarType=CURRENCY_CLEARING with a settlement-system code ('USD_FEDWIRE') is legal under CalendarCode (round-16 fix; previously unconstrained)",
    )
    expect_invalid(
        "CalendarReference",
        {"calendarType": "CURRENCY_CLEARING", "code": "", "role": "CURRENCY_CLEARING"},
        "CalendarReference calendarType=CURRENCY_CLEARING with an empty-string code is rejected (CalendarCode's minLength:2, round-16 fix)",
    )

    # -----------------------------------------------------------------
    # round 16, item P2 (design doc 3.62): the same CalendarCode/BicCode
    # discriminated oneOf extended to CalendarVersionRef.code and
    # CalendarAssessment.code, for consistency with CalendarReference.code
    # -- closing the named follow-up left open in the v2.9.0 hardening
    # notes. CalendarAssessment already carries two independent oneOf
    # groups (round 6); the round-6 regression cases are re-run here
    # alongside the new group to confirm no interference.
    # -----------------------------------------------------------------
    expect_valid(
        "CalendarVersionRef",
        {"calendarType": "COUNTRY", "code": "AE_FEDERAL", "version": "2026.01"},
        "CalendarVersionRef calendarType=COUNTRY with a non-2-letter CalendarCode ('AE_FEDERAL') is legal",
    )
    expect_invalid(
        "CalendarVersionRef",
        {"calendarType": "INSTITUTION", "code": "AE", "version": "2026.01"},
        "CalendarVersionRef calendarType=INSTITUTION with a non-BIC-shaped code ('AE') is rejected",
    )

    calendar_assessment_base = {
        "calendarType": "COUNTRY",
        "code": "AE",
        "date": "2026-12-25",
        "businessDay": True,
        "calendarVersion": "2026.12.10",
        "manualReviewRequired": False,
        "automaticAdjustmentAllowed": True,
    }
    # Round-6 regressions, re-confirmed unaffected by the new third oneOf group:
    ca_bad_1 = copy.deepcopy(calendar_assessment_base)
    ca_bad_1["reasonCode"] = "FORCE_MAJEURE_EVENT"
    expect_invalid("CalendarAssessment", ca_bad_1, "CalendarAssessment regression: businessDay=true + reasonCode still rejected after round-16 group 3 addition")
    expect_valid("CalendarAssessment", calendar_assessment_base, "CalendarAssessment regression: well-formed businessDay=true entry still valid after round-16 group 3 addition")
    # New group 3 cases:
    ca_bad_2 = copy.deepcopy(calendar_assessment_base)
    ca_bad_2["calendarType"] = "INSTITUTION"
    ca_bad_2["code"] = "BANK_AE"
    expect_invalid("CalendarAssessment", ca_bad_2, "CalendarAssessment calendarType=INSTITUTION with a non-BIC-shaped code ('BANK_AE') is rejected (round-16 group 3)")
    ca_good_2 = copy.deepcopy(calendar_assessment_base)
    ca_good_2["calendarType"] = "CURRENCY_CLEARING"
    ca_good_2["code"] = "USD_FEDWIRE"
    expect_valid("CalendarAssessment", ca_good_2, "CalendarAssessment calendarType=CURRENCY_CLEARING with 'USD_FEDWIRE' is legal (round-16 group 3)")

    # Cross-field / cross-time rules the reviewer also asked about --
    # calculationWindowStartDate <= calculationWindowEndDate, and
    # resolvedAt not being later than the actual calculation/query time --
    # are explicitly NOT schema-testable here: OpenAPI 3.0.3's Draft-4
    # compatible subset has no way to compare the values of two sibling
    # properties to each other (that needs `if`/`then` with numeric/date
    # comparison, draft-07+, or a custom keyword), and "later than the
    # actual current time" requires a wall-clock reference a static JSON
    # payload validator does not have. Both remain documented as SERVICE-
    # or Integration-test-enforced (see the design doc's 3.38/3.39 notes
    # and its test-pyramid table), not asserted here.

    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s) did not behave as expected:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("ALL SEMANTIC VALIDATION CHECKS PASSED (positive + negative).")


if __name__ == "__main__":
    main()