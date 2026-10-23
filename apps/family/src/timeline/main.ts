// Her life on a glowing river of time (three.js). Every orb is a story she told, placed at the year
// she said in her own words (gold) or the year her family confirmed (teal); stories not yet placed
// float as a violet constellation near "now". Threads join stories that name the same person or
// place. The view polls the family API every 3 s, so a story told to the simulator appears live.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import './timeline.css';

// ---------- data (GET /api/family/timeline, built in packages/core/src/timeline.ts) ----------

interface Voice { sessionId: string; name: string; relation: string; quotes: string[]; toldOn: string }
interface TEvent {
  id: string; storyKey?: string; title: string; year: number | null; yearSource: 'said' | 'family' | null;
  yearQuote?: string; yearBy?: string; toldAt: string; toldOn: string; quotes: string[];
  entities: { id: string; name: string; kind: string }[]; photoUrl?: string; retellOf?: string;
  answers?: { question: string; asker: string }; voices: Voice[];
}
interface Timeline {
  elder: string; from: number | null; to: number; events: TEvent[];
  threads: { entityId: string; name: string; kind: string; events: string[] }[]; updatedAt: string;
}

const API = '/api/family/timeline';
const POLL_MS = 3000;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = {
  said: new THREE.Color('#ffc65c'), family: new THREE.Color('#3fe0c5'), undated: new THREE.Color('#b18cff'),
  voice: new THREE.Color('#ff7eb6'),
  thread: { person: '#ff9ac8', place: '#7cf0a0', thing: '#ffd27a', event: '#a99bff' } as Record<string, string>,
};

// ---------- scene ----------

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(window.innerWidth, window.innerHeight);
labels.domElement.className = 'tl-labels';
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05070f');
scene.fog = new THREE.FogExp2('#05070f', 0.0085);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
const HOME = { pos: new THREE.Vector3(0, 26, 112), target: new THREE.Vector3(0, 6, 0) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, labels.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 220;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.25;

scene.add(new THREE.AmbientLight('#8aa0ff', 0.35));
const key = new THREE.PointLight('#9fd8ff', 400, 0, 1.6);
key.position.set(0, 40, 30);
scene.add(key);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.16);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Soft round sprite texture used for halos, particles and stars.
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = glowTexture();

// Stars.
{
  const n = 2200;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 140 + Math.random() * 260, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 1.4, map: GLOW, transparent: true, depthWrite: false, color: '#9fb4ff', opacity: 0.7, blending: THREE.AdditiveBlending,
  }));
  stars.name = 'stars';
  scene.add(stars);
}

// ---------- the river of time ----------

const LEN = 150; // world units from the first year to now
let yearFrom = 1950, yearTo = new Date().getFullYear();
let river: THREE.CatmullRomCurve3 = makeCurve();
const riverGroup = new THREE.Group();
scene.add(riverGroup);

function makeCurve(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(-LEN / 2 + t * LEN, Math.sin(t * Math.PI * 2.2) * 5, Math.cos(t * Math.PI * 1.6) * 16 - 4));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
}
/**
 * Where a year sits along the river. Long empty stretches between stories are compressed (a gap of
 * 30 quiet years takes about as much room as 9), so her stories get the space; years stay in order.
 */
let keyYears: number[] = [];
function warp(y: number): number {
  let x = 0, prev = yearFrom;
  for (const k of [...keyYears, yearTo]) {
    const stop = Math.min(y, k);
    if (stop > prev) { const gap = stop - prev; x += Math.min(gap, 6) + Math.log1p(Math.max(0, gap - 6)) * 2; }
    if (y <= k) return x;
    prev = Math.max(prev, k);
  }
  return x;
}
const uOfYear = (y: number) => THREE.MathUtils.clamp(warp(y) / Math.max(1, warp(yearTo)), 0, 1);

