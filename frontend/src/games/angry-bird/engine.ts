import Matter from "matter-js";
import type { Bird } from "../../api/types";
import { hasActiveAbility } from "./birds";
import type { Level } from "./levels";
import {
  PHYS,
  type Vec,
  abilityTapTime,
  abilityVelocity,
  birdMass,
  impactDamage,
  launchFromDrag,
  launchVelocity,
  predictPath,
} from "./physics";

const SCALE = 8; // world units -> canvas px
const STEP_MS = 1000 / 60; // one physics step (matches server DT)
const PX_PER_STEP = SCALE * PHYS.DT; // world u/s -> matter px/step
export const MAX_SHOTS = 5; // must match backend scores.rs MAX_SHOTS
const MAX_DRAG_PX = 12 * SCALE; // pull distance for 100% power
const MIN_POWER = 0.08; // smaller pulls cancel instead of wasting a bird
const PREVIEW_SECONDS = 0.75; // short arc, Angry Birds style
const MAX_STEPS_PER_FRAME = 5; // avoid spiral-of-death after tab switch
const NEXT_BIRD_DELAY_STEPS = 30;
const PIXEL_FONT = '"Press Start 2P", ui-monospace, monospace';

export interface ShotRecord {
  bird: string;
  angle: number;
  power: number;
  ability_tap: number | null;
}

interface EngineCallbacks {
  onShotComplete: (shots: ShotRecord[]) => void;
  onStatus: (msg: string) => void;
}

