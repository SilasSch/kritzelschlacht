// Figuren aus Teilen: die Zeichnungen der alten Datei (paint() aus kritzelschlacht.html) pro Typ
// aufgeteilt in Körper (mit Augenweiß), Pupillen, Lid, Kopfbedeckung und Waffe. bakeRigTextures backt
// alle Teile in gemeinsame Atlas-Seiten (ein Draw-Call für viele Einheiten); die reine Pose kommt aus
// pose.js (poseUnit, RIG_PARTS) und wird hier nur weitergereicht. Panzer, Hubschrauber und Drache sind
// Boss-Sticker (Task 12c, BOSS_DEF): größer gezeichnet, mit eigenen Teilen und Bewegungen.
//
// Koordinaten der Teile: Welt-Einheiten relativ zum Einheiten-Ursprung (u.x, u.y), nicht gespiegelt
// (Blick nach rechts). Spiegeln, Neigen und Quetschen macht der Renderer am Container.
/* global PIXI */
import { UNITS, TEAMS, TINT } from '../data.js';
import { RIG_PARTS, BOSS_VIS, DRAGON_GEO, TRACK_PITCH, TRACK_FRAMES, SHIELD_FRONT, dragonHead } from './pose.js';
import { TANK_GEO, HELI_GEO } from '../muzzle.js';
export { poseUnit, RIG_PARTS } from './pose.js';

const U = UNITS;
const O = '#2a2a33';

export function shade(h,a){const n=parseInt(h.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const f=a<0?x=>x*(1+a):x=>x+(255-x)*a;return`rgb(${f(r)|0},${f(g)|0},${f(b)|0})`;}
function E(c,x,y,rx,ry,fill,lw=1.4,stroke=O,rot=0){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(lw&&stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.stroke();}}
function Ln(c,pts,col,lw,outline=true){const path=()=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));};if(outline){path();c.strokeStyle=O;c.lineWidth=lw+2.2;c.stroke();}path();c.strokeStyle=col;c.lineWidth=lw;c.stroke();}
function RR(c,x,y,w,h,rad,fill){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,rad);else c.rect(x,y,w,h);c.fillStyle=fill;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();}
function feet(c,r,col,f){const d=f?r*.14:-r*.14;E(c,-r*.42+d,r*.92,r*.3,r*.17,col,1.2);E(c,r*.42-d,r*.92,r*.3,r*.17,col,1.2);}
function helmet(c,r,col){c.beginPath();c.ellipse(0,-r*.42,r*1.02,r*.66,0,Math.PI,0);c.closePath();c.fillStyle=col;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();}

// Augenpaar wie eyes(c,x,y,s) der alten Datei, in r-Einheiten. prx/pry: Pupillenradien.
const eyePair = (x, y, s) => ({ L: [x - s, y], R: [x + s, y], s, prx: s * .48, pry: s * .55, whites: true });
// Augenweiß (die Pupillen sind eigene Sprites)
function whites(c, r, e) { for (const p of [e.L, e.R]) E(c, p[0] * r, p[1] * r, e.s * r * .95, e.s * r * 1.1, '#fff', 1.1); }
function poly(c, r, pts, fill, lw = 1.4) {
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0] * r, p[1] * r) : c.moveTo(p[0] * r, p[1] * r))); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (lw) { c.lineWidth = lw; c.strokeStyle = O; c.stroke(); }
}

/* ---------- Boss-Sticker (Task 12c, Spez. #23) ----------
   Panzer, Hubschrauber und Drache bestehen aus mehr Teilen. Jedes Teil ist um seinen eigenen Drehpunkt
   gezeichnet (Ursprung = Drehpunkt), in r = U.r · BOSS_VIS (größer gezeichnet, Logik-Radius bleibt).
   BOSS_GEO: Lage der Drehpunkte im Rig (r-Einheiten; der Renderer setzt die Teile dorthin), aus muzzle.js
   (dieselbe Geometrie bestimmt dort die Mündungen für die Logik). parts[name].pivot: Drehpunkt im Teil.
   eyes liegen in der Gruppe eyeGroup (Panzer: Turm, Drache: Kopf, Heli: Rumpf), Pupillen und Lid wie sonst.
   parts[name] = { draw(c, r, k, f), team (Teamfarbe je Team gebacken), frames }.
   partMap: Leichenteil (combat.PARTS) → Rig-Teil; corpseBody: Teil der liegenden Leiche.
   compose(c, r, k, pupils): ganze Figur in Ruhepose (Symbolbild, Drachenleiche). */
