const levelRank = { none: 0, advisory: 1, warning: 2, emergency: 3 };

const max = (values) => Math.max(...values.map(Number).filter(Number.isFinite), 0);
const sum = (values) => values.map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0);

function riskScore(gustKmh, thunder, maxHourlyPrecipMm) {
  const anchors = [[0, 0], [39, 0.25], [62, 0.5], [89, 0.75], [118, 0.9], [160, 1]];
  let score = 1;
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (gustKmh <= x1) {
      score = y0 + ((gustKmh - x0) / (x1 - x0)) * (y1 - y0);
      break;
    }
  }
  if (thunder) score += 0.2;
  if (maxHourlyPrecipMm >= 10) score += 0.1;
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

function compass(degrees) {
  if (!Number.isFinite(degrees)) return null;
  const points = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function hazard(type, level, value, unit, threshold, validAt) {
  return { type, level, value, unit, threshold, valid_at: validAt };
}

export function scoreForecast(hourly, location, hours) {
  const take = (field) => (hourly[field] ?? []).slice(0, hours);
  const times = take("time");
  const gusts = take("wind_gusts_10m");
  const winds = take("wind_speed_10m");
  const directions = take("wind_direction_10m");
  const precipitation = take("precipitation");
  const snowfall = take("snowfall");
  const temperatures = take("temperature_2m");
  const codes = take("weather_code");

  const peakGust = max(gusts);
  const peakIndex = Math.max(0, gusts.indexOf(peakGust));
  const maxWind = max(winds);
  const windDirection = compass(Number(directions[peakIndex]));
  const totalPrecip = sum(precipitation);
  const maxHourlyPrecip = max(precipitation);
  const totalSnow = sum(snowfall);
  const maxTemp = max(temperatures);
  const minTemp = Math.min(...temperatures.map(Number).filter(Number.isFinite), 999);
  const thunderIndex = codes.findIndex((code) => Number(code) >= 95);
  const hazards = [];

  if (peakGust >= 90) hazards.push(hazard("wind", "warning", peakGust, "km/h", 90, times[gusts.indexOf(peakGust)]));
  else if (peakGust >= 60) hazards.push(hazard("wind", "advisory", peakGust, "km/h", 60, times[gusts.indexOf(peakGust)]));

  if (totalPrecip >= 50) hazards.push(hazard("heavy_rain", "warning", totalPrecip, "mm", 50, times.at(-1)));
  else if (totalPrecip >= 25) hazards.push(hazard("heavy_rain", "advisory", totalPrecip, "mm", 25, times.at(-1)));

  if (totalSnow >= 15) hazards.push(hazard("snow", "warning", totalSnow, "cm", 15, times.at(-1)));
  else if (totalSnow >= 5) hazards.push(hazard("snow", "advisory", totalSnow, "cm", 5, times.at(-1)));

  if (thunderIndex >= 0) hazards.push(hazard("thunderstorm", codes[thunderIndex] >= 96 ? "warning" : "advisory", codes[thunderIndex], "WMO code", 95, times[thunderIndex]));
  if (maxTemp >= 40) hazards.push(hazard("extreme_heat", maxTemp >= 45 ? "warning" : "advisory", maxTemp, "C", 40, times[temperatures.indexOf(maxTemp)]));
  if (minTemp <= -15) hazards.push(hazard("extreme_cold", minTemp <= -25 ? "warning" : "advisory", minTemp, "C", -15, times[temperatures.indexOf(minTemp)]));

  const severity = riskScore(peakGust, thunderIndex >= 0, maxHourlyPrecip);
  const verdict = severity >= 0.85 ? "severe" : severity >= 0.65 ? "high" : severity >= 0.4 ? "moderate" : severity >= 0.2 ? "low" : "none";
  const level = verdict === "severe" ? "emergency" : verdict === "high" ? "warning" : verdict === "none" ? "none" : "advisory";
  const peakAt = times[gusts.indexOf(peakGust)] ?? hazards[0]?.valid_at ?? null;
  const summary = `Storm forecast for ${location.name} over the next ${hours} hours: ` +
    `sustained wind up to ${Number(maxWind.toFixed(1))} km/h, peak gusts ${Number(peakGust.toFixed(1))} km/h, ` +
    `maximum hourly precipitation ${Number(maxHourlyPrecip.toFixed(1))} mm, thunderstorms ${thunderIndex >= 0 ? "expected" : "not expected"}. ` +
    `Overall risk ${severity} on a 0 to 1 scale, graded ${verdict}.`;

  return {
    intent: "STORM_ALERT",
    label: level,
    level,
    verdict,
    breach: level !== "none",
    storm_expected: level !== "none",
    confidence: 0.97,
    risk: severity,
    risk_score: severity,
    summary,
    reason: summary,
    location: location.name,
    country: location.country ?? "",
    latitude: location.latitude,
    longitude: location.longitude,
    window_hours: hours,
    start_time: times[0] ?? null,
    end_time: times.at(-1) ?? null,
    peak_at: peakAt,
    valid_from: times[0] ?? null,
    valid_to: times.at(-1) ?? null,
    hazards,
    peak_gust_kmh: peakGust,
    max_wind_gust_kmh: peakGust,
    max_wind_speed_kmh: maxWind,
    wind_direction: windDirection,
    max_precipitation_mm: Number(maxHourlyPrecip.toFixed(2)),
    total_precip_mm: Number(totalPrecip.toFixed(2)),
    total_precipitation_mm: Number(totalPrecip.toFixed(2)),
    total_snowfall_cm: Number(totalSnow.toFixed(2)),
    thunderstorms: thunderIndex >= 0,
    thunderstorm: thunderIndex >= 0,
    source: "Open-Meteo forecast API",
    methodology_version: "tempest-v2"
  };
}

