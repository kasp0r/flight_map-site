import { findRoutes } from './routing.js';
import { ALLIANCE_ORDER, allianceOf } from './alliances.js';

const $ = (s) => document.querySelector(s);
const PALETTE = [
  '#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#f78c6b',
  '#c77dff', '#8ac926', '#ff9f1c', '#4cc9f0', '#e36414',
];
const MAX_CARDS = 25;
const AC_LIMIT = 10; // max autocomplete suggestions

let graph = null;
let world = null;
let airportSource = []; // [{ code, label, text }]
let airlineSource = [];
let currentRoutes = []; // top-N (≤ MAX_CARDS) after all filters, ranked
let filteredRoutes = []; // all after all filters, ranked
let selectedIdx = null;
let currentFrom = null;
let currentTo = null;

init();

async function init() {
  setStatus('Loading route graph…');
  try {
    const res = await fetch('./data/graph.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    graph = await res.json();
  } catch (err) {
    setStatus('Failed to load data/graph.json — run `node data/build-graph.mjs` first, and serve over HTTP (not file://).');
    console.error(err);
    return;
  }

  buildSources();
  buildAllianceSelect();
  initGlobe();
  attachAutocomplete($('#from'), airportSource);
  attachAutocomplete($('#to'), airportSource);
  attachAutocomplete($('#airline'), airlineSource);

  const airportCount = Object.keys(graph.airports).length;
  const edgeCount = Object.values(graph.routes).reduce((s, d) => s + Object.keys(d).length, 0);
  setStatus(`Ready — ${airportCount.toLocaleString()} airports · ${edgeCount.toLocaleString()} route segments.`);
  $('#go').disabled = false;
  $('#share').disabled = false;

  $('#search').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#share').addEventListener('click', () => copyLink());
  $('#toggle-panel').addEventListener('click', () => $('#panel').classList.toggle('collapsed'));
  $('#results').addEventListener('click', onResultsClick);

  hydrateFromURL();
}

// ---------- indexes / sources ----------

function buildSources() {
  airportSource = Object.entries(graph.airports)
    .map(([code, a]) => ({
      code,
      label: `${code} — ${a.n}${a.c ? ', ' + a.c : ''}, ${a.co}`,
      text: `${code} ${a.n} ${a.c} ${a.co}`.toLowerCase(),
    }))
    .sort((x, y) => x.code.localeCompare(y.code));

  airlineSource = Object.entries(graph.airlines)
    .map(([code, name]) => ({
      code,
      label: `${code} — ${name}`,
      text: `${code} ${name}`.toLowerCase(),
    }))
    .sort((x, y) => x.code.localeCompare(y.code));
}

function buildAllianceSelect() {
  const sel = $('#alliance');
  const opts = [['any', 'Any alliance'], ...ALLIANCE_ORDER.map((a) => [a, a]), ['Unaffiliated', 'Unaffiliated']];
  for (const [value, label] of opts) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
}

// ---------- autocomplete ----------

function attachAutocomplete(input, source) {
  const list = document.createElement('ul');
  list.className = 'ac-list';
  input.parentElement.appendChild(list);
  let open = false;

  const close = () => { list.replaceChildren(); list.style.display = 'none'; open = false; };

  const highlight = (idx) => {
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === idx));
  };

  const pick = (item) => {
    input.value = item.label;
    input.dataset.code = item.code;
    close();
  };

  const openFor = (q) => {
    q = q.trim().toLowerCase();
    if (!q) return close();
    const matches = [];
    for (const s of source) {
      if (s.code.toLowerCase() === q || s.text.includes(q)) {
        matches.push(s);
        if (matches.length >= AC_LIMIT) break;
      }
    }
    if (!matches.length) return close();
    list.replaceChildren();
    for (const s of matches) {
      const li = document.createElement('li');
      li.textContent = s.label;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(s); });
      list.appendChild(li);
    }
    list.style.display = 'block';
    open = true;
  };

  input.addEventListener('input', () => { delete input.dataset.code; openFor(input.value); });
  input.addEventListener('focus', () => openFor(input.value));
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    const items = [...list.children];
    let idx = items.findIndex((li) => li.classList.contains('active'));
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); highlight(idx); open = true; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); highlight(idx); }
    else if (e.key === 'Enter') {
      if (open && idx >= 0) { e.preventDefault(); items[idx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
    } else if (e.key === 'Escape') { close(); }
  });
}

// ---------- resolution ----------

function resolveAirport(input) {
  const c = input.dataset.code;
  if (c && graph.airports[c]) return c;
  const s = input.value.trim().toUpperCase();
  const m = s.match(/^([A-Z]{3})\b/);
  if (m && graph.airports[m[1]]) return m[1];
  const q = input.value.trim().toLowerCase();
  if (q.length >= 3) {
    const hit = airportSource.find((a) => a.text.includes(q));
    if (hit) return hit.code;
  }
  return null;
}