function buildRiver(): void {
  riverGroup.clear();
  // A warm-to-cool ribbon: the past glows amber, the present glows cyan.
  const tube = new THREE.TubeGeometry(river, 400, 0.35, 12, false);
  const colors: number[] = [];
  const pos = tube.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getX(i) + LEN / 2) / LEN, 0, 1);
    const c = new THREE.Color('#ff9d4d').lerp(new THREE.Color('#29d9ff'), t);
    colors.push(c.r, c.g, c.b);
  }
  tube.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  riverGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })));
  // Decade rings and labels.
  const first = Math.floor(yearFrom / 10) * 10;
  let lastU = -1;
  for (let y = first; y <= yearTo; y += 10) {
    if (y < yearFrom) continue;
    const u = uOfYear(y);
    if (u - lastU < 0.045 || 1 - u < 0.03) continue; // compressed decades: keep labels from overlapping
    lastU = u;
    const p = river.getPointAt(u);
    const tangent = river.getTangentAt(u);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9d4d').lerp(new THREE.Color('#29d9ff'), u), transparent: true, opacity: 0.7 }));
    ring.position.copy(p);
    ring.lookAt(p.clone().add(tangent));
    riverGroup.add(ring);
    riverGroup.add(label(`${y}s`, 'tl-decade', p.clone().add(new THREE.Vector3(0, -4.2, 0))));
  }
  const now = river.getPointAt(1);
  riverGroup.add(label('now', 'tl-decade now', now.clone().add(new THREE.Vector3(3, -4.2, 0))));
}

function label(text: string, cls: string, at: THREE.Vector3): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.copy(at);
  return o;
}

