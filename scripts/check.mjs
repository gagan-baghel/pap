#!/usr/bin/env node
// The shared date/geo/reliability logic decides what people see and when they see it,
// so it gets a runnable check. No test framework: transpile the one pure module and assert.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const src = readFileSync(new URL("../convex/shared.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const file = join(mkdtempSync(join(tmpdir(), "pap-")), "shared.mjs");
writeFileSync(file, js);
const s = await import(`file://${file}`);

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = new Date("2026-09-12T10:00:00+05:30").getTime();
const tz = "Asia/Kolkata";

// ---- plan phase: the badge on every card ----
const plan = (startAt, endAt, status = "active") => ({ startAt, endAt, status });
assert.equal(s.planPhase(plan(now + 4 * HOUR, now + 5 * HOUR), now), "upcoming");
assert.equal(s.planPhase(plan(now + 30 * MIN, now + 2 * HOUR), now), "soon");
assert.equal(s.planPhase(plan(now - 10 * MIN, now + HOUR), now), "live");
assert.equal(s.planPhase(plan(now - 3 * HOUR, now - HOUR), now), "ended");
assert.equal(s.planPhase(plan(now + HOUR, now + 2 * HOUR, "cancelled"), now), "cancelled");
// a plan is live right up to its end, and ended the instant it passes
assert.equal(s.planPhase(plan(now - HOUR, now), now), "ended");
assert.equal(s.planPhase(plan(now, now + HOUR), now), "live");

// ---- wording people read on cards ----
assert.equal(s.formatWhen(now + 25 * MIN, now, tz), "in 25 min");
assert.equal(s.formatWhen(now + 3 * HOUR, now, tz), "today 1pm");
assert.equal(s.formatWhen(now + 10 * HOUR, now, tz), "tonight 8pm");
assert.equal(s.formatWhen(now + 24 * HOUR, now, tz), "tomorrow 10am");
assert.equal(s.formatWhenRange(now - 20 * MIN, now + HOUR, now, tz), "started 20 min ago");
assert.equal(s.formatWhenRange(now + 2 * HOUR, now + 3 * HOUR, now, tz), "today 12pm");
assert.equal(s.formatDuration(90 * MIN), "1.5 hrs");
assert.equal(s.formatCost(0), "free");
assert.match(s.formatCost(250, "INR"), /250/);

// ---- geo: discovery only reads the cells around you, so the cell maths must hold ----
const blr = { lat: 12.9719, lng: 77.6412 };
assert.equal(s.cellOf(blr.lat, blr.lng), s.cellOf(blr.lat + 0.01, blr.lng + 0.01), "1km apart stays in one cell");
assert.ok(s.cellsAround(blr.lat, blr.lng, 10).includes(s.cellOf(blr.lat, blr.lng)), "own cell is always searched");
assert.equal(s.cellsAround(blr.lat, blr.lng, 10).length, 9, "small radius = 3x3 cells");
assert.equal(s.cellsAround(blr.lat, blr.lng, 50).length, 25, "bigger radius widens the net");
// every point within the radius must fall in a searched cell, or plans go missing
for (const [dLat, dLng] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.15, 0.15]]) {
  const cells = s.cellsAround(blr.lat, blr.lng, 25);
  assert.ok(cells.includes(s.cellOf(blr.lat + dLat, blr.lng + dLng)), `point ${dLat},${dLng} is covered`);
}
assert.ok(Math.abs(s.distanceKm(12.9719, 77.6412, 12.9352, 77.6245) - 4.4) < 0.5, "indiranagar→koramangala ≈ 4.4km");
assert.equal(s.distanceKm(blr.lat, blr.lng, blr.lat, blr.lng), 0);
assert.equal(s.formatDistance(0.4), "400 m");
assert.equal(s.formatDistance(2.35), "2.4 km");
assert.equal(s.approx(12.97193), 12.97, "stored coordinates are rounded to ~1km");

// ---- reliability: shown on profiles, so it must not lie ----
assert.equal(s.reliability({ attended: 2, noShows: 0 }), null, "too little history to show a number");
assert.equal(s.reliability({ attended: 10, noShows: 0 }), 100);
assert.equal(s.reliability({ attended: 9, noShows: 1 }), 90);
assert.equal(s.reliability({ attended: 8, noShows: 0, lateCancels: 2 }), 89, "late cancels count half");

// ---- thread keys: two people must always resolve to one conversation ----
assert.equal(s.threadKeyForDm("aaa", "bbb"), s.threadKeyForDm("bbb", "aaa"));
assert.equal(s.threadKeyForPlan("p1"), "p:p1");
assert.equal(s.category("nope").key, "other", "unknown categories fall back");

console.log("✓ shared logic checks passed");