interface Target {
  body: Matter.Body;
  hp: number;
  isPig: boolean;
  massWorld: number;
  destroyed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

type Phase = "ready" | "aiming" | "flying" | "between" | "finished";

export type CanvasTheme = "light" | "dark";

interface Palette {
  skyTop: string;
  skyBottom: string;
  hillBack: string;
  hillFront: string;
  grass: string;
  dirt: string;
  orb: string; // sun or moon
  cloud: string;
  stars: boolean;
  ring: string;
}

const PALETTES: Record<CanvasTheme, Palette> = {
  light: {
    skyTop: "#5fb4ff",
    skyBottom: "#dff3ff",
    hillBack: "#8fe3b0",
    hillFront: "#3bce7a",
    grass: "#1f9d55",
    dirt: "#8b5a2b",
    orb: "#ffd23f",
    cloud: "#ffffff",
    stars: false,
    ring: "rgba(20,25,54,0.4)",
  },
  dark: {
    skyTop: "#070a24",
    skyBottom: "#2a3a8f",
    hillBack: "#1d3f6e",
    hillFront: "#155e3b",
    grass: "#3bce7a",
    dirt: "#4a2f17",
    orb: "#ffd23f",
    cloud: "rgba(169,177,214,0.35)",
    stars: true,
    ring: "rgba(255,210,63,0.45)",
  },
};

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) =>
    Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Small deterministic PRNG so the background is identical every render. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class GameEngine {
  private engine: Matter.Engine;
  private ctx: CanvasRenderingContext2D;
  private targets: Target[] = [];
  private particles: Particle[] = [];

  private phase: Phase = "ready";
  private shots: ShotRecord[] = [];
  private grab: Vec = { x: 0, y: 0 };
  private pointer: Vec = { x: 0, y: 0 };
  private pointerId: number | null = null;

  private birdBody: Matter.Body | null = null;
  private flightSteps = 0;
  private betweenSteps = 0;
  private abilityUsed = false;
  private trail: Vec[] = [];
  private lastTrail: Vec[] = [];

  private raf = 0;
  private lastTime: number | null = null;
  private acc = 0;
  private dead = false;
  private detach: () => void = () => {};
  private palette: Palette;
  private bg: HTMLCanvasElement | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private level: Level,
    private bird: Bird,
    private callbacks: EngineCallbacks,
    theme: CanvasTheme = "dark",
  ) {
    this.palette = PALETTES[theme];
    canvas.width = level.width * SCALE;
    canvas.height = level.height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;

    this.engine = Matter.Engine.create();
    // Make matter's gravity equal the server's in px/step^2.
    this.engine.gravity.scale = 1;
    this.engine.gravity.x = 0;
    this.engine.gravity.y =
      (PHYS.GRAVITY * SCALE * PHYS.DT * PHYS.DT) / (STEP_MS * STEP_MS);

    this.buildWorld();
    this.attachInput();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- coordinates ----------

  // World (origin bottom-left, +y up) -> canvas px (origin top-left, +y down).
  private toPx(x: number, y: number): Vec {
    return { x: x * SCALE, y: (this.level.height - y) * SCALE };
  }

  private toWorld(px: Vec): Vec {
    return { x: px.x / SCALE, y: this.level.height - px.y / SCALE };
  }

  private slingPx(): Vec {
    return this.toPx(this.level.slingshotX, this.level.slingshotY);
  }

  // ---------- world ----------

  private buildWorld() {
    const w = this.level.width * SCALE;
    const h = this.level.height * SCALE;
    const ground = Matter.Bodies.rectangle(w / 2, h + 0.5 * SCALE, w * 2, SCALE, {
      isStatic: true,
      restitution: 0.1,
      label: "ground",
    });
    Matter.Composite.add(this.engine.world, ground);

    for (const b of this.level.blocks) {
      const c = this.toPx(b.x, b.y + b.h / 2);
      const body = Matter.Bodies.rectangle(c.x, c.y, b.w * SCALE, b.h * SCALE, {
        density: 0.001,
        restitution: 0.05,
        frictionAir: 0,
        label: "block",
      });
      this.addTarget(body, b.hp, false, b.w * b.h * 1.0);
    }
    for (const p of this.level.pigs) {
      const c = this.toPx(p.x, p.y);
      const body = Matter.Bodies.circle(c.x, c.y, p.r * SCALE, {
        density: 0.0006,
        restitution: 0.1,
        frictionAir: 0,
        label: "pig",
      });
      this.addTarget(body, p.hp, true, Math.PI * p.r * p.r * 0.6);
    }
  }

  private addTarget(body: Matter.Body, hp: number, isPig: boolean, massWorld: number) {
    Matter.Composite.add(this.engine.world, body);
    this.targets.push({ body, hp, isPig, massWorld, destroyed: false });
  }

  // ---------- main loop ----------

  private frame = (t: number) => {
    if (this.dead) return;
    if (this.lastTime === null) this.lastTime = t;
    this.acc = Math.min(this.acc + (t - this.lastTime), STEP_MS * MAX_STEPS_PER_FRAME);
    this.lastTime = t;
    while (this.acc >= STEP_MS) {
      this.step();
      this.acc -= STEP_MS;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private step() {
    Matter.Engine.update(this.engine, STEP_MS);
    this.stepParticles();

    if (this.phase === "flying" && this.birdBody) {
      const elapsed = this.flightSteps * PHYS.DT; // server checks before ++
      this.flightSteps++;
      this.applyImpacts();
      if (this.flightSteps % 3 === 0) {
        this.trail.push({ ...this.birdBody.position });
      }
      const pos = this.toWorld(this.birdBody.position);
      const speed = Matter.Vector.magnitude(this.birdBody.velocity) / PX_PER_STEP;
      const settled = speed < PHYS.SETTLE_SPEED && pos.y <= 1.5 && elapsed > 0.5;
      const offscreen = pos.x > this.level.width + 10 || pos.x < -10;
      const timeout = this.flightSteps >= PHYS.MAX_SHOT_TIME / PHYS.DT;
      if (settled || offscreen || timeout) this.endShot();
    } else if (this.phase === "between") {
      if (--this.betweenSteps <= 0) this.nextBird();
    }
  }

  /** Mirrors the server's proximity-based damage so visuals match scoring. */
  private applyImpacts() {
    const bird = this.birdBody;
    if (!bird) return;
    const bp = this.toWorld(bird.position);
    const speed = Matter.Vector.magnitude(bird.velocity) / PX_PER_STEP;
    const dmg = impactDamage(birdMass(this.bird.mass), speed);
    if (dmg <= 1) return;
    for (const t of this.targets) {
      if (t.destroyed) continue;
      const tp = this.toWorld(t.body.position);
      if (Math.hypot(bp.x - tp.x, bp.y - tp.y) >= PHYS.IMPACT_RADIUS) continue;
      t.hp -= dmg;
      if (t.hp <= 0) this.destroyTarget(t);
    }
  }

  private destroyTarget(t: Target) {
    t.destroyed = true;
    Matter.Composite.remove(this.engine.world, t.body);
    const color = t.isPig ? "#7bd389" : "#c8925a";
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.particles.push({
        x: t.body.position.x,
        y: t.body.position.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 30 + Math.random() * 20,
        color,
      });
    }
  }

  private stepParticles() {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---------- input (mouse + touch via Pointer Events) ----------

  private eventPos(e: PointerEvent): Vec {
    const r = this.canvas.getBoundingClientRect();
    // Account for CSS scaling of the canvas.
    return {
      x: ((e.clientX - r.left) * this.canvas.width) / r.width,
      y: ((e.clientY - r.top) * this.canvas.height) / r.height,
    };
  }

  private attachInput() {
    const c = this.canvas;
    c.style.touchAction = "none";

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (this.phase === "flying") {
        this.triggerAbility();
        return;
      }
      if (this.phase !== "ready") return;
      e.preventDefault();
      this.phase = "aiming";
      this.pointerId = e.pointerId;
      this.grab = this.eventPos(e);
      this.pointer = { ...this.grab };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (this.phase === "aiming" && e.pointerId === this.pointerId) {
        this.pointer = this.eventPos(e);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (this.phase !== "aiming" || e.pointerId !== this.pointerId) return;
      this.pointer = this.eventPos(e);
      this.release();
    };
    const onCancel = (e: PointerEvent) => {
      if (this.phase === "aiming" && e.pointerId === this.pointerId) this.cancelAim();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.phase === "aiming") this.cancelAim();
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    this.detach = () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }

  private dragVector(): Vec {
    let dx = this.pointer.x - this.grab.x;
    let dy = this.pointer.y - this.grab.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX_DRAG_PX) {
      dx = (dx / len) * MAX_DRAG_PX;
      dy = (dy / len) * MAX_DRAG_PX;
    }
    return { x: dx, y: dy };
  }

  private currentAim() {
    const d = this.dragVector();
    return launchFromDrag(d.x, d.y, MAX_DRAG_PX);
  }

  private cancelAim() {
    this.phase = "ready";
    this.pointerId = null;
    this.callbacks.onStatus("Aim cancelled. Pull back and release to launch.");
  }

  private release() {
    this.pointerId = null;
    const { power, angle } = this.currentAim();
    if (power < MIN_POWER) {
      this.phase = "ready";
      this.callbacks.onStatus("Pull back further to launch.");
      return;
    }
    this.launch(power, angle);
  }

  // ---------- shots ----------

  private launch(power: number, angle: number) {
    const s = this.slingPx();
    const v = launchVelocity(angle, power, this.bird.power);
    const body = Matter.Bodies.circle(s.x, s.y, PHYS.BIRD_RADIUS * SCALE, {
      density: 0.001 * this.bird.mass,
      restitution: 0.1,
      frictionAir: 0,
      label: "bird",
    });
    Matter.Composite.add(this.engine.world, body);
    // World y is up, canvas y is down.
    Matter.Body.setVelocity(body, { x: v.x * PX_PER_STEP, y: -v.y * PX_PER_STEP });

    this.birdBody = body;
    this.flightSteps = 0;
    this.abilityUsed = false;
    this.trail = [{ ...s }];
    this.phase = "flying";
    this.shots.push({ bird: this.bird.id, angle, power, ability_tap: null });

    const tip = hasActiveAbility(this.bird.ability) ? " Tap to use ability!" : "";
    this.callbacks.onStatus(
      `${this.bird.name} launched at ${Math.round(power * 100)}% power.${tip}`,
    );
  }

  private triggerAbility() {
    const body = this.birdBody;
    if (!body || this.abilityUsed || !hasActiveAbility(this.bird.ability)) return;
    this.abilityUsed = true;
    const last = this.shots[this.shots.length - 1];
    if (last) last.ability_tap = abilityTapTime(this.flightSteps);

    const vWorld = {
      x: body.velocity.x / PX_PER_STEP,
      y: -body.velocity.y / PX_PER_STEP,
    };
    if (this.bird.ability === "explode") {
      this.explode(body);
    } else {
      const nv = abilityVelocity(this.bird.ability, vWorld);
      Matter.Body.setVelocity(body, { x: nv.x * PX_PER_STEP, y: -nv.y * PX_PER_STEP });
    }
    this.callbacks.onStatus(`${this.bird.name} ability!`);
  }

  private explode(bird: Matter.Body) {
    const c = this.toWorld(bird.position);
    for (const t of this.targets) {
      if (t.destroyed) continue;
      const p = this.toWorld(t.body.position);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= PHYS.BLAST_RADIUS || d <= 0.001) continue;
      const j = PHYS.BLAST_STRENGTH * (1 - d / PHYS.BLAST_RADIUS);
      const dvx = ((dx / d) * j) / t.massWorld;
      const dvy = ((dy / d) * j) / t.massWorld;
      Matter.Body.setVelocity(t.body, {
        x: t.body.velocity.x + dvx * PX_PER_STEP,
        y: t.body.velocity.y - dvy * PX_PER_STEP,
      });
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.particles.push({
        x: bird.position.x,
        y: bird.position.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 25 + Math.random() * 15,
        color: Math.random() < 0.5 ? "#ffb703" : "#fb8500",
      });
    }
  }

  private endShot() {
    if (this.birdBody) {
      Matter.Composite.remove(this.engine.world, this.birdBody);
      this.birdBody = null;
    }
    this.lastTrail = this.trail;
    this.trail = [];
    if (this.shots.length >= MAX_SHOTS) {
      this.finishRound();
      return;
    }
    this.phase = "between";
    this.betweenSteps = NEXT_BIRD_DELAY_STEPS;
  }

  private nextBird() {
    this.phase = "ready";
    this.callbacks.onStatus(
      `Shot ${this.shots.length + 1}/${MAX_SHOTS}. Pull back and release.`,
    );
  }

  // ---------- public API ----------

  start() {
    this.phase = "ready";
    this.callbacks.onStatus(
      `Shot 1/${MAX_SHOTS}. Drag anywhere to pull the slingshot, release to fire.`,
    );
  }

  setBird(bird: Bird) {
    // Only swap birds that haven't been launched yet.
    if (this.phase === "ready" || this.phase === "between" || this.phase === "aiming") {
      this.bird = bird;
    }
  }

  /** Ends the round once; repeated calls are ignored (prevents double submit). */
  finishRound() {
    if (this.phase === "finished" || this.shots.length === 0) return;
    this.phase = "finished";
    if (this.birdBody) {
      Matter.Composite.remove(this.engine.world, this.birdBody);
      this.birdBody = null;
    }
    this.callbacks.onShotComplete([...this.shots]);
  }

  shotsTaken() {
    return this.shots.length;
  }

  setTheme(theme: CanvasTheme) {
    this.palette = PALETTES[theme];
    this.bg = null; // re-render background lazily
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.detach();
    Matter.Composite.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
  }

  // ---------- rendering ----------

  private draw() {
    const { ctx } = this;
    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0);

    this.drawDots(this.lastTrail, "rgba(255,255,255,0.55)", 2.5);
    this.drawDots(this.trail, "rgba(255,255,255,0.9)", 3);

    for (const t of this.targets) {
      if (t.destroyed) continue;
      if (t.isPig) this.drawPig(t.body);
      else this.drawPoly(t.body, "#b08968", "#7f5539");
    }

    this.drawSlingshot();

    if (this.birdBody) {
      this.drawBird(this.birdBody.position, this.birdBody.angle);
    }

    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    if (this.phase === "aiming") this.drawAimOverlay();
    this.drawHud();
  }

  /** Pixel-art backdrop, rendered once per theme into an offscreen canvas. */
  private renderBackground(): HTMLCanvasElement {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const P = this.palette;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const rnd = seeded(7);
    const px = 8; // pixel block size

    // Stepped (banded) sky gradient for that retro look.
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = mixHex(P.skyTop, P.skyBottom, i / (bands - 1));
      g.fillRect(0, Math.floor((i * H) / bands), W, Math.ceil(H / bands) + 1);
    }

    if (P.stars) {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = rnd() < 0.2 ? "#ffd23f" : "rgba(245,247,255,0.85)";
        const s = rnd() < 0.15 ? 4 : 2;
        g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.6), s, s);
      }
    }

    // Sun / moon made of chunky pixels.
    const ox = W - 110;
    const oy = 70;
    g.fillStyle = P.orb;
    for (let y = -4; y <= 4; y++) {
      for (let x = -4; x <= 4; x++) {
        if (x * x + y * y <= 18) g.fillRect(ox + x * px, oy + y * px, px, px);
      }
    }
    if (P.stars) {
      // carve a crescent
      g.fillStyle = mixHex(P.skyTop, P.skyBottom, 0.15);
      for (let y = -4; y <= 4; y++) {
        for (let x = -4; x <= 4; x++) {
          if ((x - 2) * (x - 2) + (y + 1) * (y + 1) <= 12) {
            g.fillRect(ox + x * px, oy + y * px, px, px);
          }
        }
      }
    }

    // Blocky clouds
    g.fillStyle = P.cloud;
    const clouds = [
      [140, 90],
      [380, 60],
      [560, 120],
    ];
    for (const [cx, cy] of clouds) {
      g.fillRect(cx, cy, px * 8, px * 2);
      g.fillRect(cx + px * 2, cy - px * 2, px * 4, px * 2);
      g.fillRect(cx - px, cy + px, px * 10, px);
    }

    // Two layers of stepped hills
    const hill = (color: string, base: number, amp: number, freq: number, phase: number) => {
      g.fillStyle = color;
      for (let x = 0; x < W; x += px) {
        const h = base + amp * (0.5 + 0.5 * Math.sin(x * freq + phase));
        const top = Math.floor((H - h) / px) * px;
        g.fillRect(x, top, px, H - top);
      }
    };
    hill(P.hillBack, 90, 60, 0.008, 1.3);
    hill(P.hillFront, 40, 36, 0.014, 0.2);

    // Ground strip: grass on dirt, with a pixel checker pattern
    g.fillStyle = P.dirt;
    g.fillRect(0, H - 10, W, 10);
    g.fillStyle = P.grass;
    g.fillRect(0, H - 14, W, 6);
    for (let x = 0; x < W; x += px * 2) g.fillRect(x, H - 18, px, 4);

    return c;
  }

  private drawDots(pts: Vec[], color: string, r: number) {
    const { ctx } = this;
    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPoly(body: Matter.Body, fill: string, stroke: string) {
    const { ctx } = this;
    const v = body.vertices;
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  private drawPig(body: Matter.Body) {
    const { ctx } = this;
    const r = body.circleRadius ?? 12;
    const { x, y } = body.position;
    ctx.fillStyle = "#7bd389";
    ctx.strokeStyle = "#2d6a4f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#52b788";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.15, r * 0.4, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b4332";
    ctx.fillRect(x - r * 0.45, y - r * 0.4, 2, 2);
    ctx.fillRect(x + r * 0.35, y - r * 0.4, 2, 2);
  }

  private drawBird(pos: Vec, angle = 0) {
    const { ctx } = this;
    const r = PHYS.BIRD_RADIUS * SCALE;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillStyle = this.bird.color;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.25, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.25, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffb703";
    ctx.beginPath();
    ctx.moveTo(r * 0.7, 0);
    ctx.lineTo(r * 1.2, r * 0.15);
    ctx.lineTo(r * 0.7, r * 0.35);
    ctx.fill();
    ctx.restore();
  }

  private drawSlingshot() {
    const { ctx } = this;
    const s = this.slingPx();
    const groundY = this.canvas.height;
    const backFork = { x: s.x - 6, y: s.y - 4 };
    const frontFork = { x: s.x + 6, y: s.y - 4 };
    const holding = this.phase === "ready" || this.phase === "aiming";
    const d = this.phase === "aiming" ? this.dragVector() : { x: 0, y: 0 };
    const birdPos = {
      x: s.x + d.x,
      // Visual only: never draw the pulled bird inside the ground.
      y: Math.min(s.y + d.y, groundY - 14 - PHYS.BIRD_RADIUS * SCALE),
    };

    // Trunk + back arm
    ctx.strokeStyle = "#6f4518";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, groundY);
    ctx.lineTo(s.x, s.y + 10);
    ctx.lineTo(backFork.x, backFork.y);
    ctx.stroke();

    ctx.strokeStyle = "#3d2b1f";
    ctx.lineWidth = 4;
    if (holding) {
      ctx.beginPath();
      ctx.moveTo(backFork.x, backFork.y);
      ctx.lineTo(birdPos.x, birdPos.y);
      ctx.stroke();
      this.drawBird(birdPos);
      ctx.strokeStyle = "#3d2b1f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(birdPos.x, birdPos.y);
      ctx.lineTo(frontFork.x, frontFork.y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(backFork.x, backFork.y);
      ctx.lineTo(frontFork.x, frontFork.y);
      ctx.stroke();
    }

    // Front arm (drawn last so it overlaps the band)
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + 10);
    ctx.lineTo(frontFork.x, frontFork.y);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  private drawAimOverlay() {
    const { ctx } = this;
    const s = this.slingPx();
    const { power, angle } = this.currentAim();

    // Max-pull ring
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = this.palette.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, MAX_DRAG_PX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (power < MIN_POWER) {
      this.label(s.x + 30, s.y - MAX_DRAG_PX - 10, "PULL BACK TO AIM", "#f5f7ff");
      return;
    }

    // Trajectory preview (same math as the server, first part of the flight)
    const v = launchVelocity(angle, power, this.bird.power);
    const start = { x: this.level.slingshotX, y: this.level.slingshotY };
    const pts = predictPath(start, v, PREVIEW_SECONDS, 3);
    pts.forEach((p, i) => {
      const px = this.toPx(p.x, p.y);
      const k = 1 - i / Math.max(1, pts.length);
      const size = Math.round(4 + 4 * k);
      ctx.globalAlpha = 0.35 + 0.65 * k;
      ctx.fillStyle = "#141936";
      ctx.fillRect(px.x - size / 2 - 1, px.y - size / 2 - 1, size + 2, size + 2);
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#ffd23f";
      ctx.fillRect(px.x - size / 2, px.y - size / 2, size, size);
    });
    ctx.globalAlpha = 1;

    // Segmented power meter (pixel blocks) next to the slingshot
    const color = power < 0.5 ? "#3bce7a" : power < 0.8 ? "#ffd23f" : "#ff5a5f";
    const segs = 10;
    const filled = Math.max(1, Math.round(power * segs));
    const bx = s.x - 44;
    const segH = 8;
    const top = s.y - 40 - (segH + 2) * segs;
    ctx.fillStyle = "#141936";
    ctx.fillRect(bx - 3, top - 3, 18, (segH + 2) * segs + 4);
    for (let i = 0; i < segs; i++) {
      const y = top + (segs - 1 - i) * (segH + 2);
      ctx.fillStyle = i < filled ? color : "rgba(245,247,255,0.15)";
      ctx.fillRect(bx, y, 12, segH);
    }

    const deg = Math.round((angle * 180) / Math.PI);
    this.label(
      s.x + 40,
      top - 22,
      `PWR ${Math.round(power * 100)}%  ${deg}°`,
      color,
    );
  }

  private label(x: number, y: number, text: string, color: string) {
    const { ctx } = this;
    ctx.font = `11px ${PIXEL_FONT}`;
    const w = ctx.measureText(text).width + 18;
    ctx.fillStyle = "#03040c";
    ctx.fillRect(x - w / 2 + 3, y - 13, w, 24); // drop shadow
    ctx.fillStyle = "#141936";
    ctx.fillRect(x - w / 2, y - 16, w, 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2 + 1, y - 15, w - 2, 22);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y - 3);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  private drawHud() {
    const { ctx } = this;
    const left = Math.max(0, MAX_SHOTS - this.shots.length);
    const pigs = this.targets.filter((t) => t.isPig && !t.destroyed).length;

    ctx.fillStyle = "rgba(20,25,54,0.85)";
    ctx.fillRect(10, 10, 168, 50);
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 2;
    ctx.strokeRect(11, 11, 166, 48);
    ctx.font = `9px ${PIXEL_FONT}`;
    ctx.fillStyle = "#f5f7ff";
    ctx.fillText("BIRDS", 20, 30);
    ctx.fillText("PIGS", 20, 50);
    for (let i = 0; i < MAX_SHOTS; i++) {
      ctx.fillStyle = i < left ? this.bird.color : "rgba(245,247,255,0.2)";
      ctx.fillRect(78 + i * 18, 21, 12, 12);
    }
    ctx.fillStyle = "#3bce7a";
    ctx.fillText(`${pigs} LEFT`, 78, 50);

    if (
      this.phase === "flying" &&
      !this.abilityUsed &&
      hasActiveAbility(this.bird.ability)
    ) {
      this.label(this.canvas.width / 2, 32, "TAP FOR ABILITY!", "#ffd23f");
    }
  }
}
