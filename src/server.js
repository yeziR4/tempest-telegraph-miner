import http from "node:http";
import { scoreForecast } from "./risk.js";

const port = Number(process.env.PORT ?? 3000);
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  if (req.method === "GET") return {};
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32_768) throw new Error("request body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function resolveLocation(input) {
  const latitude = Number(input.latitude ?? input.lat);
  const longitude = Number(input.longitude ?? input.lon);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("invalid coordinates");
    return { latitude, longitude, name: input.location ?? `${latitude},${longitude}`, country: input.country ?? "" };
  }
  const name = String(input.location ?? input.q ?? input.query ?? input.question ?? "").trim();
  if (!name) throw new Error("provide location or latitude/longitude");
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("geocoder unavailable");
  const result = (await response.json()).results?.[0];
  if (!result) throw new Error(`location not found: ${name}`);
  return { latitude: result.latitude, longitude: result.longitude, name: result.name, country: result.country };
}

async function forecast(location, hours) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", location.latitude);
  url.searchParams.set("longitude", location.longitude);
  url.searchParams.set("hourly", "temperature_2m,precipitation,snowfall,weather_code,wind_gusts_10m");
  url.searchParams.set("forecast_hours", String(hours));
  url.searchParams.set("timezone", "UTC");
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`forecast source returned ${response.status}`);
  const data = await response.json();
  if (!data.hourly?.time?.length) throw new Error("forecast source returned no hourly data");
  return data.hourly;
}

export async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname === "/health") return json(res, 200, { status: "ok", service: "tempest-miner" });
  if (url.pathname === "/miner.yaml") {
    res.writeHead(302, { location: "https://example.com/tempest-miner.yaml" });
    return res.end();
  }
  if (!["/storm", "/v1/storm-alert"].includes(url.pathname)) return json(res, 404, { error: "not found" });
  try {
    const body = await readBody(req);
    const input = { ...Object.fromEntries(url.searchParams), ...body };
    const hours = Math.min(72, Math.max(1, Number(input.hours ?? input.window_hours ?? 24)));
    const location = await resolveLocation(input);
    const hourly = await forecast(location, hours);
    return json(res, 200, scoreForecast(hourly, location, hours));
  } catch (error) {
    return json(res, 400, { error: error.message, intent: "STORM_ALERT" });
  }
}

if (process.env.NODE_ENV !== "test") http.createServer(handler).listen(port, () => console.log(`Tempest listening on ${port}`));