// Time flowing: particles drift along the river from the past to now.
const FLOW_N = 700;
const flowU = new Float32Array(FLOW_N);
const flowOff = new Float32Array(FLOW_N * 3);
const flowGeo = new THREE.BufferGeometry();
const flowPos = new Float32Array(FLOW_N * 3);
const flowCol = new Float32Array(FLOW_N * 3);
for (let i = 0; i < FLOW_N; i++) {
  flowU[i] = Math.random();
  flowOff.set([(Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4], i * 3);
}
flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
flowGeo.setAttribute('color', new THREE.BufferAttribute(flowCol, 3));
scene.add(new THREE.Points(flowGeo, new THREE.PointsMaterial({
  size: 0.9, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
})));
function stepFlow(dt: number): void {
  const a = new THREE.Color('#ffb36b'), b = new THREE.Color('#5fe6ff'), c = new THREE.Color();
  for (let i = 0; i < FLOW_N; i++) {
    flowU[i] = (flowU[i]! + dt * (reduceMotion ? 0 : 0.018)) % 1;
    const p = river.getPointAt(flowU[i]!);
    flowPos[i * 3] = p.x + flowOff[i * 3]!; flowPos[i * 3 + 1] = p.y + flowOff[i * 3 + 1]!; flowPos[i * 3 + 2] = p.z + flowOff[i * 3 + 2]!;
    c.copy(a).lerp(b, flowU[i]!);
    flowCol[i * 3] = c.r; flowCol[i * 3 + 1] = c.g; flowCol[i * 3 + 2] = c.b;
  }
  flowGeo.attributes.position!.needsUpdate = true;
  flowGeo.attributes.color!.needsUpdate = true;
}

// ---------- stories as orbs ----------

interface Orb {
  data: TEvent; group: THREE.Group; core: THREE.Mesh; halo: THREE.Sprite; tag: CSS2DObject;
  target: THREE.Vector3; born: number; satellites: THREE.Mesh[]; phase: number;
}
const orbs = new Map<string, Orb>();
const orbLayer = new THREE.Group();
scene.add(orbLayer);
const threadLayer = new THREE.Group();
scene.add(threadLayer);
const bursts: { pts: THREE.Points; vel: Float32Array; age: number }[] = [];

function colorOf(e: TEvent): THREE.Color {
  return e.yearSource === 'said' ? COLORS.said : e.yearSource === 'family' ? COLORS.family : COLORS.undated;
}

/** Where a story sits: on the river at its year, a little above or below so neighbours don't collide. */
function placeOf(e: TEvent, index: number, all: TEvent[]): THREE.Vector3 {
  if (e.retellOf && orbs.has(e.retellOf)) {
    const base = orbs.get(e.retellOf)!.target;
    return base.clone().add(new THREE.Vector3(2.6, 3.2, 1.4));
  }
  if (e.year === null) {
    // The undated constellation, hovering above "now", waiting for the family to place them.
    const undated = all.filter((x) => x.year === null && !x.retellOf);
    const k = undated.findIndex((x) => x.id === e.id);
    const now = river.getPointAt(1);
    const ang = k * 2.39996; // golden angle spiral
    const r = 3 + 2.2 * Math.sqrt(k + 1);
    return now.clone().add(new THREE.Vector3(-14 + Math.cos(ang) * r, 16 + Math.sin(ang) * r * 0.6, Math.sin(ang) * 3));
  }
  const same = all.filter((x) => x.year === e.year && !x.retellOf);
  const k = same.findIndex((x) => x.id === e.id);
  const p = river.getPointAt(uOfYear(e.year));
  const lift = 5 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 4.5;
  return p.clone().add(new THREE.Vector3(0, lift + (index % 3) * 0.4, 0));
}

function makeOrb(e: TEvent): Orb {
  const color = colorOf(e);
  const size = 0.9 + Math.min(1.4, e.quotes.length * 0.12 + e.entities.length * 0.06) * (e.retellOf ? 0.6 : 1);
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 3),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.1 }));
  core.userData.id = e.id;
  group.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(size * 5);
  group.add(halo);
  // A stem down to the river, like a memory rising out of time.
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
  stem.name = 'stem';
  group.add(stem);
  // Family voices orbit their story.
  const satellites = e.voices.map(() => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8),
      new THREE.MeshStandardMaterial({ color: COLORS.voice, emissive: COLORS.voice, emissiveIntensity: 2 }));
    group.add(s);
    return s;
  });
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `tl-tag ${e.yearSource ?? 'undated'}`;
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector('b')!.textContent = e.year ? String(e.year) : '?';
  el.querySelector('span')!.textContent = e.retellOf ? `${e.title} · told again` : e.title;
  // OrbitControls captures the pointer on the canvas layer; keep it off the label so the click lands here.
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  el.addEventListener('click', () => select(e.id));
  const tag = new CSS2DObject(el);
  tag.position.set(0, size + 1.6, 0);
  group.add(tag);
  orbLayer.add(group);
  return { data: e, group, core, halo, tag, target: new THREE.Vector3(), born: performance.now(), satellites, phase: Math.random() * 6 };
}

function burst(at: THREE.Vector3, color: THREE.Color): void {
  const n = reduceMotion ? 0 : 160;
  if (!n) return;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set([at.x, at.y, at.z], i * 3);
    const v = new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 10);
    vel.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.8, map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts);
  bursts.push({ pts, vel, age: 0 });
}

function buildThreads(t: Timeline): void {
  threadLayer.clear();
  for (const th of t.threads) {
    const members = th.events.map((id) => orbs.get(id)).filter((o): o is Orb => Boolean(o))
      .sort((a, b) => (a.data.year ?? 9999) - (b.data.year ?? 9999));
    for (let i = 1; i < members.length; i++) {
      const a = members[i - 1]!.target, b = members[i]!.target;
      const mid = a.clone().lerp(b, 0.5);
      mid.y += 6 + a.distanceTo(b) * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: COLORS.thread[th.kind] ?? '#ffffff', dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.55,
      }));
      line.computeLineDistances();
      line.userData.thread = th.name;
      threadLayer.add(line);
      if (i === 1) threadLayer.add(label(th.name, `tl-thread ${th.kind}`, curve.getPoint(0.5)));
    }
  }
}

// ---------- live data ----------

let timeline: Timeline | null = null;
let firstLoad = true;
let lastOk = 0;