export const BOSS_GEO = { panzer: TANK_GEO, heli: HELI_GEO, drache: DRAGON_GEO };
const pupil = (c, r, e, p) => E(c, (p[0] + e.s * .35) * r, (p[1] + e.s * .15) * r, e.prx * r, e.pry * r, O, 0);
const BOSS_DEF = {
  panzer: {
    boss: true, eyeGroup: 'turret', eyes: eyePair(.14, -.06, .13),
    shadow: [1.3, .3, .76], ring: [1.45, .4, .72], pivot: [0, TANK_GEO.pivotY], top: -1.2, crown: -1.3, iconFit: [2.9, 0, -.22],
    partMap: { turret: 'turretWreck' },
    parts: {
      // Wanne mit Kettenband, Laufrollen, Kotflügel, Werkzeugkiste, Scheinwerfer und Auspuff (hinten)
      body: {
        team: true,
        draw(c, r, k) {
          RR(c, -r * 1.32, r * .12, r * 2.64, r * .62, r * .3, '#3a3d45');
          for (let i = -2; i <= 2; i++) E(c, i * r * .44, r * .45, r * .17, r * .17, '#7b808a', 1.1);
          E(c, r * 1.07, r * .38, r * .13, r * .13, '#8d929c', 1.1); E(c, -r * 1.07, r * .38, r * .13, r * .13, '#8d929c', 1.1);
          RR(c, -r * 1.42, -r * .2, r * .2, r * .13, r * .04, '#5b5f69');
          poly(c, r, [[-1.25, .17], [1.3, .17], [1.12, -.21], [-1.2, -.21]], k.col);
          Ln(c, [[-r * 1.3, r * .15], [r * 1.3, r * .15]], k.dk, 2.4);
          RR(c, -r * .9, -r * .14, r * .5, r * .19, r * .05, k.dk);
          for (const x of [-.25, .12, .5, .85]) E(c, r * x, r * .02, r * .04, r * .04, k.dk, 0);
          E(c, r * 1.13, -r * .1, r * .08, r * .07, '#ffe9a8', 1);
        },
      },
      // Kettenglieder (untere Lauffläche, wandern beim Vorwärtsfahren nach hinten) und Radspeichen, f = Bild
      treads: {
        frames: TRACK_FRAMES,
        draw(c, r, k, f) {
          const L = TRACK_PITCH, off = f / TRACK_FRAMES * L;
          c.strokeStyle = '#1f2126'; c.lineWidth = 1.3;
          c.beginPath();
          for (let x = -r * 1.08 + L - off; x < r * 1.08; x += L) { c.moveTo(x, r * .65); c.lineTo(x - 1, r * .73); }
          c.stroke();
          const a0 = f / TRACK_FRAMES * Math.PI / 2;
          c.strokeStyle = '#4a4e57'; c.lineWidth = 1.2; c.beginPath();
          for (let i = -2; i <= 2; i++) for (let j = 0; j < 2; j++) {
            const a = a0 + j * Math.PI / 2, x = i * r * .44, y = r * .45, d = r * .12;
            c.moveTo(x - Math.cos(a) * d, y - Math.sin(a) * d); c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          }
          c.stroke();
          for (let i = -2; i <= 2; i++) E(c, i * r * .44, r * .45, r * .045, r * .045, '#5b5f69', .8);
        },
      },
      // Turm (Drehpunkt auf der Rohrachse): Kuppel, Luke, Antenne, Blende, Augenweiß
      turret: {
        team: true,
        draw(c, r, k) { this.base(c, r, k); whites(c, r, BOSS_DEF.panzer.eyes); },
        base(c, r, k) {
          Ln(c, [[-r * .36, -r * .2], [-r * .5, -r * .98]], '#3a3f4a', 1, false); E(c, -r * .5, -r * 1.0, r * .045, r * .045, '#e5574f', .8);
          c.beginPath(); c.moveTo(-r * .56, r * .17); c.quadraticCurveTo(-r * .64, -r * .34, -r * .05, -r * .35);
          c.quadraticCurveTo(r * .5, -r * .35, r * .52, r * .17); c.closePath();
          c.fillStyle = k.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
          E(c, -r * .2, -r * .31, r * .2, r * .07, k.dk, 1);
          RR(c, r * .36, -r * .13, r * .2, r * .26, r * .06, k.dk);
        },
      },
      // Kanonenrohr mit Mündungsbremse (im Turm gezeichnet, Drehpunkt am Schildzapfen); Rückstoß schiebt
      // es in den Turm
      weapon: {
        team: true, pivot: TANK_GEO.trunnion,
        draw(c, r, k) { Ln(c, [[r * .3, 0], [r * 1.02, 0]], k.dk, 4.2); RR(c, r * .98, -r * .085, r * .15, r * .17, r * .03, k.dk); },
      },
      // wegfliegender Turm (Leichenteil 'turret'): mit Rohr
      turretWreck: {
        team: true,
        draw(c, r, k) { BOSS_DEF.panzer.parts.weapon.draw(c, r, k); BOSS_DEF.panzer.parts.turret.base(c, r, k); },
      },
    },
    compose(c, r, k, pupils) {
      const P = this.parts, g = BOSS_GEO.panzer.turret;
      P.body.draw(c, r, k); P.treads.draw(c, r, k, 0);
      c.save(); c.translate(g[0] * r, g[1] * r); P.weapon.draw(c, r, k); P.turret.draw(c, r, k);
      if (pupils) for (const p of [this.eyes.L, this.eyes.R]) pupil(c, r, this.eyes, p);
      c.restore();
    },
  },
  heli: {
    boss: true, eyeGroup: 'body', eyes: eyePair(.52, -.06, .12), lidCol: '#bfe3f2', pivot: HELI_GEO.pivot,
    top: -1.5, crown: -1.55, iconFit: [4, 0, -.1],
    partMap: { headgear: 'rotorBlades' },
    parts: {
      // Rumpf mit Heckausleger, Leitwerk, Kufen, Triebwerk, Mast und Kanzel (mit Augenweiß)
      body: {
        team: true,
        draw(c, r, k) {
          poly(c, r, [[-.5, -.24], [-1.76, -.44], [-1.76, -.3], [-.5, .18]], k.col);
          poly(c, r, [[-1.58, -.4], [-1.78, -.86], [-1.93, -.84], [-1.86, -.34]], k.dk);
          E(c, -r * 1.42, -r * .33, r * .2, r * .055, k.dk, 1);
          Ln(c, [[-r * .38, r * .5], [-r * .48, r * .86]], '#2f3340', 1.6, false); Ln(c, [[r * .38, r * .5], [r * .46, r * .86]], '#2f3340', 1.6, false);
          c.beginPath(); c.moveTo(-r * .92, r * .87); c.lineTo(r * .86, r * .87); c.quadraticCurveTo(r * 1.06, r * .87, r * 1.1, r * .7);
          c.lineWidth = 3.8; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = '#6b707a'; c.stroke();
          E(c, 0, 0, r, r * .64, k.col);
          E(c, -r * .28, -r * .38, r * .4, r * .09, 'rgba(255,255,255,.3)', 0);
          Ln(c, [[-r * .18, -r * .52], [-r * .2, r * .46]], k.dk, 1, false);
          RR(c, -r * .5, -r * .8, r * .8, r * .22, r * .08, k.dk);
          Ln(c, [[0, -r * .8], [0, -r * .96]], '#2f3340', 2, false);
          E(c, r * .5, -r * .08, r * .42, r * .34, '#bfe3f2', 1.2);
          c.beginPath(); c.arc(r * .5, -r * .08, r * .26, -2.4, -1.5); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke();
          whites(c, r, BOSS_DEF.heli.eyes);
        },
      },
      // Heckrotor: zwei Blätter mit zarter Scheibe, dreht um die Mitte
      tailRotor: {
        draw(c, r) {
          E(c, 0, 0, r * .36, r * .36, 'rgba(60,60,70,.12)', 0);
          Ln(c, [[-r * .34, 0], [r * .34, 0]], '#2f3340', 1.5, false); E(c, 0, 0, r * .06, r * .06, '#5b5f69', .8);
        },
      },
      // Rotorscheibe (Unschärfe) und Rotorblätter; der Renderer staucht beide senkrecht (rotorFlat)
      rotorDisc: {
        draw(c, r) {
          E(c, 0, 0, r * 1.95, r * 1.95, 'rgba(70,75,90,.09)', 1.6, 'rgba(70,75,90,.25)');
          E(c, 0, 0, r * 1.2, r * 1.2, null, 1.2, 'rgba(70,75,90,.12)');
        },
      },
      rotorBlades: {
        draw(c, r) {
          Ln(c, [[-r * 1.9, 0], [r * 1.9, 0]], '#3a3f4a', 2.4);
          E(c, -r * 1.86, 0, r * .05, r * .05, '#e5574f', 0); E(c, r * 1.86, 0, r * .05, r * .05, '#e5574f', 0);
          E(c, 0, 0, r * .13, r * .13, '#5b5f69', 1.1);
        },
      },
      // Bordkanone (Drehpunkt an der Halterung), Rückstoß nach hinten
      weapon: {
        draw(c, r) { RR(c, -r * .12, -r * .075, r * .42, r * .15, r * .05, '#3a3f4a'); Ln(c, [[r * .28, 0], [r * .58, 0]], '#2f3340', 1.6); },
      },
    },
    compose(c, r, k, pupils) {
      const P = this.parts, G = BOSS_GEO.heli;
      P.body.draw(c, r, k);
      c.save(); c.translate(G.gun[0] * r, G.gun[1] * r); P.weapon.draw(c, r, k); c.restore();
      c.save(); c.translate(G.tailRotor[0] * r, G.tailRotor[1] * r); c.rotate(.6); P.tailRotor.draw(c, r, k); c.restore();
      if (pupils) for (const p of [this.eyes.L, this.eyes.R]) pupil(c, r, this.eyes, p);
      c.save(); c.translate(G.mast[0] * r, G.mast[1] * r); c.scale(1, G.rotorFlat); P.rotorDisc.draw(c, r, k); c.rotate(.35); P.rotorBlades.draw(c, r, k); c.restore();
    },
  },
  drache: {
    boss: true, eyeGroup: 'head', eyes: eyePair(.11, -.07, .15),
    top: -1.6, crown: -1.7, iconFit: [4.1, -.2, -.3],
    corpseBody: 'corpse',
    parts: {
      // Rumpf: Beine mit Krallen, Rückenzacken, Bauch
      body: {
        draw(c, r, k) {
          for (const x of [-.55, -.25, .05, .32]) {
            const yt = .15 - .6 * Math.sqrt(Math.max(0, 1 - (x / .95) ** 2));
            poly(c, r, [[x - .1, yt + .08], [x - .02, yt - .2], [x + .1, yt + .08]], '#f3e2b0', 1.1);
          }
          E(c, -r * .45, r * .62, r * .27, r * .2, k.dk, 1.2); E(c, r * .42, r * .64, r * .2, r * .16, k.dk, 1.2);
          for (let i = 0; i < 3; i++) { E(c, r * (-.62 + i * .11), r * .8, r * .045, r * .035, '#f3ead8', .7); E(c, r * (.3 + i * .09), r * .78, r * .04, r * .03, '#f3ead8', .7); }
          E(c, 0, r * .15, r * .95, r * .6, k.col);
          E(c, r * .12, r * .36, r * .6, r * .3, '#c4ecdd', 0);
          c.strokeStyle = '#9fd3bf'; c.lineWidth = 1;
          for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(r * (-.22 + i * .2), r * .2, r * .2, .9, 2.2); c.stroke(); }
        },
      },
      // Hals (Drehpunkt am Rumpf, nach +x), mit hellem Kehlstreifen
      neck: {
        draw(c, r, k) {
          c.beginPath(); c.moveTo(-r * .08, -r * .21); c.lineTo(r * .6, -r * .14); c.quadraticCurveTo(r * .72, 0, r * .6, r * .14);
          c.lineTo(-r * .08, r * .23); c.quadraticCurveTo(-r * .24, 0, -r * .08, -r * .21); c.closePath();
          c.fillStyle = k.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
          Ln(c, [[r * .02, r * .13], [r * .55, r * .08]], '#c4ecdd', 2.6, false);
        },
      },
      // Kopf (Drehpunkt am Halsende): Hörner, Schädel, Schnauze, Maul mit Zahn, Augenweiß
      head: {
        draw(c, r, k) { this.base(c, r, k); whites(c, r, BOSS_DEF.drache.eyes); },
        base(c, r, k) {
          poly(c, r, [[-.3, -.1], [-.48, -.55], [-.12, -.2]], '#f3e2b0', 1.1);
          poly(c, r, [[-.08, -.22], [-.06, -.64], [.14, -.24]], '#f3e2b0', 1.1);
          E(c, r * .1, r * .02, r * .4, r * .33, k.col);
          E(c, r * .52, r * .12, r * .3, r * .2, k.col, 1.2);
          E(c, r * .74, r * .05, r * .045, r * .035, O, 0);
          poly(c, r, [[.6, .23], [.64, .32], [.68, .22]], '#fff', .8);
          c.beginPath(); c.moveTo(r * .34, r * .2); c.quadraticCurveTo(r * .58, r * .3, r * .82, r * .17); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
        },
      },
      // Flügel (Drehpunkt an der Schulter): Flughaut zwischen den Fingern, helle Knochen, Kralle
      wing: {
        draw(c, r, k) {
          c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * .2, -r * .85); c.lineTo(-r * 1.05, -r * 1.15);
          c.quadraticCurveTo(-r * .9, -r * .82, -r * .98, -r * .56); c.quadraticCurveTo(-r * .74, -r * .52, -r * .72, -r * .3);
          c.quadraticCurveTo(-r * .44, -r * .24, -r * .36, r * .03); c.closePath();
          c.fillStyle = k.dk; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
          const b = shade(k.col, .35);
          Ln(c, [[0, 0], [-r * .2, -r * .85], [-r * 1.05, -r * 1.15]], b, 1.6, false);
          Ln(c, [[-r * .2, -r * .85], [-r * .98, -r * .56]], b, 1.1, false); Ln(c, [[-r * .2, -r * .85], [-r * .72, -r * .3]], b, 1.1, false);
          poly(c, r, [[-.24, -.84], [-.18, -1.0], [-.13, -.84]], '#f3ead8', .8);
        },
      },
      // Schweif (Drehpunkt am Rumpf, nach −x): sich verjüngend, Spitze als Pfeil
      tail: {
        draw(c, r, k) {
          const P = [[0, 0], [-.42, .2], [-.86, .14], [-1.18, -.16]], W = [.32, .24, .16];
          for (let i = 0; i < 3; i++) { c.lineWidth = W[i] * r + 2.4; c.strokeStyle = O; c.beginPath(); c.moveTo(P[i][0] * r, P[i][1] * r); c.lineTo(P[i + 1][0] * r, P[i + 1][1] * r); c.stroke(); }
          for (let i = 0; i < 3; i++) { c.lineWidth = W[i] * r; c.strokeStyle = k.col; c.beginPath(); c.moveTo(P[i][0] * r, P[i][1] * r); c.lineTo(P[i + 1][0] * r, P[i + 1][1] * r); c.stroke(); }
          poly(c, r, [[-1.14, -.12], [-1.44, -.42], [-1.06, -.36], [-1.16, -.22]], k.dk, 1.2);
        },
      },
      // liegende Leiche: ganze Figur mit angelegten Flügeln (keine Pupillen)
      corpse: { draw(c, r, k) { BOSS_DEF.drache.compose(c, r, k, false, -.5); } },
    },
    compose(c, r, k, pupils, fold = 0) {
      const P = this.parts, G = DRAGON_GEO, H = dragonHead(0, {});
      const dark = { col: shade(k.col, -.15), dk: shade(k.col, -.45) };
      c.save(); c.translate(G.wingB[0] * r, G.wingB[1] * r); c.rotate(.15 + fold); c.scale(.9, .9); P.wing.draw(c, r, dark); c.restore();
      c.save(); c.translate(G.tail[0] * r, G.tail[1] * r); P.tail.draw(c, r, k); c.restore();
      P.body.draw(c, r, k);
      c.save(); c.translate(G.neck[0] * r, G.neck[1] * r); c.rotate(H.na); P.neck.draw(c, r, k); c.restore();
      c.save(); c.translate(H.jx * r, H.jy * r); P.head.draw(c, r, k);
      if (pupils) for (const p of [this.eyes.L, this.eyes.R]) pupil(c, r, this.eyes, p);
      c.restore();
      c.save(); c.translate(G.wingF[0] * r, G.wingF[1] * r); c.rotate(-.1 + fold); P.wing.draw(c, r, k); c.restore();
    },
  },
};

