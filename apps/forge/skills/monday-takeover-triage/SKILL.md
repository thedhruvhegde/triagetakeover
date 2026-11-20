---
name: monday-takeover-triage
description: Weekly triage of ADAS takeover/disengagement tickets with Takeover Triage. Use when a user wants to triage a batch of takeover tickets, find new failure modes, check build regressions against km driven, or find scenario-test coverage gaps.
allowed-tools: list-novel-since build-regression-check list-coverage-gaps get-cluster-for-event explain-match suggest-owner
metadata: { app: takeover-triage, version: "1.0.0" }
---
1. Novel first: call list-novel-since (default: since last "Mark triaged"). For each, call explain-match to show why it did not fit.
2. Regressions: call build-regression-check for the newest build; report regression-likely clusters with p_raw, p_holm, rates per 1,000 km and the caveat.
3. Coverage: call list-coverage-gaps; list uncovered clusters with the missing dimensions.
4. Routing: for each regression or uncovered cluster, call suggest-owner and report team + source + rule.
5. Offer (do not perform) links, splits and stubs; perform them only on explicit request.
6. Single event: when the user asks about one takeover, call get-cluster-for-event for it, then explain-match for the why.
