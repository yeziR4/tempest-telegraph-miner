import test from "node:test";
import assert from "node:assert/strict";
import { scoreForecast } from "../src/risk.js";

const location = { name: "Lagos", country: "Nigeria", latitude: 6.45, longitude: 3.4 };
const hourly = (overrides = {}) => ({
  time: ["2026-08-26T12:00", "2026-08-26T13:00"],
  wind_gusts_10m: [10, 20], precipitation: [0, 1], snowfall: [0, 0],
  temperature_2m: [28, 29], weather_code: [1, 2], ...overrides
});

test("returns none for ordinary weather", () => {
  const result = scoreForecast(hourly(), location, 2);
  assert.equal(result.level, "none");
  assert.equal(result.breach, false);
});

test("returns warning for dangerous gusts", () => {
  const result = scoreForecast(hourly({ wind_gusts_10m: [50, 101] }), location, 2);
  assert.equal(result.level, "warning");
  assert.equal(result.hazards[0].type, "wind");
});

test("detects WMO thunderstorm codes", () => {
  const result = scoreForecast(hourly({ weather_code: [2, 96] }), location, 2);
  assert.equal(result.thunderstorms, true);
  assert.equal(result.level, "warning");
});