/* ---------- Teile pro Typ ----------
   body(c,r,k,f)       Körper mit Augenweiß; f = Bild 0/1 (Füße, Beine, Flügel)
   eyes                Augen für Pupillen und Lid (fehlt: keine Pupillen)
   lid(c,r,e)          eigenes Lid statt des Standardlids; lid:false = kein Lid
   headgear(c,r,k,f)   Kopfbedeckung; hgFrames: Anzahl Bilder
   weapon              {draw(c,r,k,f), grip:[x,y] Drehpunkt in r, axis: Richtung des Rückstoßes (rad), swing: Anteil am Schwung,
                       frames: Anzahl Bilder (Römer: Schwert, Speer in der Hand)}
   shield              {draw(c,r,k)} Zusatzteil (EXTRA_PARTS) um seine Mitte, Lage aus der Pose (Römer)
   k = {col, dk, shield} der Variante (neutral oder Team).
   Panzer, Hubschrauber und Drache kommen aus BOSS_DEF (eigene Teile, siehe oben). */
const DEF = {
  krieger: {
    eyes: eyePair(.28, -.02, .27),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r) { c.beginPath(); c.ellipse(0, -r * .42, r * .98, r * .62, 0, Math.PI, 0); c.closePath(); c.fillStyle = '#a7b0bb'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke(); },
    weapon: {
      grip: [.8, .26], axis: Math.atan2(-1.05, .97), swing: 1,
      draw(c, r) { Ln(c, [[r * .78, r * .3], [r * 1.75, -r * .75]], '#e6ebf0', 2.2); Ln(c, [[r * .52, -r * .02], [r * 1.08, r * .5]], '#8a5a2b', 1.8); },
    },
  },
  schuetze: {
    eyes: eyePair(.28, .05, .27),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r, k) { c.beginPath(); c.ellipse(0, -r * .25, r * 1.03, r * .8, 0, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fillStyle = k.dk; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke(); },
    weapon: {
      grip: [1.15, .1], axis: 0, swing: 0,
      draw(c, r) {
        c.beginPath(); c.arc(r * .85, r * .1, r * .95, -1.25, 1.25); c.strokeStyle = O; c.lineWidth = 3.6; c.stroke(); c.strokeStyle = '#a5692f'; c.lineWidth = 1.8; c.stroke();
        c.beginPath(); c.moveTo(r * .85 + Math.cos(-1.25) * r * .95, r * .1 + Math.sin(-1.25) * r * .95); c.lineTo(r * .85 + Math.cos(1.25) * r * .95, r * .1 + Math.sin(1.25) * r * .95); c.strokeStyle = '#fff'; c.lineWidth = .8; c.stroke();
      },
    },
  },
  ritter: {
    lid: false,   // Visier statt Augen
    body(c, r, k, f) {
      feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col);
      c.beginPath(); c.rect(-r * .6, -r * .36, r * 1.4, r * .42); c.fillStyle = '#3a3f4a'; c.fill();
      E(c, r * .12, -r * .15, r * .14, r * .1, '#fff', 0); E(c, r * .48, -r * .15, r * .14, r * .1, '#fff', 0);
    },
    headgear(c, r) { E(c, -r * .15, -r * 1.02, r * .38, r * .22, '#e5574f', 1.2, O, -.4); },
    weapon: {
      grip: [.86, .35], axis: 0, swing: .3,
      draw(c, r, k) {
        c.beginPath(); c.moveTo(r * .45, -r * .3); c.lineTo(r * 1.28, -r * .3); c.lineTo(r * 1.28, r * .25); c.quadraticCurveTo(r * 1.28, r * .85, r * .86, r * 1.0); c.quadraticCurveTo(r * .45, r * .85, r * .45, r * .25); c.closePath();
        c.fillStyle = k.shield; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
        Ln(c, [[r * .86, -r * .22], [r * .86, r * .85]], '#ffd25a', 1.4, false);
      },
    },
  },
  grenadier: {
    eyes: eyePair(.28, -.05, .27),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r) { E(c, -r * .05, -r * .86, r * .58, r * .3, '#2f3340', 1.2); },
    weapon: {
      grip: [.95, .45], axis: 0, swing: 0,
      draw(c, r) {
        Ln(c, [[r * 1.15, -r * .1], [r * 1.35, -r * .42]], '#c9a26b', 1.2, false);
        E(c, r * 1.05, r * .32, r * .42, r * .42, '#2f3340', 1.2);
        E(c, r * 1.38, -r * .45, r * .18, r * .18, '#ffb800', 0);
      },
    },
  },
  reiter: {
    eyes: eyePair(.06, -.48, .16),
    body(c, r, k, f) {
      const l = f ? r * .18 : -r * .18;
      [-r * .72, -r * .36, r * .36, r * .72].forEach((x, i) => Ln(c, [[x, r * .45], [x + (i % 2 ? l : -l), r * 1.05]], '#d8c8b0', 2.2));
      Ln(c, [[-r * 1.05, r * .1], [-r * 1.45, r * .6]], '#7a5a3a', 2.4);
      E(c, 0, r * .28, r * 1.15, r * .55, '#efe4d2');
      E(c, r * 1.05, -r * .22, r * .44, r * .3, '#efe4d2', 1.4, O, -.5);
      E(c, r * 1.15, -r * .3, r * .06, r * .06, O, 0);
      E(c, -r * .1, -r * .42, r * .55, r * .58, k.col);
      whites(c, r, this.eyes);
    },
    weapon: {
      grip: [.3, -.28], axis: Math.atan2(-.75, 1.8), swing: .5,
      draw(c, r) { Ln(c, [[r * .1, -r * .2], [r * 1.9, -r * .95]], '#c9a26b', 1.8); },
    },
  },
  sani: {
    eyes: eyePair(.28, -.22, .25),
    body(c, r, k, f) {
      feet(c, r, '#c7cad3', f); E(c, 0, 0, r, r * 1.05, k.col);
      c.fillStyle = '#e5574f'; c.fillRect(-r * .12, r * .08, r * .24, r * .62); c.fillRect(-r * .31, r * .27, r * .62, r * .24);
      whites(c, r, this.eyes);
    },
    headgear(c, r) {
      E(c, 0, -r * .84, r * .6, r * .26, '#fff', 1.2);
      c.fillStyle = '#e5574f'; c.fillRect(-r * .06, -r * .98, r * .12, r * .28); c.fillRect(-r * .14, -r * .9, r * .28, r * .12);
    },
  },
  wolf: {
    eyes: eyePair(.98, -.45, .17),
    body(c, r, k, f) {
      const l = f ? r * .2 : -r * .2;
      [-r * .7, -r * .3, r * .35, r * .75].forEach((x, i) => Ln(c, [[x, r * .5], [x + (i % 2 ? l : -l), r * .95]], k.dk, 2.2));
      Ln(c, [[-r * 1.05, 0], [-r * 1.6, -r * .45]], k.col, 3);
      E(c, 0, r * .15, r * 1.2, r * .72, k.col);
      c.beginPath(); c.moveTo(r * .55, -r * .6); c.lineTo(r * .65, -r * 1.2); c.lineTo(r * .95, -r * .75); c.closePath(); c.fillStyle = k.dk; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
      c.beginPath(); c.moveTo(r * 1.0, -r * .7); c.lineTo(r * 1.2, -r * 1.25); c.lineTo(r * 1.38, -r * .68); c.closePath(); c.fill(); c.stroke();
      E(c, r * .98, -r * .32, r * .6, r * .52, k.col);
      E(c, r * 1.46, -r * .18, r * .32, r * .22, '#cfd3da');
      E(c, r * 1.74, -r * .22, r * .1, r * .09, O, 0);
      whites(c, r, this.eyes);
    },
  },
  baer: {
    eyes: eyePair(.2, -.25, .2),
    body(c, r, k, f) {
      feet(c, r, k.dk, f);
      E(c, -r * .58, -r * .78, r * .28, r * .28, k.col); E(c, r * .58, -r * .78, r * .28, r * .28, k.col);
      E(c, -r * .58, -r * .78, r * .13, r * .13, '#d3a37f', 0); E(c, r * .58, -r * .78, r * .13, r * .13, '#d3a37f', 0);
      E(c, 0, 0, r, r, k.col);
      E(c, r * .42, r * .18, r * .38, r * .28, '#d3a37f', 1.2);
      E(c, r * .62, r * .08, r * .11, r * .08, O, 0);
      whites(c, r, this.eyes);
    },
    // neu: Pranke für den Prankenhieb
    weapon: {
      grip: [.5, .4], axis: 0, swing: 1,
      draw(c, r, k) {
        E(c, r * .88, r * .66, r * .28, r * .22, k.col, 1.3);
        for (let i = -1; i <= 1; i++) E(c, r * 1.12, r * (.66 + i * .11), r * .07, r * .045, '#f3ead8', .8);
      },
    },
  },
  biene: {
    lid: false,
    body(c, r, k, f) {
      E(c, -r * .4, -r * .95, r * .55, f ? r * .85 : r * .45, 'rgba(255,255,255,.9)', 1, O);
      E(c, r * .2, -r * .95, r * .5, f ? r * .8 : r * .4, 'rgba(255,255,255,.9)', 1, O);
      c.save(); c.beginPath(); c.ellipse(0, 0, r * 1.25, r * .95, 0, 0, Math.PI * 2); c.fillStyle = k.col; c.fill(); c.clip();
      c.fillStyle = O; c.fillRect(-r * .5, -r, r * .32, r * 2); c.fillRect(r * .08, -r, r * .32, r * 2); c.restore();
      E(c, 0, 0, r * 1.25, r * .95, null, 1.1);
      E(c, r * .78, -r * .18, r * .2, r * .24, O, 0);
    },
  },
  magier: {
    eyes: eyePair(.28, 0, .26),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r, k) {
      c.beginPath(); c.moveTo(-r * .95, -r * .5); c.lineTo(r * .95, -r * .5); c.lineTo(-r * .1, -r * 2.05); c.closePath(); c.fillStyle = k.dk; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
      E(c, 0, -r * .5, r * 1.08, r * .2, k.dk, 1.2);
      E(c, -r * .12, -r * 1.1, r * .14, r * .14, '#ffd84d', 0);
    },
    weapon: {
      grip: [1.08, .15], axis: 0, swing: 0,
      draw(c, r) { Ln(c, [[r * 1.08, r * .95], [r * 1.08, -r * 1.15]], '#8a5a2b', 1.8); E(c, r * 1.08, -r * 1.32, r * .28, r * .28, '#ffcf5a', 1.1); },
    },
  },
  geist: {
    // die dunklen Augen selbst sind die Pupillen
    eyes: { L: [.05, -.15], R: [.52, -.15], s: .17, prx: .17, pry: .25, whites: false },
    lid(c, r, e) {
      for (const p of [e.L, e.R]) {
        const x = p[0] * r, y = p[1] * r;
        E(c, x, y, r * .25, r * .33, '#fff', 0);
        c.beginPath(); c.moveTo(x - r * .15, y); c.quadraticCurveTo(x, y + r * .12, x + r * .15, y); c.lineWidth = .9; c.strokeStyle = O; c.stroke();
      }
    },
    frames: 1,
    body(c, r, k) {
      c.globalAlpha = .93; c.beginPath(); c.moveTo(-r, r * .1); c.arc(0, -r * .05, r, Math.PI, 0); c.lineTo(r, r * .9);
      for (let i = 0; i < 4; i++) { const x0 = r - i * r * .5; c.quadraticCurveTo(x0 - r * .25, r * (i % 2 ? 1.2 : .6), x0 - r * .5, r * .9); }
      c.closePath(); c.fillStyle = k.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#8f9bb0'; c.stroke(); c.globalAlpha = 1;
      E(c, r * .3, r * .32, r * .11, r * .14, O, 0);
    },
  },
  soldat: {
    eyes: eyePair(.28, 0, .26),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r) { helmet(c, r, '#5d6b3a'); Ln(c, [[-r * 1.1, -r * .42], [r * 1.1, -r * .42]], '#4a552d', 1.4, false); },
    weapon: {
      grip: [.55, .37], axis: Math.atan2(-.3, 2), swing: 0,
      draw(c, r) { Ln(c, [[-r * .15, r * .45], [r * 1.85, r * .15]], '#2f3340', 2.2); Ln(c, [[r * .75, r * .32], [r * .8, r * .7]], '#2f3340', 1.6, false); },
    },
  },
  mg: {
    eyes: eyePair(.28, 0, .26),
    body(c, r, k, f) {
      feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes);
      [[.1, .75], [-.15, .85], [-.4, .9]].forEach(p => E(c, r * p[0], r * p[1], r * .12, r * .12, '#ffcf5a', .8));
    },
    headgear(c, r) { helmet(c, r, '#5d6b3a'); },
    weapon: {
      grip: [.55, .37], axis: Math.atan2(-.12, 2.35), swing: 0,
      draw(c, r) {
        Ln(c, [[-r * .3, r * .42], [r * 2.05, r * .3]], '#2f3340', 3.2);
        Ln(c, [[r * 1.55, r * .36], [r * 1.4, r * .9]], '#2f3340', 1.2, false); Ln(c, [[r * 1.55, r * .36], [r * 1.75, r * .9]], '#2f3340', 1.2, false);
      },
    },
  },
  sniper: {
    eyes: eyePair(.28, 0, .26),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r) {
      E(c, 0, -r * .62, r * 1.18, r * .26, '#4a5a30', 1.2);
      c.beginPath(); c.ellipse(0, -r * .66, r * .66, r * .46, 0, Math.PI, 0); c.closePath(); c.fillStyle = '#4a5a30'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
      [[-.5, -1.05], [-.1, -1.2], [.35, -1.1]].forEach(p => Ln(c, [[r * p[0], -r * .95], [r * p[0] + r * .12, r * p[1]]], '#6d8a45', 1.4, false));
    },
    weapon: {
      grip: [.45, .29], axis: Math.atan2(-.35, 2.8), swing: 0,
      draw(c, r) { Ln(c, [[-r * .4, r * .4], [r * 2.4, r * .05]], '#2f3340', 1.7); E(c, r * .75, r * .12, r * .34, r * .14, '#2f3340', 0); },
    },
  },
  panzerfaust: {
    eyes: eyePair(.3, .05, .25),
    body(c, r, k, f) { feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes); },
    headgear(c, r) { helmet(c, r, '#5d6b3a'); },
    weapon: {
      grip: [.05, -.3], axis: Math.atan2(-.55, 2.4), swing: 0,
      draw(c, r) {
        Ln(c, [[-r * 1.15, -r * .05], [r * 1.25, -r * .6]], '#6b7a46', 3.6);
        c.beginPath(); c.moveTo(r * 1.2, -r * .85); c.lineTo(r * 1.85, -r * .72); c.lineTo(r * 1.3, -r * .38); c.closePath(); c.fillStyle = '#3a3f4a'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
      },
    },
  },
  moerser: {
    eyes: eyePair(.28, 0, .26),
    body(c, r, k, f) {
      feet(c, r, k.dk, f);
      Ln(c, [[r * .55, r * .98], [r * 1.35, r * .98]], '#2f3340', 2, false);   // Bodenplatte bleibt liegen
      E(c, 0, 0, r, r * 1.05, k.col); whites(c, r, this.eyes);
    },
    headgear(c, r) { helmet(c, r, '#5d6b3a'); },
    weapon: {
      grip: [1.0, .8], axis: Math.atan2(-1.3, .45), swing: 0,
      draw(c, r) { Ln(c, [[r * .95, r * .95], [r * 1.4, -r * .35]], '#3a3f4a', 4.2); },
    },
  },
  // Römer (Spez. #25): Tunika in Teamfarbe mit Gürtel, Stahlhelm mit rotem Querkamm, Wangen- und
  // Nackenschutz; Waffe Bild 0 Kurzschwert (Gladius), Bild 1 Speer (Pilum) in der Hand, bis er geworfen ist.
  // shield: großes, leicht gewölbtes Scutum in Teamfarbe (etwas dunkler als der Körper) mit hellem Rand,
  // Mittelrippe und Buckel, um seine Mitte gezeichnet; Lage, Drehung und Breite kommen aus der Pose
  // (pose.SHIELD_FRONT / SHIELD_SIDE). Die Augen sitzen hoch, damit sie über den Schildrand schauen.
  roemer: {
    eyes: eyePair(.12, -.4, .25),
    body(c, r, k, f) {
      feet(c, r, '#8a5a2b', f); E(c, 0, 0, r, r * 1.05, k.col);
      // Gürtel (Cingulum) mit Beschlägen, auf den Körper beschnitten
      c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 1.05, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = '#7a4f2a'; c.fillRect(-r, r * .3, r * 2, r * .16);
      c.restore();
      for (const x of [-.45, -.1, .25]) E(c, r * x, r * .38, r * .06, r * .06, '#ffd25a', 0);
      E(c, 0, 0, r, r * 1.05, null, 1.4);
      whites(c, r, this.eyes);
    },
    headgear(c, r) {
      // Querkamm: Bürste quer über den Helm (von vorn gesehen breit), mit dunklen Strähnen
      c.beginPath(); c.ellipse(0, -r * 1.1, r * .74, r * .46, 0, Math.PI, 0); c.closePath();
      c.fillStyle = '#e5574f'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = O; c.stroke();
      c.strokeStyle = '#b8352f'; c.lineWidth = .9; c.beginPath();
      for (const a of [-2.6, -2.1, -1.57, -1.05, -.55]) { c.moveTo(Math.cos(a) * r * .22, -r * 1.1 + Math.sin(a) * r * .14); c.lineTo(Math.cos(a) * r * .62, -r * 1.1 + Math.sin(a) * r * .38); }
      c.stroke();
      // Nackenschutz (hinten) und Kalotte
      poly(c, r, [[-.8, -.74], [-1.16, -.5], [-1.02, -.38], [-.72, -.58]], '#9aa3ae', 1.2);
      c.beginPath(); c.ellipse(0, -r * .64, r * .99, r * .54, 0, Math.PI, 0); c.closePath();
      c.fillStyle = '#c3cad3'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
      E(c, -r * .3, -r * .94, r * .28, r * .1, 'rgba(255,255,255,.55)', 0, null, -.25);
      // Stirnreif in Bronze, Wangenklappe vorn
      Ln(c, [[-r * .96, -r * .66], [r * .96, -r * .66]], '#d9a441', 1.6);
      poly(c, r, [[.66, -.68], [.96, -.68], [.92, -.3], [.76, -.26]], '#c3cad3', 1.2);
      E(c, r * .83, -r * .5, r * .05, r * .05, '#d9a441', 0);
    },
    weapon: {
      grip: [.85, .3], axis: Math.atan2(-1, .7), swing: 1, frames: 2,
      draw(c, r, k, f) {
        if (f === 1) {
          // Pilum senkrecht in der Hand: Holzschaft, langer Eisenschaft, kleine Spitze
          Ln(c, [[r * .72, r * 1.0], [r * 1.02, -r * .6]], '#c9a26b', 1.9);
          Ln(c, [[r * 1.02, -r * .6], [r * 1.26, -r * 1.85]], '#8d96a3', 1.2);
          poly(c, r, [[1.18, -1.82], [1.36, -2.25], [1.36, -1.8]], '#e6ebf0', 1);
          return;
        }
        // Gladius: kurze breite Klinge mit Spitze, Parierstange, Griff, Knauf
        poly(c, r, [[.92, .1], [1.4, -.6], [1.56, -.92], [1.46, -.52], [1.06, .2]], '#eef2f6', 1.2);
        Ln(c, [[r * 1.02, r * .1], [r * 1.42, -r * .62]], '#aab3be', .8, false);
        Ln(c, [[r * .82, r * .06], [r * 1.16, r * .28]], '#d9a441', 1.6);
        Ln(c, [[r * .99, r * .17], [r * .85, r * .4]], '#7a4f2a', 1.6);
        E(c, r * .82, r * .45, r * .08, r * .08, '#d9a441', 1);
      },
    },
    shield: {
      draw(c, r, k) {
        const w = r * .6, h = r * .78, bx = r * .09;   // halbe Breite und Höhe, Wölbung der Seiten
        const face = shade(k.col, -.1);
        const path = (sw, sh, b) => {
          c.beginPath(); c.moveTo(-sw, -sh + r * .1);
          c.quadraticCurveTo(-sw, -sh, -sw + r * .1, -sh); c.lineTo(sw - r * .1, -sh); c.quadraticCurveTo(sw, -sh, sw, -sh + r * .1);
          c.quadraticCurveTo(sw + b, 0, sw, sh - r * .1); c.quadraticCurveTo(sw, sh, sw - r * .1, sh); c.lineTo(-sw + r * .1, sh);
          c.quadraticCurveTo(-sw, sh, -sw, sh - r * .1); c.quadraticCurveTo(-sw - b, 0, -sw, -sh + r * .1); c.closePath();
        };
        path(w, h, bx); c.fillStyle = face; c.fill(); c.lineWidth = 1.5; c.strokeStyle = O; c.stroke();
        // Wölbung: heller Streifen links, dunkler rechts
        c.save(); path(w, h, bx); c.clip();
        c.fillStyle = shade(k.col, .28); c.fillRect(-w - bx, -h, w * .55, h * 2);
        c.fillStyle = shade(k.col, -.32); c.fillRect(w * .62, -h, w * .5 + bx, h * 2);
        c.restore();
        // heller Rand, Mittelrippe, Buckel mit Glanz
        path(w - r * .1, h - r * .1, bx * .6); c.lineWidth = 1.1; c.strokeStyle = '#ffe08a'; c.stroke();
        Ln(c, [[0, -h + r * .14], [0, h - r * .14]], '#ffe08a', 1.1, false);
        E(c, 0, 0, r * .25, r * .23, '#d9dde3', 1.2);
        E(c, -r * .06, -r * .06, r * .07, r * .05, '#fff', 0);
      },
    },
  },
  ...BOSS_DEF,
};