async function refresh(): Promise<void> {
  let t: Timeline;
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    t = await r.json() as Timeline;
  } catch {
    setLive(false);
    return;
  }
  lastOk = Date.now();
  setLive(true);
  const years = t.events.map((e) => e.year).filter((y): y is number => y !== null);
  const newFrom = Math.min(...(years.length ? years : [t.to - 60])) - 4;
  const newTo = t.to + 1;
  const rangeChanged = newFrom !== yearFrom || newTo !== yearTo;
  const newKeys = [...new Set(years)].sort((a, b) => a - b);
  const keysChanged = newKeys.join() !== keyYears.join();
  yearFrom = newFrom; yearTo = newTo; keyYears = newKeys;
  if (rangeChanged || keysChanged || firstLoad) { river = makeCurve(); buildRiver(); }

  const seen = new Set<string>();
  const added: Orb[] = [];
  // First tellings first, so retellings can sit next to them.
  const ordered = [...t.events].sort((a, b) => Number(Boolean(a.retellOf)) - Number(Boolean(b.retellOf)));
  ordered.forEach((e, i) => {
    seen.add(e.id);
    let o = orbs.get(e.id);
    if (!o) { o = makeOrb(e); orbs.set(e.id, o); if (!firstLoad) added.push(o); }
    else if (o.data.year !== e.year || o.data.yearSource !== e.yearSource || o.data.voices.length !== e.voices.length || o.data.title !== e.title) {
      // Changed (placed in a year, a family voice added, retitled): rebuild in place, keep its position to animate from.
      const from = o.group.position.clone();
      orbLayer.remove(o.group);
      o = makeOrb(e);
      o.group.position.copy(from);
      o.born = 0;
      orbs.set(e.id, o);
    }
    o.data = e;
    o.target.copy(placeOf(e, i, t.events));
    if (firstLoad) o.group.position.copy(o.target);
  });
  for (const [id, o] of orbs) if (!seen.has(id)) { orbLayer.remove(o.group); orbs.delete(id); }
  for (const o of added) {
    o.group.position.copy(o.target).add(new THREE.Vector3(0, 30, 0));
    burst(o.target, colorOf(o.data));
    toast(`New memory: “${o.data.quotes[0] ?? o.data.title}”`);
    flyTo(o.target, 1800);
    select(o.data.id, false);
  }
  buildThreads(t);
  timeline = t;
  firstLoad = false;
  const dated = t.events.filter((e) => e.year !== null).length;
  document.getElementById('tl-title')!.textContent = `${t.elder}'s life`;
  document.getElementById('tl-sub')!.textContent = t.events.length
    ? `${t.events.length} stories in her own words · ${dated} placed in time${t.from ? ` · ${t.from} to now` : ''}`
    : 'No stories yet. When she tells one, it will appear here.';
  if (selected && orbs.has(selected)) renderPanel(orbs.get(selected)!.data);
}

function setLive(ok: boolean): void {
  const el = document.getElementById('tl-live')!;
  el.classList.toggle('off', !ok);
  el.lastChild!.textContent = ok ? ' Live' : ' Reconnecting…';
}

// ---------- selection, panel, camera ----------

let selected: string | null = null;
const panel = document.getElementById('tl-panel')!;