function resolveAirline(input) {
  const c = input.dataset.code;
  if (c && graph.airlines[c]) return c;
  const s = input.value.trim().toUpperCase();
  if (s.length === 2 && graph.airlines[s]) return s;
  return null;
}

function airportLabel(code) {
  const a = graph.airports[code];
  return a ? `${code} — ${a.n}${a.c ? ', ' + a.c : ''}, ${a.co}` : code;
}
function airlineLabel(code) {
  const n = graph.airlines[code];
  return n ? `${code} — ${n}` : code;
}

// ---------- globe ----------

function initGlobe() {
  world = Globe()(document.getElementById('globe'))
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('#4d9fff')
    .atmosphereAltitude(0.15)
    .arcsData([])
    .arcStartLat('startLat').arcStartLng('startLng')
    .arcEndLat('endLat').arcEndLng('endLng')
    .arcColor('color')
    .arcStroke(0.6)
    .arcAltitudeAutoScale(0.45)
    .arcLabel('label')
    .pointsData([])
    .pointLat('lat').pointLng('lon')
    .pointColor('color')
    .pointRadius(0.3)
    .pointLabel('label');
  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.5;
}

// ---------- search ----------

async function run() {
  const from = resolveAirport($('#from'));
  const to = resolveAirport($('#to'));
  if (!from || !to) { setStatus('Unknown airport — pick from the suggestions or use a 3-letter IATA code.'); return; }
  if (from === to) { setStatus('Origin and destination are the same.'); return; }

  $('#go').disabled = true;
  setStatus('Searching routes…', true);
  await new Promise((r) => setTimeout(r, 20)); // let the busy indicator paint

  const all = findRoutes(graph, from, to, 3);
  const maxStops = { any: 2, 1: 1, 0: 0 }[$('#stops').value] ?? 2;
  const alliance = $('#alliance').value;
  const airline = resolveAirline($('#airline'));

  filteredRoutes = all
    .filter((r) => r.stops <= maxStops)
    .filter((r) => alliance === 'any' || r.legs.every(([, , al]) => al.some((a) => allianceOf(a) === alliance)))
    .filter((r) => !airline || r.legs.every(([, , al]) => al.includes(airline)));

  currentRoutes = filteredRoutes.slice(0, MAX_CARDS);
  selectedIdx = null;
  currentFrom = from;
  currentTo = to;

  applyRouteParam();

  renderResults(filteredRoutes.length);
  draw();
  updateURL();
  $('#go').disabled = false;

  const counts = [0, 1, 2].map((s) => all.filter((r) => r.stops === s).length);
  const filterActive = maxStops < 2 || alliance !== 'any' || airline;
  setStatus(
    `${from} → ${to}: ${all.length.toLocaleString()} routings ` +
    `(direct ${counts[0].toLocaleString()} · 1-stop ${counts[1].toLocaleString()} · 2-stop ${counts[2].toLocaleString()})` +
    (filterActive ? ` · ${filteredRoutes.length.toLocaleString()} match filters` : '') +
    (filteredRoutes.length > MAX_CARDS ? ` · showing top ${MAX_CARDS}` : '')
  );
}

// ---------- rendering ----------

function renderResults(total) {
  const el = $('#results');
  el.replaceChildren();
  if (!total) {
    el.innerHTML = '<p class="muted">No routings found with this filter. Try increasing max stops or clearing airline/alliance filters.</p>';
    return;
  }
  currentRoutes.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (i === selectedIdx ? ' selected' : '');
    card.dataset.i = i;

    const codes = new Set(r.legs.flatMap(([, , al]) => al));
    const names = [...codes].map((c) => graph.airlines[c] || c);
    const summary = names.slice(0, 4).join(' · ') + (names.length > 4 ? ` +${names.length - 4} more` : '');

    const detourCls = r.stops === 0 ? '' : (r.detour < 1.3 ? 'good' : r.detour < 2 ? 'warn' : 'bad');

    card.innerHTML = `
      <div class="card-head">
        <span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <b>${r.stops === 0 ? 'Direct' : `${r.stops} stop${r.stops > 1 ? 's' : ''}`}</b>
        ${r.stops ? `<span class="detour ${detourCls}" title="route length ÷ direct great-circle distance">${r.detour}× detour</span>` : ''}
        <span class="km">${Math.round(r.distanceKm).toLocaleString()} km</span>
        <button class="copy" data-i="${i}" title="Copy link to this routing" aria-label="Copy link">🔗</button>
      </div>
      ${r.legs.map(([f, t, al]) => `
        <div class="leg">
          <span class="codes">${f} → ${t}</span>
          <span class="al">${al.map((a) => graph.airlines[a] || a).join(' · ') || 'airline unknown'}</span>
        </div>`).join('')}
      ${r.stops ? `<div class="al-summary">${summary}</div>` : ''}`;

    el.appendChild(card);
  });
}