// Varianten: 0 = neutral (Sandkasten), 1..4 = Teams. Teamabhängig gezeichnet werden nur Typen,
// deren Körper die Teamfarbe trägt (TINT), und der Ritter (Schild in Teamfarbe).
export const TEAM_KEYS = ['', 'blau', 'rot', 'gruen', 'gelb'];
export const TEAM_INDEX = { blau: 1, rot: 2, gruen: 3, gelb: 4 };
const teamed = t => TINT.has(t) || t === 'ritter';

function colors(t, vi) {
  const tc = vi ? TEAMS[TEAM_KEYS[vi]].body : null;
  const col = tc && TINT.has(t) ? tc : U[t].col;
  return { col, dk: shade(col, -.3), shield: tc || '#3f6fcf' };
}

function drawLid(c, r, e) {
  for (const p of [e.L, e.R]) {
    const x = p[0] * r, y = p[1] * r, s = e.s * r;
    E(c, x, y, s * .95, s * 1.1, '#fff', 1.1);
    c.beginPath(); c.moveTo(x - s * .65, y + s * .05); c.quadraticCurveTo(x, y + s * .5, x + s * .65, y + s * .05);
    c.lineWidth = .9; c.strokeStyle = O; c.stroke();
  }
}

// Angstbrauen (Rückzug, Spez. #27): je Auge ein Strich darüber, innen (zur Mitte zwischen den Augen) höher
// gezogen als außen. Ein Teil für beide Augen wie das Lid; der Renderer zeichnet es nur bei pose.fear.
function drawBrow(c, r, e) {
  const mid = (e.L[0] + e.R[0]) / 2;
  for (const p of [e.L, e.R]) {
    const x = p[0] * r, y = p[1] * r, s = e.s * r, inn = p[0] < mid ? 1 : -1;
    c.beginPath(); c.moveTo(x - inn * s * .85, y - s * .8); c.quadraticCurveTo(x, y - s * 1.1, x + inn * s * .75, y - s * 1.3);
    c.lineWidth = 1.5; c.strokeStyle = O; c.stroke();
  }
}

