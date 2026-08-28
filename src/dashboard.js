const EXPLORER = "https://explorer.telegraphprotocol.com";

export async function observatoryData(fetchImpl = fetch) {
  const [epochRes, boardRes, questionsRes] = await Promise.all([
    fetchImpl(`${EXPLORER}/api/epoch`),
    fetchImpl(`${EXPLORER}/api/leaderboard/miners?intent=STORM_ALERT&limit=100`),
    fetchImpl(`${EXPLORER}/api/daemon/api/questions?since_hours=72&limit=500&offset=0`)
  ]);
  if (!epochRes.ok || !boardRes.ok || !questionsRes.ok) throw new Error("Explorer data unavailable");
  const epoch = await epochRes.json();
  const board = await boardRes.json();
  const questions = await questionsRes.json();
  const traffic = (questions.results ?? []).filter((row) =>
    row.routing?.intent === "STORM_ALERT" || row.routing?.miner_slug === "tempest-storm-intelligence"
  ).map((row) => ({
    created_at: row.created_at,
    question: row.question?.text ?? "",
    miner: row.routing?.miner_slug ?? "",
    status: row.status,
    duration_ms: row.execution?.duration_ms ?? null,
    result: row.execution?.result ?? null,
    signal_hash: row.signal_hash
  }));
  return {
    generated_at: new Date().toISOString(),
    epoch,
    leaderboard: board.intents?.STORM_ALERT ?? [],
    traffic,
    note: "Traffic is public routed demand, not Telegraph's hidden canonical evaluation fixtures."
  };
}

export const dashboardHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tempest Observatory</title><style>
:root{color-scheme:dark;--bg:#071018;--card:#0d1b27;--line:#1d3445;--cyan:#52d7ff;--green:#67f5a5;--muted:#8fa8ba}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#12304a 0,transparent 35%),var(--bg);font:15px system-ui;color:#eef8ff}.wrap{max-width:1120px;margin:auto;padding:32px 18px}h1{font-size:clamp(28px,5vw,52px);margin:0}.sub{color:var(--muted);margin:8px 0 28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.card{background:#0d1b27dd;border:1px solid var(--line);border-radius:16px;padding:18px}.big{font-size:30px;font-weight:800;color:var(--cyan)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px;border-bottom:1px solid var(--line)}th{color:var(--muted)}.tempest{color:var(--green);font-weight:800}.feed{display:grid;gap:12px;margin-top:12px}.q{font-weight:700}.meta,.note{color:var(--muted);font-size:13px}.answer{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px;padding:10px;background:#071018;border-radius:10px;max-height:180px;overflow:auto}h2{margin-top:30px}button{background:var(--cyan);border:0;border-radius:999px;padding:11px 16px;font-weight:800;cursor:pointer}.top{display:flex;justify-content:space-between;gap:12px;align-items:end}.error{color:#ff8d8d}.demo{margin:22px 0}.form{display:grid;grid-template-columns:1fr 150px auto;gap:10px}.form input,.form select{width:100%;background:#071018;color:#eef8ff;border:1px solid var(--line);border-radius:10px;padding:12px}.verdict{font-size:24px;font-weight:900;color:var(--green);margin-top:14px}@media(max-width:650px){.form{grid-template-columns:1fr}.top{align-items:start}}</style></head>
<body><main class="wrap"><div class="top"><div><h1>Tempest Observatory</h1><p class="sub">Live STORM_ALERT ranking, epochs and routed demand.</p></div><button onclick="load()">Refresh</button></div>
<section class="card demo"><h2 style="margin-top:0">Could weather disrupt your plans?</h2><p class="note">Enter any city. Tempest converts live forecast data into a simple storm-risk decision and explains why.</p><div class="form"><input id="place" value="Lagos" placeholder="City or location"><select id="hours"><option value="24">Next 24 hours</option><option value="48" selected>Next 48 hours</option><option value="72">Next 3 days</option><option value="168">Next 7 days</option></select><button onclick="checkWeather()">Check storm risk</button></div><div id="decision"></div></section>
<section class="grid"><div class="card"><div class="meta">Current epoch</div><div class="big" id="epoch">—</div></div><div class="card"><div class="meta">Tempest rank</div><div class="big" id="rank">—</div></div><div class="card"><div class="meta">Tempest score</div><div class="big" id="score">—</div></div><div class="card"><div class="meta">Next epoch</div><div class="big" id="next">—</div></div></section>
<h2>STORM_ALERT leaderboard</h2><div class="card"><table><thead><tr><th>Rank</th><th>Miner</th><th>Score</th></tr></thead><tbody id="board"></tbody></table></div>
<h2>Public routed traffic</h2><p class="note">These are real network requests—not hidden canonical evaluation fixtures.</p><div id="feed" class="feed"></div><p id="status" class="error"></p>
<script>const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));async function checkWeather(){decision.innerHTML='<p class="note">Reading live forecast data…</p>';try{const d=await fetch('/v1/storm-alert',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({location:place.value,hours:Number(hours.value)})}).then(r=>r.json());if(d.error)throw Error(d.error);const safe=d.storm_expected?'Potential disruption':'No major disruption expected';decision.innerHTML='<div class="verdict">'+esc(safe)+' · '+esc(d.verdict)+'</div><p>'+esc(d.reason)+'</p><div class="meta">Risk '+esc(d.risk_score)+'/1 · Gusts '+esc(d.max_wind_gust_kmh)+' km/h · Rain '+esc(d.max_precipitation_mm)+' mm · Source '+esc(d.source)+'</div>'}catch(e){decision.innerHTML='<p class="error">'+esc(e.message)+'</p>'}}async function load(){status.textContent='';try{const d=await fetch('/v1/observatory',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Observatory unavailable');return r.json()});epoch.textContent=d.epoch.current_epoch;const t=d.leaderboard.find(x=>x.miner_slug==='tempest-storm-intelligence');rank.textContent=t?'#'+t.rank:'—';score.textContent=t?Number(t.score).toFixed(6):'—';next.textContent=new Date(d.epoch.next_epoch_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});board.innerHTML=d.leaderboard.map(x=>'<tr class="'+(x.miner_slug==='tempest-storm-intelligence'?'tempest':'')+'"><td>#'+x.rank+'</td><td>'+esc(x.miner_slug)+'</td><td>'+Number(x.score).toFixed(9)+'</td></tr>').join('');feed.innerHTML=d.traffic.length?d.traffic.map(x=>'<article class="card"><div class="q">'+esc(x.question)+'</div><div class="meta">'+esc(x.miner)+' · '+new Date(x.created_at).toLocaleString()+' · '+esc(x.duration_ms)+' ms</div><div class="answer">'+esc(JSON.stringify(x.result,null,2))+'</div></article>').join(''):'<div class="card note">No public STORM_ALERT traffic found in the last 72 hours.</div>'}catch(e){status.textContent=e.message}}load();setInterval(load,60000)</script></main></body></html>`;

