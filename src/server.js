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
  if (response.ok) {
    const data = await response.json();
    if (data.hourly?.time?.length) return { hourly: data.hourly, source: "Open-Meteo forecast API" };
  }

  // Render and other shared hosts can occasionally inherit an upstream 429.
  // MET Norway provides an independent, global, keyless fallback.
  const fallback = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  fallback.searchParams.set("lat", location.latitude);
  fallback.searchParams.set("lon", location.longitude);
  const met = await fetch(fallback, {
    headers: { "user-agent": "Tempest-Telegraph-Miner/0.1 github.com/yeziR4/tempest-telegraph-miner" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!met.ok) throw new Error(`forecast sources unavailable (primary ${response.status}, fallback ${met.status})`);
  const points = (await met.json()).properties?.timeseries?.slice(0, hours) ?? [];
  if (!points.length) throw new Error("forecast sources returned no hourly data");
  const hourly = { time: [], temperature_2m: [], precipitation: [], snowfall: [], weather_code: [], wind_gusts_10m: [] };
  for (const point of points) {
    const instant = point.data?.instant?.details ?? {};
    const next = point.data?.next_1_hours ?? point.data?.next_6_hours ?? {};
    const symbol = String(next.summary?.symbol_code ?? "");
    hourly.time.push(String(point.time).replace(/:00Z$/, ""));
    hourly.temperature_2m.push(Number(instant.air_temperature ?? 0));
    hourly.precipitation.push(Number(next.details?.precipitation_amount ?? 0));
    hourly.snowfall.push(symbol.includes("snow") ? Number(next.details?.precipitation_amount ?? 0) : 0);
    hourly.weather_code.push(symbol.includes("thunder") ? 95 : 0);
    hourly.wind_gusts_10m.push(Number(instant.wind_speed_of_gust ?? instant.wind_speed ?? 0) * 3.6);
  }
  return { hourly, source: "MET Norway Locationforecast API" };
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
    const result = await forecast(location, hours);
    return json(res, 200, { ...scoreForecast(result.hourly, location, hours), source: result.source });
  } catch (error) {
    return json(res, 400, { error: error.message, intent: "STORM_ALERT" });
  }
}

if (process.env.NODE_ENV !== "test") http.createServer(handler).listen(port, () => console.log(`Tempest listening on ${port}`));