// Zeichenradius: Bosse größer (BOSS_VIS), alle anderen r
export const drawR = t => U[t].r * (BOSS_VIS[t] || 1);
const EYE_PARTS = new Set(['shadow', 'pupilL', 'pupilR', 'lid']);

// Zeichnet ein Teil in Variante vi, Bild f (Ursprung = Einheit bzw. Drehpunkt bei Pupillen und Boss-Teilen).
function drawPart(c, t, part, vi, f) {
  const D = DEF[t], r = drawR(t), k = colors(t, vi);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (D.parts && !EYE_PARTS.has(part)) { D.parts[part].draw(c, r, k, f); return; }
  switch (part) {
    case 'shadow': {
      const sh = D.shadow || [.85, .28, 1.05], rg = D.ring || [1.12, .42, 1.0];
      E(c, 0, r * sh[2], r * sh[0], r * sh[1], 'rgba(40,40,70,.13)', 0);
      if (vi) E(c, 0, r * rg[2], r * rg[0], r * rg[1], null, 3, TEAMS[TEAM_KEYS[vi]].c);
      break;
    }
    case 'body': D.body(c, r, k, f); break;
    case 'pupilL': case 'pupilR': E(c, 0, 0, D.eyes.prx * r, D.eyes.pry * r, O, 0); break;
    case 'lid': if (D.lid) D.lid(c, r, D.eyes); else drawLid(c, r, D.eyes); break;
    case 'brow': drawBrow(c, r, D.eyes); break;
    case 'headgear': D.headgear(c, r, k, f); break;
    case 'weapon': D.weapon.draw(c, r, k, f); break;
    case 'shield': D.shield.draw(c, r, k, f); break;
  }
}
// Für Tests: ein Teil in Variante vi, Bild f auf einen beliebigen 2D-Kontext zeichnen
export const drawRigPart = drawPart;