function select(id: string, fly = true): void {
  const o = orbs.get(id);
  if (!o) return;
  selected = id;
  controls.autoRotate = false;
  renderPanel(o.data);
  if (fly) flyTo(o.target, 1400);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderPanel(e: TEvent): void {
  panel.hidden = false;
  panel.replaceChildren();
  const close = el('button', 'tl-close', '×');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => { panel.hidden = true; selected = null; });
  panel.append(close);
  const when = el('p', `tl-when ${e.yearSource ?? 'undated'}`);
  when.textContent = e.year === null ? 'Not placed in time yet'
    : e.yearSource === 'said' ? `${e.year} · in her own words` : `About ${e.year} · confirmed by ${e.yearBy ?? 'the family'}`;
  panel.append(when, el('h2', undefined, e.title));
  if (e.answers) panel.append(el('p', 'tl-answers', `Her answer to ${e.answers.asker}'s question: “${e.answers.question}”`));
  if (e.photoUrl) { const img = el('img', 'tl-photo'); img.src = e.photoUrl; img.alt = ''; panel.append(img); }
  const q = el('blockquote', 'tl-quote');
  for (const line of e.quotes) {
    const p = el('p', undefined, line);
    if (e.yearQuote === line) p.className = 'year-line';
    q.append(p);
  }
  panel.append(q, el('p', 'tl-meta', `She told Recollect on ${e.toldOn}${e.retellOf ? ' · a retelling of an earlier story' : ''}`));
  if (e.entities.length) {
    const ul = el('ul', 'tl-chips');
    for (const n of e.entities) ul.append(el('li', `chip ${n.kind}`, n.name));
    panel.append(ul);
  }
  for (const v of e.voices) {
    const b = el('blockquote', 'tl-voice');
    b.append(el('p', undefined, `“${v.quotes.join(' ')}”`), el('p', 'tl-meta', `${v.name}${v.relation ? `, ${v.relation}` : ''} · ${v.toldOn}`));
    panel.append(b);
  }
  // The family can place a story in time (or correct it) right here.
  if (e.yearSource !== 'said' && !e.retellOf) {
    const form = el('form', 'tl-era');
    const lab = el('label', undefined, e.year ? 'Correct the year' : 'Roughly when did this happen?');
    const input = el('input');
    input.type = 'number'; input.min = '1900'; input.max = String(new Date().getFullYear());
    input.placeholder = 'e.g. 1958'; if (e.year) input.value = String(e.year);
    const save = el('button', undefined, 'Place it');
    save.type = 'submit';
    const msg = el('span', 'tl-msg');
    lab.append(input);
    form.append(lab, save, msg);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const year = input.value ? Number(input.value) : null;
      const r = await fetch('/api/family/story-era', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: e.id, year }),
      });
      if (!r.ok) { msg.textContent = (await r.json().catch(() => ({}))).error ?? 'Could not save.'; return; }
      msg.textContent = 'Saved';
      await refresh();
      const o = orbs.get(e.id);
      if (o) { burst(o.target, colorOf(o.data)); flyTo(o.target, 1600); }
    });
    panel.append(form);
  }
}

let flight: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number; ms: number } | null = null;
function flyTo(target: THREE.Vector3, ms: number): void {
  const dir = new THREE.Vector3(0.35, 0.3, 1).normalize();
  flight = {
    from: camera.position.clone(), to: target.clone().add(dir.multiplyScalar(34)),
    tFrom: controls.target.clone(), tTo: target.clone(), start: performance.now(), ms: reduceMotion ? 1 : ms,
  };
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let toastTimer = 0;
function toast(text: string): void {
  const t = document.getElementById('tl-toast')!;
  t.textContent = text;
  t.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, 5000);
}

// "Play her life": a slow tour through the stories in order of when they happened.
let touring = false;
async function tour(): Promise<void> {
  const btn = document.getElementById('tl-play') as HTMLButtonElement;
  if (touring) { touring = false; btn.textContent = '▶ Play her life'; return; }
  if (!timeline) return;
  touring = true;
  btn.textContent = '■ Stop';
  const stops = [...timeline.events].filter((e) => !e.retellOf)
    .sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999) || (a.toldAt < b.toldAt ? -1 : 1));
  for (const e of stops) {
    if (!touring) break;
    select(e.id);
    await new Promise((r) => setTimeout(r, 5200));
  }
  touring = false;
  btn.textContent = '▶ Play her life';
}

// ---------- input ----------