function select(i) {
  selectedIdx = selectedIdx === i ? null : i;
  document.querySelectorAll('#results .card')
    .forEach((c, j) => c.classList.toggle('selected', j === selectedIdx));
  updateURL();
  draw();
}

function onResultsClick(e) {
  const copyBtn = e.target.closest('.copy');
  if (copyBtn) { copyRouteLink(Number(copyBtn.dataset.i)); return; }
  const card = e.target.closest('.card');
  if (card) select(Number(card.dataset.i));
}

function routePath(r) {
  return [currentFrom, ...r.legs.map(([, t]) => t)].join('-');
}

function draw() {
  const list = selectedIdx == null ? currentRoutes : [currentRoutes[selectedIdx]];
  const arcs = [];
  const pts = new Map();
  for (const r of list) {
    const i = currentRoutes.indexOf(r);
    const color = PALETTE[i % PALETTE.length];
    for (const [f, t, al] of r.legs) {
      const A = graph.airports[f];
      const B = graph.airports[t];
      arcs.push({
        startLat: A.lat, startLng: A.lon, endLat: B.lat, endLng: B.lon, color,
        label: `${f} → ${t} · ${al.map((a) => graph.airlines[a] || a).join(', ') || 'airline unknown'}`,
      });
      const pt = (code, ap) => ({
        lat: ap.lat, lon: ap.lon, color: '#ffffff',
        label: `<b>${code}</b> — ${ap.n}${ap.c ? ', ' + ap.c : ''}, ${ap.co}`,
      });
      pts.set(f, pt(f, A));
      pts.set(t, pt(t, B));
    }
  }
  world.arcsData(arcs).pointsData([...pts.values()]);
  // Auto-rotate the idle overview; freeze while a single routing is pinned.
  world.controls().autoRotate = selectedIdx === null;
}

// ---------- shareable URLs ----------

function buildURL(extra = {}) {
  const p = new URLSearchParams();
  const from = $('#from').dataset.code, to = $('#to').dataset.code;
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  p.set('stops', $('#stops').value);
  if ($('#alliance').value !== 'any') p.set('alliance', $('#alliance').value);
  if ($('#airline').dataset.code) p.set('airline', $('#airline').dataset.code);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `${location.pathname}?${q}` : location.pathname;
}

function updateURL() {
  const extra = selectedIdx != null && currentRoutes[selectedIdx]
    ? { route: routePath(currentRoutes[selectedIdx]) }
    : {};
  history.replaceState(null, '', buildURL(extra));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function copyLink() {
  const url = new URL(buildURL(), location.href).href;
  if (await copyText(url)) flashStatus('Link copied.');
}

async function copyRouteLink(i) {
  const r = currentRoutes[i];
  if (!r) return;
  const url = new URL(buildURL({ route: routePath(r) }), location.href).href;
  if (await copyText(url)) flashStatus('Link to this routing copied.');
}

function applyRouteParam() {
  const route = new URLSearchParams(location.search).get('route');
  if (!route) return;
  const idx = currentRoutes.findIndex((r) => routePath(r) === route.toUpperCase());
  if (idx >= 0) selectedIdx = idx;
}

// ---------- deep link hydration ----------

function hydrateFromURL() {
  const p = new URLSearchParams(location.search);
  const from = p.get('from'), to = p.get('to');
  const stops = p.get('stops'), alliance = p.get('alliance'), airline = p.get('airline');

  if (from && graph.airports[from]) {
    $('#from').value = airportLabel(from);
    $('#from').dataset.code = from;
  }
  if (to && graph.airports[to]) {
    $('#to').value = airportLabel(to);
    $('#to').dataset.code = to;
  }
  if (stops && ['any', '1', '0'].includes(stops)) $('#stops').value = stops;
  if (alliance && [...ALLIANCE_ORDER, 'Unaffiliated'].includes(alliance)) $('#alliance').value = alliance;
  if (airline && graph.airlines[airline]) {
    $('#airline').value = airlineLabel(airline);
    $('#airline').dataset.code = airline;
  }

  if (from && to && graph.airports[from] && graph.airports[to]) run();
}

// ---------- helpers ----------

function setStatus(msg, busy = false) {
  $('#status-text').textContent = msg;
  $('#spinner').style.display = busy ? 'inline-block' : 'none';
}

let flashTimer = null;
function flashStatus(msg) {
  clearTimeout(flashTimer);
  const prev = $('#status-text').textContent;
  setStatus(msg);
  flashTimer = setTimeout(() => { $('#status-text').textContent = prev; $('#spinner').style.display = 'none'; }, 1800);
}