// Welche Teile ein Typ hat, wie viele Varianten und Bilder; Drehpunkt in Welt-Einheiten.
// Boss-Teile (DEF.parts) sind um ihren Drehpunkt gezeichnet (Anker = Ursprung).
function partSpec(t, part) {
  const D = DEF[t], r = drawR(t), tv = teamed(t) ? 5 : 1;
  if (D.parts && !EYE_PARTS.has(part)) {
    const P = D.parts[part];
    return P ? { nv: P.team ? tv : 1, nf: P.frames || 1, scanV: 0, pivot: P.pivot ? [P.pivot[0] * r, P.pivot[1] * r] : [0, 0] } : null;
  }
  switch (part) {
    case 'shadow': return { nv: 5, nf: 1, scanV: 1, pivot: [0, 0] };
    case 'body': return { nv: tv, nf: D.frames || 2, scanV: 0, pivot: [0, 0] };
    case 'pupilL': case 'pupilR': return D.eyes ? { nv: 1, nf: 1, scanV: 0, pivot: [0, 0] } : null;
    case 'lid': return D.eyes && D.lid !== false ? { nv: 1, nf: 1, scanV: 0, pivot: [0, 0] } : null;
    case 'headgear': return D.headgear ? { nv: tv, nf: D.hgFrames || 1, scanV: 0, pivot: [0, 0] } : null;
    case 'weapon': return D.weapon ? { nv: tv, nf: D.weapon.frames || 1, scanV: 0, pivot: [D.weapon.grip[0] * r, D.weapon.grip[1] * r] } : null;
    // Angstbrauen normaler Figuren mit Augen (FEAR_PARTS)
    case 'brow': return D.eyes && !D.boss ? { nv: 1, nf: 1, scanV: 0, pivot: [0, 0] } : null;
    // Zusatzteil (EXTRA_PARTS) normaler Figuren, um seine Mitte gezeichnet (Lage aus der Pose)
    case 'shield': return D.shield ? { nv: tv, nf: 1, scanV: 0, pivot: [0, 0] } : null;
  }
  return null;
}
// Zusatzteile normaler Figuren über RIG_PARTS hinaus (Römer: Schild); ohne bleibt rig[name] leer
export const EXTRA_PARTS = ['shield'];
const extraNames = t => (DEF[t].parts ? [] : EXTRA_PARTS.filter(n => DEF[t][n]));
// Angstteile (Spez. #27): Brauen für normale Figuren mit Augen; Bosse zeigen nur kleine Pupillen und den Tropfen
export const FEAR_PARTS = ['brow'];
const fearNames = t => (DEF[t].parts || !DEF[t].eyes ? [] : FEAR_PARTS);
// alle Teile eines Typs: RIG_PARTS, bei Bossen dazu ihre eigenen Teile, sonst die vorhandenen Zusatz- und Angstteile
const partNames = t => (DEF[t].parts ? [...RIG_PARTS, ...Object.keys(DEF[t].parts).filter(n => !RIG_PARTS.includes(n))] : [...RIG_PARTS, ...extraNames(t), ...fearNames(t)]);

