# Tempest — Telegraph STORM_ALERT Miner

Tempest is a deterministic, inspectable storm-risk miner built for Telegraph's `STORM_ALERT` intent. It accepts a place name or coordinates, reads live hourly data from Open-Meteo, and emits both a canonical label and the underlying hazard evidence.

Read [HACKATHON-INTELLIGENCE.md](./HACKATHON-INTELLIGENCE.md) before registration. It records the important Explorer and Discord findings, operational traps, and the exact public questions to ask the Telegraph team.

## Run

```bash
npm test
npm start
curl -X POST http://localhost:3000/v1/storm-alert -H "content-type: application/json" -d '{"location":"Lagos","hours":24}'
```

## Deploy and register

1. Push this folder to a public GitHub repository.
2. Deploy the Dockerfile on Render, Railway, Fly.io, or another always-on HTTPS host.
3. Replace the two placeholders in `tempest-miner.yaml`.
4. Validate the YAML with Telegraph's validation endpoint and register it using the official hackathon flow.
5. Keep `/health` under uptime monitoring through the full Track 3 period.

## Competitive design

- Focused on one intent so scoring failures are diagnosable.
- Deterministic thresholds make every result reproducible.
- `label`, `confidence`, and `reason` are top-level and explicitly mapped.
- Raw measurements, units, timing, source, and methodology version make the output useful to both validators and downstream applications.
- GET and POST inputs accept the common field aliases seen in the current network.

Before registration, confirm the canonical evaluator's expected label vocabulary with the Telegraph team in Discord. If it expects a boolean or a different enum, change `label` while retaining the richer response fields.