const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hovered: Orb | null = null;
labels.domElement.addEventListener('pointermove', (ev) => {
  mouse.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
});
labels.domElement.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).closest('.tl-tag')) return;
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...orbs.values()].map((o) => o.core))[0];
  if (hit) select(String(hit.object.userData.id));
});
document.getElementById('tl-play')!.addEventListener('click', () => void tour());
document.getElementById('tl-reset')!.addEventListener('click', () => {
  touring = false;
  panel.hidden = true; selected = null;
  flight = { from: camera.position.clone(), to: HOME.pos.clone(), tFrom: controls.target.clone(), tTo: HOME.target.clone(), start: performance.now(), ms: 1400 };
  controls.autoRotate = !reduceMotion;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labels.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { panel.hidden = true; selected = null; } });

// ---------- frame loop ----------

const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  stepFlow(dt);
  scene.getObjectByName('stars')!.rotation.y += dt * 0.004;

  for (const o of orbs.values()) {
    o.group.position.lerp(o.target, reduceMotion ? 1 : 0.06);
    const age = (performance.now() - o.born) / 1000;
    const grow = o.born === 0 ? 1 : Math.min(1, age / 1.2);
    const pop = grow < 1 ? 1 + Math.sin(grow * Math.PI) * 0.6 : 1;
    const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 1.6 + o.phase) * 0.06;
    const big = (o === hovered || o.data.id === selected) ? 1.35 : 1;
    o.core.scale.setScalar(Math.max(0.01, grow * pop * pulse * big));
    o.halo.scale.setScalar((o.core.geometry.boundingSphere?.radius ?? 1) * 5 * pulse * big * Math.max(0.01, grow));
    (o.halo.material as THREE.SpriteMaterial).opacity = o.data.id === selected ? 0.8 : 0.38;
    o.core.rotation.y += dt * 0.3;
    // The stem reaches down to the river.
    const stem = o.group.getObjectByName('stem') as THREE.Mesh | undefined;
    if (stem) {
      const h = Math.max(0.1, o.group.position.y - (o.data.year === null ? o.group.position.y - 0.1 : river.getPointAt(uOfYear(o.data.year)).y));
      stem.scale.set(1, h, 1);
      stem.position.y = -h / 2;
      stem.visible = o.data.year !== null && !o.data.retellOf;
    }
    o.satellites.forEach((s, i) => {
      const a = t * 0.8 + (i * Math.PI * 2) / o.satellites.length;
      s.position.set(Math.cos(a) * 2.6, Math.sin(a * 1.3) * 0.8, Math.sin(a) * 2.6);
    });
  }
  // Threads flow gently (the dashes move along each line).
  for (const line of threadLayer.children) {
    if (!(line instanceof THREE.Line)) continue;
    const m = line.material as THREE.LineDashedMaterial & { dashOffset?: number };
    if (!reduceMotion) m.dashOffset = -t * 1.2;
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]!;
    b.age += dt;
    const pos = b.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      pos.setXYZ(k, pos.getX(k) + b.vel[k * 3]! * dt, pos.getY(k) + b.vel[k * 3 + 1]! * dt, pos.getZ(k) + b.vel[k * 3 + 2]! * dt);
      b.vel[k * 3]! *= 0.96; b.vel[k * 3 + 1]! *= 0.96; b.vel[k * 3 + 2]! *= 0.96;
    }
    pos.needsUpdate = true;
    (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / 1.6);
    if (b.age > 1.6) { scene.remove(b.pts); bursts.splice(i, 1); }
  }

  // Hover.
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...orbs.values()].map((o) => o.core))[0];
  hovered = hit ? orbs.get(String(hit.object.userData.id)) ?? null : null;
  renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';

  if (flight) {
    const k = Math.min(1, (performance.now() - flight.start) / flight.ms);
    const e = ease(k);
    camera.position.lerpVectors(flight.from, flight.to, e);
    controls.target.lerpVectors(flight.tFrom, flight.tTo, e);
    if (k >= 1) flight = null;
  }
  controls.update();
  composer.render();
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

buildRiver();
void refresh();
setInterval(() => void refresh(), POLL_MS);
setInterval(() => { if (Date.now() - lastOk > POLL_MS * 3) setLive(false); }, 1000);
frame();
