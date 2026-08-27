import test from "node:test";
import assert from "node:assert/strict";
import { scoreForecast } from "../src/risk.js";
import { parseRequest } from "../src/server.js";

const location = { name: "Lagos", country: "Nigeria", latitude: 6.45, longitude: 3.4 };
const hourly = (overrides = {}) => ({
  time: ["2026-08-26T12:00", "2026-08-26T13:00"],
  wind_gusts_10m: [10, 20], precipitation: [0, 1], snowfall: [0, 0],
  wind_speed_10m: [8, 15], wind_direction_10m: [180, 225],
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
  assert.equal(result.level, "advisory");
  assert.equal(result.verdict, "low");
  assert.equal(result.storm_expected, true);
  assert.equal(result.thunderstorm, true);
});

test("parses natural-language location and duration", () => {
  const input = parseRequest({ query: "Is a storm expected in Miami over the next 48 hours?" });
  assert.equal(input.location, "Miami");
  assert.equal(input.hours, 48);
});

test("supports day aliases and caps the forecast window", () => {
  assert.equal(parseRequest({ location: "Lagos", days: 3 }).hours, 72);
  assert.equal(parseRequest({ location: "Lagos", forecast_days: 30 }).hours, 384);
});

test("returns continuous risk and labelled wind facts", () => {
  const result = scoreForecast(hourly({ wind_gusts_10m: [39, 62], precipitation: [0, 4] }), location, 2);
  assert.equal(result.risk_score, 0.5);
  assert.equal(result.max_wind_speed_kmh, 15);
  assert.equal(result.wind_direction, "south-west");
  assert.match(result.reason, /Overall risk 0.5/);
});