export const spriteSize = r => r * 4.6 + 14;

/* ---------- Atlas ---------- */
const PAGE = 2048, PAD = 2;
function createAtlas() {
  const pages = [];
  let cur = null, cx = 0, cy = 0, rowH = 0;
  const newPage = () => {
    // CPU-Canvas wie das Schmierblatt: Kopieren bleibt im Speicher, PIXI lädt die Seite einmal hoch
    const cv = document.createElement('canvas'); cv.width = cv.height = PAGE;
    cur = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }), base: new PIXI.BaseTexture(cv, { mipmap: PIXI.MIPMAP_MODES.OFF }) };
    pages.push(cur); cx = PAD; cy = PAD; rowH = 0;
  };
  return {
    pages,
    alloc(w, h) {
      if (!cur) newPage();
      if (cx + w + PAD > PAGE) { cx = PAD; cy += rowH + PAD; rowH = 0; }
      if (cy + h + PAD > PAGE) newPage();
      const slot = { page: cur, x: cx, y: cy };
      cx += w + PAD; rowH = Math.max(rowH, h);
      return slot;
    },
  };
}

const hexNum = s => parseInt(s.slice(1), 16);

/* Backt alle Teile aller Typen.
   Liefert Map<type, Rig> mit Rig = {
     shadow, body, pupilL, pupilR, lid, headgear, weapon: PIXI.Texture | null (neutral, Bild 0),
     anchors: {[part]: {ax, ay, x, y}}   Sprite-Anker (0..1) und Lage des Drehpunkts im Rig (Welt-Einheiten),
     tex: {[part]: Texture[variante][bild]} (pupilL/pupilR/lid nur Variante 0; das Lid wird per tint eingefärbt),
     lidTint: [5 Farben als Zahl], eyes, eyeR (Augenradius in Welt-Einheiten), weapon-Daten (axis, swing),
     r, fly, teamed, pivotX/pivotY (Quetsch- und Neige-Drehpunkt: Füße bzw. Mitte; Heli: Mündung), offY (alter Flieger-Versatz; der Renderer
     zeichnet Flieger seit der Höhenachse bei y − z und nutzt offY nicht mehr) }
   Die Map trägt zusätzlich resolution und destroy(). renderer bleibt für die Schnittstelle erhalten. */
// eslint-disable-next-line no-unused-vars
export function bakeRigTextures(renderer, resolution) {
  const t0 = performance.now(), res = resolution, atlas = createAtlas();
  let maxPx = 0;
  for (const t in U) maxPx = Math.max(maxPx, Math.ceil(spriteSize(drawR(t)) * res));
  const scv = document.createElement('canvas'); scv.width = scv.height = maxPx;
  const sc = scv.getContext('2d', { willReadFrequently: true });
  const paintScratch = (spx, t, part, vi, f) => {
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, spx, spx);
    sc.setTransform(res, 0, 0, res, spx / 2, spx / 2);
    drawPart(sc, t, part, vi, f);
  };

  const rigs = new Map();
  for (const t in U) {
    const T = U[t], D = DEF[t], r = drawR(t), spx = Math.ceil(spriteSize(r) * res);
    const lidTint = [0, 1, 2, 3, 4].map(vi => hexNum(D.lidCol || colors(t, vi).col));
    const rig = {
      type: t, r, fly: !!T.fly, teamed: teamed(t), anchors: {}, tex: {}, lidTint,
      eyes: D.eyes ? { L: [D.eyes.L[0] * r, D.eyes.L[1] * r], R: [D.eyes.R[0] * r, D.eyes.R[1] * r] } : null,
      eyeR: D.eyes ? D.eyes.s * r : 0,
      axis: D.weapon ? D.weapon.axis : 0, swing: D.weapon ? D.weapon.swing : 0,
      pivotX: D.pivot ? D.pivot[0] * r : 0, pivotY: D.pivot ? D.pivot[1] * r : T.fly ? 0 : r, offY: T.fly ? -r * .5 : 0,
      // Boss-Sticker: eigene Teile, Augen in eyeGroup, Lage der HP-Leiste und der Krone (Welt-Einheiten)
      boss: !!D.boss, eyeGroup: D.eyeGroup || 'body', barTop: (D.top || -1.6) * r, crownTop: (D.crown || -1.75) * r,
      corpseBody: D.corpseBody || 'body', partMap: D.partMap || null,
    };
    for (const part of partNames(t)) {
      const sp = partSpec(t, part);
      rig[part] = null; rig.tex[part] = null; rig.anchors[part] = null;
      if (!sp) continue;
      // gemeinsamer Ausschnitt über alle Bilder (Varianten unterscheiden sich nur in der Farbe)
      let x0 = spx, y0 = spx, x1 = -1, y1 = -1;
      for (let f = 0; f < sp.nf; f++) {
        paintScratch(spx, t, part, sp.scanV, f);
        const d = sc.getImageData(0, 0, spx, spx).data;
        for (let y = 0; y < spx; y++) for (let x = 0, i = y * spx * 4 + 3; x < spx; x++, i += 4) {
          if (!d[i]) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) continue;
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(spx - 1, x1 + 1); y1 = Math.min(spx - 1, y1 + 1);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const tex = [];
      for (let vi = 0; vi < sp.nv; vi++) {
        const fr = [];
        for (let f = 0; f < sp.nf; f++) {
          paintScratch(spx, t, part, vi, f);
          const s = atlas.alloc(w, h);
          s.page.ctx.drawImage(scv, x0, y0, w, h, s.x, s.y, w, h);
          fr.push(new PIXI.Texture(s.page.base, new PIXI.Rectangle(s.x, s.y, w, h)));
        }
        tex.push(fr);
      }
      rig.tex[part] = tex;
      rig[part] = tex[0][0];
      rig.anchors[part] = { ax: (spx / 2 + sp.pivot[0] * res - x0) / w, ay: (spx / 2 + sp.pivot[1] * res - y0) / h, x: sp.pivot[0], y: sp.pivot[1] };
    }
    if (rig.eyes) {
      rig.anchors.pupilL = { ...rig.anchors.pupilL, x: rig.eyes.L[0], y: rig.eyes.L[1] };
      rig.anchors.pupilR = { ...rig.anchors.pupilR, x: rig.eyes.R[0], y: rig.eyes.R[1] };
    }
    rigs.set(t, rig);
  }
  for (const p of atlas.pages) p.base.update();
  rigs.resolution = res;
  rigs.pages = atlas.pages.length;
  rigs.bakeMs = Math.round(performance.now() - t0);
  rigs.destroy = () => { for (const p of atlas.pages) p.base.destroy(); rigs.clear(); };
  return rigs;
}

// Symbolbild (data-URL) für Palette und Zählerliste: das Rig in Ruhepose (Pupillen leicht nach vorn unten)
export function iconURL(t){
  const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');
  if(U[t]&&DEF[t].boss){
    // Boss-Sticker: ganze Figur in Ruhepose, auf die Breite iconFit[0] (r-Einheiten) eingepasst
    const D=DEF[t],r=drawR(t),f=D.iconFit,s=84/(f[0]*r);
    x.setTransform(s,0,0,s,48-f[1]*r*s,52-f[2]*r*s);x.lineCap='round';x.lineJoin='round';
    D.compose(x,r,colors(t,0),true);
  }
  else if(U[t]){
    const r=U[t].r,s=Math.min(42/(r*2.3),4.4),D=DEF[t];
    const at=(tx,ty)=>{x.setTransform(s,0,0,s,44,52);if(U[t].fly)x.translate(0,-r*.3);x.translate(tx,ty);};
    at(0,0);drawPart(x,t,'body',0,0);
    if(D.eyes)for(const p of[D.eyes.L,D.eyes.R]){at(p[0]*r+D.eyes.s*r*.35,p[1]*r+D.eyes.s*r*.15);drawPart(x,t,'pupilL',0,0);}
    at(0,0);if(D.headgear)drawPart(x,t,'headgear',0,0);
    // Römer: Speer in der Hand, Schild vor dem Körper (wie im Block)
    if(D.shield){drawPart(x,t,'weapon',0,1);at(SHIELD_FRONT[0]*r,SHIELD_FRONT[1]*r);drawPart(x,t,'shield',0,0);}
    else if(D.weapon)drawPart(x,t,'weapon',0,0);
  }
  else{
    const blob=(c1,c2)=>{x.fillStyle=c1;x.beginPath();x.ellipse(48,50,36,28,-.2,0,7);x.fill();x.fillStyle=c2;x.beginPath();x.ellipse(48,50,27,20,-.2,0,7);x.fill();};
    if(t==='wasser')blob('#a8e6f0','#62b9ea');
    if(t==='lava'){blob('#ffb54d','#f2652f');x.fillStyle='#ffd36b';[[38,46],[58,56],[50,40]].forEach(p=>{x.beginPath();x.arc(p[0],p[1],4,0,7);x.fill();});}
    if(t==='wald'){x.fillStyle='#a7d9a0';x.beginPath();x.ellipse(48,54,38,26,0,0,7);x.fill();[[34,48,15],[60,44,17],[48,62,14]].forEach(p=>E(x,p[0],p[1],p[2],p[2],'#4e9f5d',2.4,'#2f6b3b'));}
    if(t==='mauer'){x.lineCap='round';x.strokeStyle='#5b5f69';x.lineWidth=22;x.beginPath();x.moveTo(18,70);x.lineTo(78,30);x.stroke();x.strokeStyle='#a3a8b2';x.lineWidth=13;x.stroke();}
    if(t==='radierer'){x.translate(48,50);x.rotate(-.6);x.fillStyle='#ff9fb3';x.strokeStyle=O;x.lineWidth=3;x.beginPath();if(x.roundRect)x.roundRect(-30,-16,60,32,7);else x.rect(-30,-16,60,32);x.fill();x.stroke();x.fillStyle='#7aa7ff';x.fillRect(6,-14.5,22,29);x.beginPath();x.moveTo(6,-16);x.lineTo(6,16);x.stroke();}
  }
  return c.toDataURL();
}

// Für Tests und Prüfungen: welche Teile ein Typ hat (ohne PIXI/DOM)
export function rigLayout(t) {
  const out = {};
  for (const part of RIG_PARTS) { const sp = partSpec(t, part); out[part] = sp ? { variants: sp.nv, frames: sp.nf } : null; }
  return out;
}
// Zusatzteile (EXTRA_PARTS) mit Varianten und Bildern; null ohne
export function rigExtras(t) {
  const names = DEF[t] ? extraNames(t) : [];
  if (!names.length) return null;
  const out = {};
  for (const part of names) { const sp = partSpec(t, part); out[part] = { variants: sp.nv, frames: sp.nf }; }
  return out;
}
// Angstteile (FEAR_PARTS) eines Typs, { brow: true } bzw. null ohne
export function rigFear(t) {
  const names = DEF[t] ? fearNames(t) : [];
  if (!names.length) return null;
  const out = {};
  for (const part of names) out[part] = !!partSpec(t, part);
  return out;
}
// Boss-Teile (alle Teile aus DEF.parts) mit Varianten und Bildern; null für normale Figuren
export function bossLayout(t) {
  const D = DEF[t];
  if (!D || !D.parts) return null;
  const out = {};
  for (const part in D.parts) { const sp = partSpec(t, part); out[part] = { variants: sp.nv, frames: sp.nf }; }
  return out;
}
export { E };
