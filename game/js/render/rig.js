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
          E(c, r * .98, -r * .14, r * .08, r * .07, '#ffe9a8', 1);
          // Bug-MG (Nachtrag 7, #49; vorher ein 2 px dünner Strich): Lauf mit Umriss bis zur Mündung TANK_GEO.mg
          // (combat.hullMg schießt dort), Kühlmantel mit Löchern, Mündungsdämpfer; darüber die Lafette: Schutzschild in
          // Teamfarbe an der Bugplatte und die Kugelblende, durch die der Lauf kommt
          const mg = TANK_GEO.mg, mb = TANK_GEO.mgMount, y = r * mg[1];
          Ln(c, [[r * mb[0], y], [r * (mg[0] - .05), y]], '#2b2e35', 2.4);
          RR(c, r * (mb[0] + .13), y - r * .07, r * .17, r * .14, r * .035, '#4a4e57');
          for (let i = 0; i < 3; i++) E(c, r * (mb[0] + .165 + i * .05), y, r * .017, r * .017, '#1f2126', 0);
          RR(c, r * (mg[0] - .08), y - r * .055, r * .08, r * .11, r * .02, '#2b2e35');
          poly(c, r, [[mb[0] - .05, -.15], [mb[0] + .07, -.12], [mb[0] + .09, .18], [mb[0] - .03, .2]], k.col, 1.3);
          Ln(c, [[r * (mb[0] - .02), -r * .1], [r * mb[0], r * .15]], k.dk, 1, false);
          E(c, r * (mb[0] + .03), y, r * .085, r * .085, k.dk, 1.2);
          E(c, r * (mb[0] + .01), y - r * .025, r * .03, r * .025, 'rgba(255,255,255,.35)', 0);
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
  // König: Teamfarbe, roter Umhang hinter dem Körper, goldene Krone, Schwert mit goldenem Griff
  koenig: {
    eyes: eyePair(.28, -.02, .27),
    body(c, r, k, f) {
      poly(c, r, [[-.35, -.55], [-1.25, .95], [.1, .9]], '#b8323a', 1.3);
      feet(c, r, k.dk, f); E(c, 0, 0, r, r * 1.05, k.col);
      E(c, 0, r * .55, r * .78, r * .2, '#f4f1e8', 1);
      whites(c, r, this.eyes);
    },
    headgear(c, r) {
      poly(c, r, [[-.6, -.72], [-.66, -1.32], [-.33, -1.0], [0, -1.42], [.33, -1.0], [.66, -1.32], [.6, -.72]], '#ffc533', 1.4);
      E(c, 0, -r * 1.12, r * .1, r * .1, '#e5574f', 0); E(c, -r * .45, -r * .92, r * .07, r * .07, '#3f7cff', 0); E(c, r * .45, -r * .92, r * .07, r * .07, '#3f7cff', 0);
    },
    weapon: {
      grip: [.8, .26], axis: Math.atan2(-1.05, .97), swing: 1,
      draw(c, r) { Ln(c, [[r * .78, r * .3], [r * 1.95, -r * .95]], '#eef2f6', 2.6); Ln(c, [[r * .5, -r * .02], [r * 1.1, r * .55]], '#ffc533', 2.2); E(c, r * .66, r * .44, r * .12, r * .12, '#ffc533', 1); },
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
  // Vampir (Spez. #32): blasse Haut, dunkles Haar mit Spitze in der Stirn, hoher Kragen (dunkle Teamfarbe, rot gefüttert)
  // und Umhang in Teamfarbe hinter dem Körper, vorn rote Revers mit goldener Spange, Lächeln mit zwei Eckzähnen.
  // Keine Waffe und keine Kopfbedeckung (der Biss ist die Waffe); Lid in Hautfarbe. Die Fledermausform zeichnet der
  // Renderer (renderer.batSwarm), nicht das Rig.
  vampir: {
    eyes: eyePair(.3, -.1, .25), lidCol: '#ece6f0',
    body(c, r, k, f) {
      // Umhang: von den Schultern breit bis zum Boden, Saum mit Zacken
      c.beginPath(); c.moveTo(-r * .8, -r * .45);
      c.quadraticCurveTo(-r * 1.35, r * .3, -r * 1.3, r * 1.0);
      for (let i = 0; i < 4; i++) { const x0 = -r * 1.3 + i * r * .55; c.quadraticCurveTo(x0 + r * .27, r * .78, x0 + r * .55, r * (i % 2 ? 1.02 : .96)); }
      c.quadraticCurveTo(r * 1.1, r * .3, r * .7, -r * .45); c.closePath();
      c.fillStyle = k.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
      // Stehkragen: links und rechts ein breiter Fächer, der den Kopf von hinten einrahmt, innen rot
      for (const s of [-1, 1]) {
        poly(c, r, [[s * .45, -.1], [s * 1.28, -.98], [s * 1.12, -.55], [s * 1.02, -.2]], k.dk, 1.3);
        poly(c, r, [[s * .62, -.22], [s * 1.12, -.8], [s * .98, -.32]], '#b3243a', 0);
      }
      feet(c, r, '#2f2638', f);
      E(c, 0, 0, r, r * 1.05, '#ece6f0');
      // Haar: dunkle Kappe mit Spitze in der Stirn (Blick nach rechts)
      c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 1.05, 0, 0, Math.PI * 2); c.clip();
      c.beginPath(); c.moveTo(-r * 1.1, -r * .2); c.quadraticCurveTo(-r * .9, -r * 1.25, r * .2, -r * 1.1);
      c.quadraticCurveTo(r * 1.05, -r * .95, r * 1.1, -r * .5); c.lineTo(r * .62, -r * .58); c.lineTo(r * .32, -r * .32);
      c.lineTo(r * .05, -r * .6); c.quadraticCurveTo(-r * .55, -r * .6, -r * 1.1, -r * .2); c.closePath();
      c.fillStyle = '#2f2638'; c.fill();
      // Revers: zwei rote Dreiecke von den Schultern zur Brust, goldene Spange
      c.fillStyle = '#b3243a';
      c.beginPath(); c.moveTo(-r * .9, r * .2); c.lineTo(-r * .05, r * .62); c.lineTo(-r * .7, r * 1.1); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(r * .9, r * .2); c.lineTo(r * .05, r * .62); c.lineTo(r * .7, r * 1.1); c.closePath(); c.fill();
      c.restore();
      E(c, 0, 0, r, r * 1.05, null, 1.4);
      E(c, 0, r * .62, r * .11, r * .11, '#ffd25a', .9);
      // Mund mit Eckzähnen
      c.beginPath(); c.moveTo(r * .08, r * .2); c.quadraticCurveTo(r * .34, r * .34, r * .6, r * .18); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
      poly(c, r, [[.18, .25], [.23, .42], [.29, .28]], '#fff', .7);
      poly(c, r, [[.42, .27], [.47, .43], [.52, .24]], '#fff', .7);
      whites(c, r, this.eyes);
    },
  },
  // Ghul (Spez. #32): grünlich-grau, fleckig, mit nach vorn gestreckten Armen und Krallen, zerrissene Lumpen in Teamfarbe
  // (k.shield, wie der Ritterschild), schiefer Mund mit einem Zahn. Gebückt und schwankend macht ihn die Pose (pose.js).
  ghul: {
    eyes: eyePair(.32, -.18, .23),
    body(c, r, k, f) {
      // hinterer Arm, dann Körper, vorderer Arm (nach vorn gestreckt, leicht hängend)
      const a = f ? .06 : -.06;
      Ln(c, [[r * .2, r * .05], [r * 1.25, r * (.22 + a)]], '#7d8a73', 2.4);
      feet(c, r, '#5e6a56', f);
      E(c, 0, 0, r, r * 1.05, k.col);
      // Flecken und Lumpen (auf den Körper beschnitten)
      c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 1.05, 0, 0, Math.PI * 2); c.clip();
      E(c, -r * .45, -r * .45, r * .2, r * .15, '#7b8870', 0); E(c, -r * .6, r * .1, r * .14, r * .12, '#7b8870', 0);
      c.beginPath(); c.moveTo(-r * 1.1, r * .25); c.lineTo(r * 1.1, r * .15); c.lineTo(r * 1.1, r * .72);
      for (let i = 0; i < 5; i++) { const x = r * 1.1 - (i + 1) * r * .44; c.lineTo(x + r * .22, r * (i % 2 ? .62 : .98)); c.lineTo(x, r * .72); }
      c.closePath(); c.fillStyle = k.shield; c.fill(); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
      Ln(c, [[-r * .4, r * .32], [-r * .3, r * .6]], shade(k.shield, -.35), .8, false);
      c.restore();
      E(c, 0, 0, r, r * 1.05, null, 1.4);
      // schiefer Mund mit Zahn
      c.beginPath(); c.moveTo(r * .1, r * .2); c.lineTo(r * .3, r * .14); c.lineTo(r * .48, r * .24); c.lineTo(r * .66, r * .12);
      c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
      poly(c, r, [[.32, .16], [.36, .29], [.41, .19]], '#f3ead8', .6);
      whites(c, r, this.eyes);
      // vorderer Arm mit Krallen
      Ln(c, [[r * .45, r * .35], [r * 1.45, r * (.45 - a)]], '#8f9c84', 2.6);
      for (let i = -1; i <= 1; i++) Ln(c, [[r * 1.45, r * (.45 - a)], [r * 1.7, r * (.45 - a + i * .14)]], '#f3ead8', .7, false);
    },
  },
  // --- Task 6: Kreaturen (Spez. #34) --- Sticker mit Glubschaugen und Umriss O; die Teamfarbe trägt ein Akzent (k.shield,
  // wie die Lumpen des Ghuls; neutral T6_ACCENT): Lendenschurz (Troll), Gurt (Zyklop), Hutband und Schal (Hexe),
  // Brustfeder (Phönix), Satteldecke (Einhorn). Der Frosch bleibt grün (Team am Teamring).
  // Troll: grünlich, breit, mit Warzen, Spitzohren, Knollennase und zwei Hauern; Waffe: Keule.
  troll: {
    eyes: eyePair(.3, -.3, .19),
    body(c, r, k, f) {
      const dk = shade(k.col, -.32);
      poly(c, r, [[-.62, -.55], [-1.12, -.85], [-.8, -.25]], k.col, 1.2);
      feet(c, r, dk, f);
      E(c, 0, 0, r, r * 1.05, k.col);
      c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 1.05, 0, 0, Math.PI * 2); c.clip();
      E(c, r * .12, r * .42, r * .62, r * .48, shade(k.col, .16), 0);
      // Lendenschurz in Akzentfarbe mit Zacken
      c.beginPath(); c.moveTo(-r * 1.1, r * .48); c.lineTo(r * 1.1, r * .42); c.lineTo(r * 1.1, r * .8);
      for (let i = 0; i < 5; i++) { const x = r * 1.1 - (i + 1) * r * .44; c.lineTo(x + r * .22, r * (i % 2 ? .78 : 1.02)); c.lineTo(x, r * .8); }
      c.closePath(); c.fillStyle = k.shield; c.fill(); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
      c.restore();
      E(c, 0, 0, r, r * 1.05, null, 1.4);
      // Warzen
      for (const [x, y, s] of [[-.5, -.55, .09], [-.62, .02, .07], [-.18, -.82, .06], [.62, .3, .07]]) E(c, r * x, r * y, r * s, r * s, dk, .8);
      // Knollennase, Mund mit zwei Hauern
      E(c, r * .64, r * -.04, r * .2, r * .16, shade(k.col, -.08), 1.1);
      c.beginPath(); c.moveTo(r * .12, r * .28); c.quadraticCurveTo(r * .38, r * .36, r * .66, r * .26); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
      poly(c, r, [[.2, .3], [.24, .12], [.3, .31]], '#f3ead8', .7);
      poly(c, r, [[.52, .3], [.57, .1], [.62, .28]], '#f3ead8', .7);
      whites(c, r, this.eyes);
    },
    weapon: {
      grip: [.85, .38], axis: Math.atan2(-1.2, .55), swing: 1,
      draw(c, r) {
        Ln(c, [[r * .8, r * .5], [r * 1.28, -r * .6]], '#8a5a2b', 2.6);
        E(c, r * 1.36, -r * .82, r * .3, r * .44, '#9a6a3b', 1.4, O, .4);
        for (const [x, y] of [[1.2, -.95], [1.5, -.7], [1.38, -1.12]]) E(c, r * x, r * y, r * .07, r * .07, '#6f4a26', .7);
      },
    },
  },
  // Zyklop: großer hautfarbener Kerl mit einem großen Auge mitten im Gesicht, Stirnhorn, Gurt in Akzentfarbe; Waffe:
  // Felsbrocken in der Hand (den wirft er).
  zyklop: {
    eyes: { L: [.22, -.34], R: [.22, -.34], s: .36, prx: .36 * .48, pry: .36 * .55, whites: true },
    body(c, r, k, f) {
      feet(c, r, shade(k.col, -.35), f);
      E(c, 0, 0, r, r * 1.08, k.col);
      c.save(); c.beginPath(); c.ellipse(0, 0, r, r * 1.08, 0, 0, Math.PI * 2); c.clip();
      // Fellschurz und Gurt quer über die Brust
      c.fillStyle = '#7a5434'; c.fillRect(-r, r * .55, r * 2, r * .6);
      c.beginPath(); c.moveTo(-r * .9, -r * .2); c.lineTo(-r * .62, -r * .42); c.lineTo(r * .9, r * .52); c.lineTo(r * .62, r * .74); c.closePath();
      c.fillStyle = k.shield; c.fill(); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
      c.restore();
      E(c, 0, 0, r, r * 1.08, null, 1.4);
      poly(c, r, [[-.12, -1.0], [.0, -1.32], [.12, -1.0]], '#efe4d2', 1.1);
      // breiter Mund mit einem Zahn
      c.beginPath(); c.moveTo(r * .0, r * .2); c.quadraticCurveTo(r * .3, r * .1, r * .6, r * .22); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
      poly(c, r, [[.28, .15], [.32, .3], [.37, .15]], '#fff', .6);
      whites(c, r, this.eyes);
    },
    weapon: {
      grip: [.95, .25], axis: 0, swing: .6,
      draw(c, r) {
        E(c, r * 1.12, r * .05, r * .42, r * .36, '#9aa0aa', 1.4, O, .3);
        E(c, r * 1.0, -r * .08, r * .12, r * .08, '#c3c8cf', 0);
        Ln(c, [[r * 1.18, -r * .12], [r * 1.3, r * .12]], '#6d727c', .8, false);
      },
    },
  },
  // Hexe: sitzt auf dem Besen (Stiel unter ihr, Reisig hinten, flattert in zwei Bildern), dunkles Kleid, grünliches
  // Gesicht mit langer Nase, graue Strähnen, Schal in Akzentfarbe; Kopfbedeckung: spitzer Hut mit Knick und Hutband.
  hexe: {
    eyes: eyePair(.3, -.36, .19),
    body(c, r, k, f) {
      const w = f ? .1 : -.1;
      Ln(c, [[-r * 1.35, r * .78], [r * 1.45, r * .55]], '#8a5a2b', 1.8);
      c.beginPath(); c.moveTo(-r * 1.2, r * .74); c.lineTo(-r * 2.05, r * (.4 + w)); c.lineTo(-r * 2.15, r * (.85 + w)); c.lineTo(-r * 2.0, r * (1.25 + w)); c.closePath();
      c.fillStyle = '#d9b45a'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
      Ln(c, [[-r * 1.25, r * .76], [-r * 1.9, r * (.82 + w)]], '#b08a3a', .8, false);
      // Kleid (Körper), Bein mit spitzem Schuh am Besen
      E(c, 0, r * .1, r, r * .95, k.col);
      Ln(c, [[r * .2, r * .8], [r * .45, r * 1.05]], shade(k.col, -.3), 2);
      poly(c, r, [[.38, .98], [.78, 1.0], [.52, 1.12]], '#2f2638', .9);
      // Gesicht und Haar
      E(c, r * .1, -r * .35, r * .72, r * .6, '#bfe0a8');
      for (const [x0, y0, x1, y1] of [[-.5, -.6, -.75, .05], [-.4, -.7, -.58, .12], [-.6, -.45, -.8, -.05]]) Ln(c, [[r * x0, r * y0], [r * x1, r * y1]], '#b9bcc4', 1.1);
      poly(c, r, [[.58, -.3], [1.05, -.12], [.6, -.08]], '#a9d48f', 1);
      c.beginPath(); c.moveTo(r * .22, r * .02); c.quadraticCurveTo(r * .4, r * .1, r * .56, r * .0); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
      // Schal in Akzentfarbe
      E(c, r * .05, r * .26, r * .62, r * .16, k.shield, 1.1);
      whites(c, r, this.eyes);
    },
    headgear(c, r, k) {
      E(c, r * .05, -r * .8, r * 1.05, r * .24, '#2f2638', 1.3);
      c.beginPath(); c.moveTo(-r * .55, -r * .82); c.lineTo(r * .6, -r * .82); c.lineTo(r * .05, -r * 1.75); c.lineTo(-r * .45, -r * 2.05); c.lineTo(-r * .18, -r * 1.55); c.closePath();
      c.fillStyle = '#2f2638'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = O; c.stroke();
      c.beginPath(); c.moveTo(-r * .5, -r * .9); c.lineTo(r * .56, -r * .9); c.lineTo(r * .48, -r * 1.06); c.lineTo(-r * .42, -r * 1.06); c.closePath();
      c.fillStyle = k.shield; c.fill(); c.lineWidth = .9; c.strokeStyle = O; c.stroke();
    },
  },
  // Phönix: runder Feuervogel (orange, gelber Bauch), Schwingen in zwei Bildern, Schnabel, Flammenkrone, langer
  // Flammenschweif hinten (rot, orange, gelb, flackert), Brustfeder in Akzentfarbe.
  phoenix: {
    eyes: eyePair(.42, -.28, .19),
    body(c, r, k, f) {
      const fl = f ? .12 : -.12;
      // Flammenschweif
      for (const [col, s, lw] of [['#e5574f', 1, 1.4], ['#ff8a3d', .78, 1.2], ['#ffe066', .52, 0]]) {
        c.beginPath(); c.moveTo(-r * .55, -r * .35 * s);
        c.quadraticCurveTo(-r * (1.4 + .3 * s), -r * (.9 + fl) * s, -r * (2.1 + .2 * s), -r * (.55 - fl) * s);
        c.quadraticCurveTo(-r * 1.6, -r * .05, -r * (2.25 + .15 * s), r * (.45 + fl) * s);
        c.quadraticCurveTo(-r * 1.3, r * .5 * s, -r * .55, r * .4 * s); c.closePath();
        c.fillStyle = col; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = O; c.stroke(); }
      }
      // hintere Schwinge
      E(c, -r * .2, -r * (.55 + (f ? .35 : 0)), r * .75, r * (f ? .55 : .3), '#e5574f', 1.2, O, f ? -.5 : -.2);
      E(c, 0, 0, r, r, k.col);
      E(c, r * .25, r * .35, r * .55, r * .45, '#ffd25a', 0);
      poly(c, r, [[.0, .3], [.18, .55], [.0, .8], [-.18, .55]], k.shield, 1);
      E(c, 0, 0, r, r, null, 1.4);
      // Flammenkrone und Schnabel
      for (const [x, h] of [[-.25, 1.45], [.05, 1.6], [.32, 1.4]]) poly(c, r, [[x - .12, -.85], [x + .04, -h - fl * .5], [x + .16, -.85]], '#ffb84d', 1);
      poly(c, r, [[.85, -.2], [1.35, -.02], [.85, .14]], '#ffd84d', 1.1);
      whites(c, r, this.eyes);
      // vordere Schwinge
      E(c, -r * .05, -r * (.1 + (f ? .45 : 0)), r * .7, r * (f ? .5 : .32), '#ff6a2a', 1.3, O, f ? -.6 : .15);
    },
  },
  // Einhorn: weißes Pferd mit vier Beinen (zwei Bilder), Kopf vorn oben mit goldenem Horn, Regenbogenmähne und -schweif,
  // Satteldecke in Akzentfarbe.
  einhorn: {
    eyes: eyePair(1.0, -.62, .13),
    body(c, r, k, f) {
      const l = f ? r * .18 : -r * .18, leg = '#dcd6e6', RB = ['#ff6b6b', '#ffb84d', '#ffe066', '#6fd36f', '#6fb7ff', '#b48cff'];
      [-r * .72, -r * .36, r * .36, r * .72].forEach((x, i) => Ln(c, [[x, r * .45], [x + (i % 2 ? l : -l), r * 1.05]], leg, 2.2));
      // Regenbogenschweif
      RB.forEach((col, i) => Ln(c, [[-r * 1.0, r * (.02 + i * .05)], [-r * (1.5 + i * .03), r * (.35 + i * .1) + l * .3]], col, 1.5, i === 0));
      E(c, 0, r * .28, r * 1.15, r * .55, k.col);
      // Satteldecke
      c.save(); c.beginPath(); c.ellipse(0, r * .28, r * 1.15, r * .55, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = k.shield; c.fillRect(-r * .45, -r * .4, r * .75, r * .78);
      Ln(c, [[-r * .45, r * .36], [r * .3, r * .36]], '#ffe08a', 1, false);
      c.restore();
      E(c, 0, r * .28, r * 1.15, r * .55, null, 1.4);
      // Hals und Kopf
      poly(c, r, [[.55, .05], [.75, -.55], [1.08, -.45], [.95, .2]], k.col, 1.3);
      E(c, r * 1.02, -r * .55, r * .42, r * .3, k.col, 1.4, O, -.35);
      E(c, r * 1.32, -r * .45, r * .06, r * .05, O, 0);
      // Regenbogenmähne am Hals
      RB.forEach((col, i) => E(c, r * (.62 + i * .06), -r * (.62 - i * .1), r * .12, r * .09, col, i === 0 || i === 5 ? .7 : 0, O, -.6));
      // goldenes Horn mit Rillen
      poly(c, r, [[.95, -.78], [1.22, -1.55], [1.12, -.72]], '#ffd84d', 1.1);
      for (const q of [.3, .55]) Ln(c, [[r * (.97 + .12 * q), r * (-.78 - .7 * q)], [r * (1.13 + .03 * q), r * (-.74 - .7 * q)]], '#d9a441', .7, false);
      whites(c, r, this.eyes);
    },
  },
  // Frosch (nicht malbar, Froschfluch): klein und grün, Glubschaugen oben auf dem Kopf, breites Maul, helle Kehle
  frosch: {
    eyes: { L: [-.02, -.72], R: [.5, -.72], s: .3, prx: .3 * .48, pry: .3 * .55, whites: true },
    body(c, r, k, f) {
      const dk = shade(k.col, -.3), l = f ? .1 : -.1;
      E(c, -r * .72, r * (.72 + l), r * .42, r * .22, dk, 1.1);
      E(c, 0, r * .08, r * 1.08, r * .82, k.col);
      E(c, r * .25, r * .42, r * .62, r * .32, '#cdeeb0', 0);
      E(c, 0, r * .08, r * 1.08, r * .82, null, 1.4);
      for (const p of [this.eyes.L, this.eyes.R]) E(c, p[0] * r, p[1] * r + r * .12, r * .36, r * .3, k.col, 1.2);
      c.beginPath(); c.moveTo(r * .05, r * .12); c.quadraticCurveTo(r * .45, r * .32, r * .9, r * .02); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
      E(c, r * .62, r * (.88 - l), r * .26, r * .14, dk, 1);
      whites(c, r, this.eyes);
    },
  },
  ...BOSS_DEF,
};

/* ---------- Task 5: Tiere (Spez. #33) ----------
   Krokodil, Gorilla, Adler und Büffel als normale Sticker wie Wolf und Bär (Glubschaugen, Umrisse O), dazu ein
   Halstuch in Teamfarbe (k.shield, wie der Ritterschild; darum je Team gebacken, TEAM_ACCENT). Der Elefant ist ein
   Boss-Sticker (#23, BOSS_VIS 1,3): Körper mit Beinen (Bild 0/1 = Schritt), Decke in Teamfarbe, Kopfgruppe am Hals
   (Drehpunkt ELE_GEO.head, nickt um headRot) mit Kopf und Stoßzähnen, Ohr (wedelt: pose.wing) und Rüssel (schwingt:
   pose.tailSwing, hebt sich beim Schlag und beim Trampeln); Augen in der Kopfgruppe. */
const TEAM_ACCENT = new Set(['krokodil', 'gorilla', 'adler', 'bueffel', 'elefant', 'lama']);
// Halstuch: dreieckiger Zipfel in Teamfarbe vom Knoten (x, y) aus, Richtung a (rad), Länge l (r-Einheiten)
function scarf(c, r, k, x, y, a, l) {
  const cx = Math.cos(a), sy = Math.sin(a), px = -sy, py = cx, w = l * .45;
  poly(c, r, [[x + px * w, y + py * w], [x + cx * l, y + sy * l], [x - px * w, y - py * w]], k.shield, 1.1);
  E(c, x * r, y * r, r * .11, r * .09, shade(k.shield, -.25), 1);
}
Object.assign(DEF, {
  // Krokodil: lang und flach, Schuppenzacken, lange Schnauze mit Zähnen, Augen oben auf Höckern
  krokodil: {
    eyes: eyePair(.95, -.42, .17),
    body(c, r, k, f) {
      const l = f ? .16 : -.16;
      for (const [x, s] of [[-.7, 1], [-.35, -1], [.3, 1], [.62, -1]]) Ln(c, [[x * r, r * .25], [(x + s * l) * r, r * .62]], k.dk, 2.6);
      poly(c, r, [[-.75, -.22], [-1.6, -.02], [-2.05, .16], [-1.55, .28], [-.75, .38]], k.col);
      E(c, -.05 * r, r * .08, r * 1.02, r * .44, k.col);
      E(c, r * .05, r * .3, r * .75, r * .14, '#c9d79a', 0);
      for (const x of [-1.3, -.95, -.6, -.3, 0, .3]) poly(c, r, [[x - .08, x < -.7 ? -.14 + (x + .7) * .1 : -.3], [x, x < -.7 ? -.3 + (x + .7) * .1 : -.46], [x + .08, x < -.7 ? -.14 + (x + .7) * .1 : -.3]], k.dk, 1);
      RR(c, r * .75, -r * .2, r * 1.15, r * .34, r * .15, k.col);
      E(c, r * .85, -r * .1, r * .38, r * .3, k.col, 0);
      c.beginPath(); c.moveTo(r * .8, r * .06); c.lineTo(r * 1.84, r * .06); c.lineWidth = 1; c.strokeStyle = O; c.stroke();
      for (const x of [1.05, 1.3, 1.55]) poly(c, r, [[x, .06], [x + .05, .17], [x + .1, .06]], '#fff', .6);
      E(c, r * 1.78, -r * .12, r * .05, r * .04, O, 0);
      for (const p of [this.eyes.L, this.eyes.R]) E(c, p[0] * r, p[1] * r + r * .08, r * .2, r * .16, k.col, 1.2);
      scarf(c, r, k, .5, -.1, 1.75, .5);
      whites(c, r, this.eyes);
    },
  },
  // Lama: wolliger heller Körper, langer Hals, Kopf mit Bananenohren, Decke in Teamfarbe
  lama: {
    eyes: eyePair(.82, -1.22, .15),
    body(c, r, k, f) {
      const l = f ? .14 : -.14;
      for (const [x, s] of [[-.6, 1], [-.3, -1], [.3, 1], [.58, -1]]) Ln(c, [[x * r, r * .3], [(x + s * l) * r, r * .98]], '#c9b79a', 2.2);
      E(c, -r * .82, -r * .1, r * .22, r * .2, k.col, 1.2);
      E(c, 0, r * .1, r * .95, r * .55, k.col);
      for (const x of [-.6, -.25, .1, .45]) E(c, x * r, -r * .32, r * .2, r * .14, k.col, 0);
      RR(c, -r * .45, -r * .2, r * .8, r * .42, r * .1, k.shield);
      Ln(c, [[r * .55, -r * .05], [r * .66, -r * 1.05]], k.col, 5.2);
      E(c, r * .82, -r * 1.2, r * .4, r * .3, k.col);
      poly(c, r, [[.6, -1.42], [.55, -1.78], [.7, -1.48]], k.col, 1.1); poly(c, r, [[.88, -1.45], [.92, -1.8], [1.0, -1.46]], k.col, 1.1);
      E(c, r * 1.14, -r * 1.08, r * .14, r * .1, '#d9c6a8', 1);
      whites(c, r, this.eyes);
    },
  },
  // Gorilla: massiger dunkler Körper, Scheitelkamm, helles Gesicht, lange Arme mit Knöcheln
  gorilla: {
    eyes: eyePair(.36, -.4, .19),
    body(c, r, k, f) {
      feet(c, r, k.dk, f);
      Ln(c, [[-r * .45, -r * .2], [-r * .85, r * .72]], shade(k.col, -.2), 3.8);
      E(c, -r * .86, r * .82, r * .22, r * .17, '#5d5866', 1.2);
      E(c, 0, -r * .78, r * .46, r * .3, k.col);
      E(c, 0, 0, r * 1.05, r * 1.0, k.col);
      E(c, -r * .05, r * .45, r * .48, r * .36, '#5d5866', 0);
      E(c, r * .38, -r * .24, r * .5, r * .44, '#8d8494');
      E(c, r * .52, r * .06, r * .3, r * .2, '#a79fae', 1.1);
      E(c, r * .45, r * .02, r * .05, r * .04, O, 0); E(c, r * .6, r * .02, r * .05, r * .04, O, 0);
      Ln(c, [[r * .02, -r * .56], [r * .7, -r * .58]], shade(k.col, -.35), 1.6, false);
      scarf(c, r, k, -.1, .55, 1.9, .45);
      whites(c, r, this.eyes);
      Ln(c, [[r * .62, r * .3], [r * 1.0, r * .78]], k.col, 4.2);
      E(c, r * 1.02, r * .86, r * .23, r * .18, '#5d5866', 1.2);
    },
  },
  // Adler: brauner Körper, weißer Kopf, gelber Hakenschnabel, gelbe Fänge; Bild 0 Flügel oben, Bild 1 unten
  adler: {
    eyes: eyePair(.72, -.46, .15),
    body(c, r, k, f) {
      const wing = (dx, col) => {
        if (!f) poly(c, r, [[dx - .3, -.15], [dx - 1.15, -1.3], [dx - .75, -1.02], [dx - .32, -1.3], [dx + .25, -.25]], col);
        else poly(c, r, [[dx - .3, -.05], [dx - 1.3, .55], [dx - .78, .5], [dx - .35, .8], [dx + .25, .1]], col);
      };
      wing(.25, shade(k.col, -.3));
      poly(c, r, [[-.75, -.08], [-1.45, -.3], [-1.55, .05], [-1.42, .26], [-.75, .25]], k.dk);
      Ln(c, [[-r * .15, r * .5], [-r * .2, r * .85]], '#e8b33a', 1.5); Ln(c, [[r * .12, r * .5], [r * .16, r * .85]], '#e8b33a', 1.5);
      E(c, -r * .1, r * .05, r * .9, r * .55, k.col);
      scarf(c, r, k, .3, -.05, 1.6, .5);
      wing(-.05, k.col);
      E(c, r * .7, -r * .42, r * .45, r * .4, '#f4f1ea');
      poly(c, r, [[1.05, -.5], [1.48, -.34], [1.34, -.04], [1.24, -.2], [1.06, -.2]], '#f2b933', 1.1);
      whites(c, r, this.eyes);
    },
  },
  // Büffel: dunkler Körper mit Buckel, zottiger Kopf, helle geschwungene Hörner
  bueffel: {
    eyes: eyePair(1.0, -.32, .15),
    body(c, r, k, f) {
      const l = f ? .18 : -.18;
      for (const [x, i] of [[-.75, 0], [-.4, 1], [.35, 0], [.7, 1]]) Ln(c, [[x * r, r * .45], [(x + (i ? l : -l)) * r, r * .95]], k.dk, 2.8);
      Ln(c, [[-r * 1.08, -r * .05], [-r * 1.35, r * .42]], k.dk, 1.6); E(c, -r * 1.36, r * .46, r * .08, r * .1, k.dk, .9);
      E(c, -r * .05, r * .12, r * 1.15, r * .64, k.col);
      E(c, r * .35, -r * .22, r * .6, r * .5, shade(k.col, -.18));
      E(c, r * .98, -r * .12, r * .42, r * .4, k.dk);
      E(c, r * 1.3, r * .06, r * .21, r * .17, '#8a7462', 1.1);
      E(c, r * 1.38, r * .02, r * .04, r * .035, O, 0);
      Ln(c, [[r * .84, -r * .42], [r * .62, -r * .72], [r * .78, -r * .98]], '#eadfc8', 2.2);
      Ln(c, [[r * 1.12, -r * .44], [r * 1.3, -r * .74], [r * 1.14, -r * .98]], '#eadfc8', 2.2);
      scarf(c, r, k, .62, .2, 1.65, .5);
      whites(c, r, this.eyes);
    },
  },
});

// Elefant (Boss-Sticker): Drehpunkte im Rig (r-Einheiten): Kopfgruppe am Hals; Rüssel und Ohr in der Kopfgruppe
export const ELE_GEO = { head: [.6, -.3], trunk: [.78, .06], ear: [.1, -.14] };
BOSS_GEO.elefant = ELE_GEO;
DEF.elefant = {
  boss: true, eyeGroup: 'head', eyes: eyePair(.5, -.14, .11),
  shadow: [1.25, .3, .98], ring: [1.4, .4, .95], pivot: [0, 1], top: -1.3, crown: -1.4, iconFit: [3.2, .28, .02],
  corpseBody: 'corpse',
  parts: {
    // Körper: ferne Beine (dunkler), Schwanz, Rumpf mit Falten, nahe Beine mit Zehennägeln; f = Schritt
    body: {
      frames: 2,
      draw(c, r, k, f) {
        const s = f ? .07 : -.07, leg = (x, col) => {
          RR(c, (x - .14) * r, r * .28, r * .28, r * .72, r * .1, col);
          for (let i = -1; i <= 1; i++) E(c, (x + i * .08) * r, r * .96, r * .045, r * .035, '#f3ead8', .7);
        };
        leg(-.55 - s, k.dk); leg(.42 + s, k.dk);
        Ln(c, [[-r * 1.02, -r * .05], [-r * 1.2, r * .48]], k.dk, 1.6); E(c, -r * 1.21, r * .52, r * .06, r * .09, O, 0);
        E(c, -r * .1, r * .05, r * 1.0, r * .62, k.col);
        c.strokeStyle = shade(k.col, -.25); c.lineWidth = 1;
        for (const x of [-.6, -.35]) { c.beginPath(); c.arc(x * r, r * .15, r * .22, -.9, .9); c.stroke(); }
        leg(-.3 + s, k.col); leg(.68 - s, k.col);
      },
    },
    // Decke in Teamfarbe auf dem Rücken, mit goldenem Saum und Fransen
    blanket: {
      team: true,
      draw(c, r, k) {
        poly(c, r, [[-.72, -.5], [.32, -.56], [.4, .12], [.0, .26], [-.7, .18]], k.shield, 1.3);
        Ln(c, [[-r * .66, r * .1], [-r * .02, r * .18], [r * .34, r * .06]], '#ffd25a', 1.4, false);
        c.strokeStyle = '#ffd25a'; c.lineWidth = .9; c.beginPath();
        // Fransen am unteren Rand (−0,7|0,18 → 0|0,26 → 0,4|0,12)
        for (let i = 0; i < 7; i++) { const x = -.64 + i * .14, y = x < 0 ? .18 + (x + .7) * .08 / .7 : .26 - x * .35; c.moveTo(x * r, y * r); c.lineTo(x * r, (y + .1) * r); }
        c.stroke();
        E(c, -r * .18, -r * .18, r * .1, r * .1, '#ffd25a', 1);
      },
    },
    // Kopf (Drehpunkt am Hals): Schädel mit Stirnbuckel, Mund, Stoßzähne, Augenweiß
    head: {
      draw(c, r, k) { this.base(c, r, k); whites(c, r, DEF.elefant.eyes); },
      base(c, r, k) {
        E(c, r * .36, -r * .02, r * .5, r * .48, k.col);
        E(c, r * .3, -r * .38, r * .3, r * .16, k.col, 0);
        c.beginPath(); c.moveTo(r * .5, r * .3); c.quadraticCurveTo(r * .62, r * .4, r * .72, r * .3); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
        c.beginPath(); c.moveTo(r * .62, r * .26); c.quadraticCurveTo(r * .95, r * .52, r * 1.08, r * .26);
        c.lineWidth = 4.4; c.strokeStyle = O; c.stroke(); c.lineWidth = 2.4; c.strokeStyle = '#f6f0e0'; c.stroke();
      },
    },
    // Rüssel (Drehpunkt am Ansatz, hängt nach unten, Spitze nach vorn eingerollt), mit Ringfalten
    trunk: {
      draw(c, r, k) {
        const P = [[0, 0], [.12, .38], [.08, .72], [.24, .88]], W = [.24, .19, .13];
        for (let i = 0; i < 3; i++) { c.lineWidth = W[i] * r + 2.4; c.strokeStyle = O; c.beginPath(); c.moveTo(P[i][0] * r, P[i][1] * r); c.lineTo(P[i + 1][0] * r, P[i + 1][1] * r); c.stroke(); }
        for (let i = 0; i < 3; i++) { c.lineWidth = W[i] * r; c.strokeStyle = k.col; c.beginPath(); c.moveTo(P[i][0] * r, P[i][1] * r); c.lineTo(P[i + 1][0] * r, P[i + 1][1] * r); c.stroke(); }
        c.strokeStyle = shade(k.col, -.3); c.lineWidth = .9; c.beginPath();
        for (const q of [.25, .45, .62]) { const y = q * r, x = (q < .4 ? q * .3 : .12 - (q - .4) * .12) * r; c.moveTo(x - r * .08, y); c.lineTo(x + r * .08, y + r * .02); }
        c.stroke();
        E(c, r * .25, r * .9, r * .07, r * .05, shade(k.col, -.3), .9);
      },
    },
    // Ohr (Drehpunkt am Ansatz): großer Lappen nach hinten unten, innen rosa
    ear: {
      draw(c, r, k) {
        c.beginPath(); c.moveTo(r * .05, -r * .3); c.quadraticCurveTo(-r * .45, -r * .55, -r * .6, -r * .05);
        c.quadraticCurveTo(-r * .62, r * .42, -r * .12, r * .48); c.quadraticCurveTo(r * .08, r * .2, r * .05, -r * .3); c.closePath();
        c.fillStyle = shade(k.col, -.06); c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
        E(c, -r * .27, r * .05, r * .22, r * .26, '#e2b3b0', 0, null, -.2);
      },
    },
    // liegende Leiche: ganze Figur (keine Pupillen)
    corpse: { team: true, draw(c, r, k) { DEF.elefant.compose(c, r, k, false); } },
  },
  compose(c, r, k, pupils) {
    const P = this.parts, G = ELE_GEO;
    P.body.draw(c, r, k, 0); P.blanket.draw(c, r, k);
    c.save(); c.translate(G.head[0] * r, G.head[1] * r);
    P.head.draw(c, r, k);
    c.save(); c.translate(G.ear[0] * r, G.ear[1] * r); P.ear.draw(c, r, k); c.restore();
    c.save(); c.translate(G.trunk[0] * r, G.trunk[1] * r); P.trunk.draw(c, r, k); c.restore();
    if (pupils) for (const p of [this.eyes.L, this.eyes.R]) pupil(c, r, this.eyes, p);
    c.restore();
  },
};

/* ---------- Schrottplatz und Urzeit (5. Kategorie, 18.11.) ----------
   Normale Sticker wie Wolf und Gorilla (Glubschaugen, Umrisse O), mit einem Akzent in Teamfarbe (k.shield: Streifen
   der Roboter, Fell, Stirnband, Rückenstreifen der Dinos); darum je Team gebacken (ERA_ACCENT). Bild 0/1 = Schritt
   (Räder, Beine) bzw. Flügel und Rotoren. Jungtiere und das Ei: pose.js verkleinert die Figur nach u.T.r. */
export const ERA_ACCENT = new Set(['minibot', 'laserbot', 'drohne', 'kuppel', 'spinne', 'schweisser', 'magnet', 'tesla', 'mega',
  'hoehle', 'speer', 'schamane', 'raptor', 'ptera', 'anky', 'trike', 'rex', 'rexei']);
const METAL_DK = '#4a4552', SKIN = '#f2c9a0', HAIR = '#5a4334', WOOD = '#8a5a33';
// Rad mit Speiche (Bild f dreht die Speiche)
function wheel(c, r, x, y, s, f) {
  E(c, x * r, y * r, s * r, s * r, METAL_DK, 1.2);
  const a = f ? .8 : -.2; Ln(c, [[(x - Math.cos(a) * s * .7) * r, (y - Math.sin(a) * s * .7) * r], [(x + Math.cos(a) * s * .7) * r, (y + Math.sin(a) * s * .7) * r]], '#8d929c', 1, false);
}
// Bein eines Dinos: Oberschenkel von (x, y) nach unten, Schritt l (r-Einheiten), Fuß mit Krallen
function dinoLeg(c, r, x, y, l, col, w = 3) {
  Ln(c, [[x * r, y * r], [(x + l) * r, (y + .45) * r], [(x + l * .5) * r, (y + .75) * r]], col, w);
}
// Mensch der Urzeit: Körper, Lendenschurz (Teamfarbe), Haar
function caveman(c, r, k, f, hair = HAIR) {
  feet(c, r, '#c99a72', f);
  E(c, 0, r * .05, r * .82, r * .9, k.col);
  poly(c, r, [[-.8, .25], [.8, .25], [.7, .75], [.3, .6], [0, .8], [-.35, .6], [-.72, .78]], k.shield, 1.2);
  c.beginPath(); c.moveTo(-r * .78, -r * .2); c.quadraticCurveTo(-r * .7, -r * 1.05, r * .1, -r * .95);
  c.quadraticCurveTo(r * .7, -r * .95, r * .78, -r * .45); c.quadraticCurveTo(r * .4, -r * .62, r * .2, -r * .5);
  c.quadraticCurveTo(-r * .1, -r * .7, -r * .35, -r * .45); c.quadraticCurveTo(-r * .6, -r * .5, -r * .78, -r * .2);
  c.closePath(); c.fillStyle = hair; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke();
  E(c, r * .62, r * .02, r * .08, r * .06, '#c99a72', 0);
}
Object.assign(DEF, {
  // Minibot: Kasten auf zwei Rädern, Antenne mit Lämpchen, Streifen in Teamfarbe
  minibot: {
    eyes: eyePair(.18, -.22, .23),
    body(c, r, k, f) {
      wheel(c, r, -.42, .78, .27, f); wheel(c, r, .42, .78, .27, !f);
      Ln(c, [[0, -r * .7], [r * .12, -r * 1.2]], METAL_DK, 1.2);
      E(c, r * .12, -r * 1.27, r * .14, r * .14, k.shield, 1.1);
      RR(c, -r * .78, -r * .72, r * 1.56, r * 1.3, r * .25, k.col);
      RR(c, -r * .78, r * .25, r * 1.56, r * .2, r * .06, k.shield);
      Ln(c, [[-r * .5, r * .05], [-r * .2, r * .05]], shade(k.col, -.35), 1, false);
      whites(c, r, this.eyes);
    },
  },
  // Laserbot: runder Kopf auf drei Beinen, Laserrohr mit roter Linse
  laserbot: {
    eyes: eyePair(-.05, -.25, .2),
    body(c, r, k, f) {
      const l = f ? .12 : -.12;
      for (const [x, d] of [[-.35, -.35], [0, l], [.35, .35]]) Ln(c, [[x * r, r * .4], [(x + d) * r, r * 1.0]], METAL_DK, 1.8);
      RR(c, r * .5, -r * .32, r * .95, r * .32, r * .1, '#6b7280');
      E(c, r * 1.48, -r * .16, r * .13, r * .13, '#ff4d4d', 1.1);
      E(c, 0, -r * .05, r * .82, r * .72, k.col);
      Ln(c, [[-r * .72, r * .3], [r * .72, r * .3]], k.shield, 3);
      whites(c, r, this.eyes);
    },
  },
  // Schrauber-Drohne: gelber Rumpf, zwei Rotoren (Bild 0/1: Blätter), Schraubenschlüssel unten
  drohne: {
    eyes: eyePair(.25, -.08, .2),
    body(c, r, k, f) {
      Ln(c, [[0, r * .5], [0, r * .95]], '#9aa3b5', 1.6);
      E(c, 0, r * 1.05, r * .16, r * .16, null, 2.2, '#9aa3b5');
      for (const s of [-1, 1]) {
        Ln(c, [[s * r * .55, -r * .2], [s * r * .95, -r * .72]], METAL_DK, 1.4);
        const w = f ? .55 : .3;
        Ln(c, [[(s * .95 - w) * r, -r * .78], [(s * .95 + w) * r, -r * .78]], '#6b7280', 1.6);
      }
      E(c, 0, 0, r * 1.0, r * .6, k.col);
      Ln(c, [[-r * .85, r * .25], [r * .85, r * .25]], k.shield, 3);
      whites(c, r, this.eyes);
    },
  },
  // Schildkuppel: Kettenfahrzeug mit Kuppel-Projektor (blaue Halbkugel) obendrauf
  kuppel: {
    eyes: eyePair(.12, .2, .18),
    body(c, r, k, f) {
      RR(c, -r * .95, r * .55, r * 1.9, r * .42, r * .2, METAL_DK);
      for (let i = -1; i <= 1; i++) E(c, (i * .55 + (f ? .08 : 0)) * r, r * .76, r * .12, r * .12, '#8d929c', 1);
      RR(c, -r * .8, -r * .25, r * 1.6, r * .85, r * .2, k.col);
      RR(c, -r * .8, r * .38, r * 1.6, r * .16, r * .05, k.shield);
      c.beginPath(); c.arc(0, -r * .25, r * .55, Math.PI, 0); c.closePath(); c.fillStyle = '#9db8ff'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = O; c.stroke();
      E(c, -r * .18, -r * .52, r * .14, r * .09, '#e4ecff', 0, null, -.5);
      whites(c, r, this.eyes);
    },
  },
  // Springspinne: dunkler Leib, Kopf vorn, vier Beine je Seite (Bild 0/1: Schritt), rote Sensoren
  spinne: {
    eyes: eyePair(.82, -.22, .17),
    body(c, r, k, f) {
      const l = f ? .14 : -.14;
      for (const [x, s, i] of [[-.45, -1, 0], [-.15, -1, 1], [.15, 1, 0], [.45, 1, 1]]) {
        const d = i ? l : -l;
        Ln(c, [[x * r, 0], [(x + s * .35) * r, -r * .55], [(x + s * .55 + d) * r, r * .9]], METAL_DK, 1.8);
      }
      E(c, -r * .15, r * .05, r * .85, r * .58, '#4a4552');
      Ln(c, [[-r * .75, -r * .05], [r * .4, -r * .05]], k.shield, 2.6);
      E(c, r * .78, -r * .1, r * .45, r * .4, '#5d5866');
      E(c, r * 1.1, r * .12, r * .06, r * .06, '#ff4d4d', 0); E(c, r * .95, r * .2, r * .05, r * .05, '#ff4d4d', 0);
      whites(c, r, this.eyes);
    },
  },
  // Schweißer: gelber Kasten mit dunklem Visier, Arm mit Brenner und Flämmchen, Räder
  schweisser: {
    eyes: eyePair(.05, -.47, .18),
    body(c, r, k, f) {
      wheel(c, r, -.42, .82, .22, f); wheel(c, r, .42, .82, .22, !f);
      Ln(c, [[r * .6, r * .1], [r * 1.25, r * .1]], METAL_DK, 2.4);
      poly(c, r, [[1.25, .02], [1.62, -.12 + (f ? .05 : 0)], [1.5, .1], [1.66, .26], [1.25, .18]], '#ffb03a', 1);
      RR(c, -r * .75, -r * .88, r * 1.5, r * 1.6, r * .25, k.col);
      RR(c, -r * .62, -r * .78, r * 1.24, r * .6, r * .15, '#4a4552');
      RR(c, -r * .75, r * .32, r * 1.5, r * .18, r * .05, k.shield);
      whites(c, r, this.eyes);
    },
  },
  // Magnet-Mech: wuchtiger Rumpf auf kurzen Beinen, roter Hufeisenmagnet als Arm
  magnet: {
    eyes: eyePair(-.2, -.35, .19),
    body(c, r, k, f) {
      const s = f ? .1 : -.1;
      RR(c, (-.65 + s) * r, r * .45, r * .42, r * .55, r * .1, METAL_DK); RR(c, (.15 - s) * r, r * .45, r * .42, r * .55, r * .1, METAL_DK);
      RR(c, -r * .95, -r * .82, r * 1.6, r * 1.4, r * .3, k.col);
      RR(c, -r * .95, r * .2, r * 1.6, r * .18, r * .05, k.shield);
      c.lineCap = 'butt';
      c.beginPath(); c.arc(r * .95, -r * .1, r * .42, -Math.PI / 2, Math.PI / 2);
      c.lineWidth = r * .32 + 2.4; c.strokeStyle = O; c.stroke(); c.lineWidth = r * .32; c.strokeStyle = '#d8433b'; c.stroke();
      c.lineCap = 'round';
      RR(c, r * .62, -r * .68, r * .32, r * .3, r * .05, '#e6e9ef'); RR(c, r * .62, r * .2, r * .32, r * .3, r * .05, '#e6e9ef');
      whites(c, r, this.eyes);
    },
  },
  // Teslaspule: Sockel in Teamfarbe, Spule mit Windungen, Kugel mit Augen, Funken (Bild 0/1)
  tesla: {
    eyes: eyePair(0, -1.18, .17),
    body(c, r, k, f) {
      RR(c, -r * .75, r * .55, r * 1.5, r * .45, r * .12, k.shield);
      RR(c, -r * .32, -r * .85, r * .64, r * 1.45, r * .1, '#c9a27a');
      c.strokeStyle = '#8a5a33'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < 5; i++) { const y = (-.7 + i * .27) * r; c.moveTo(-r * .32, y); c.lineTo(r * .32, y + r * .08); }
      c.stroke();
      E(c, 0, -r * 1.15, r * .55, r * .5, '#c9ced8');
      const s = f ? 1 : -1;
      Ln(c, [[r * .5 * s, -r * 1.45], [r * .85 * s, -r * 1.6], [r * .7 * s, -r * 1.3], [r * 1.05 * s, -r * 1.35]], '#7e9dff', 1.2, false);
      whites(c, r, this.eyes);
    },
  },
  // Mega-Mech: großer Rumpf mit Cockpitscheibe, Schulterpanzer in Teamfarbe, schwere Beine
  mega: {
    eyes: eyePair(.12, -.55, .12),
    body(c, r, k, f) {
      const s = f ? .08 : -.08;
      RR(c, (-.62 + s) * r, r * .25, r * .42, r * .78, r * .1, METAL_DK); RR(c, (.2 - s) * r, r * .25, r * .42, r * .78, r * .1, METAL_DK);
      RR(c, -r * .95, -r * .95, r * 1.9, r * 1.35, r * .25, k.col);
      RR(c, -r * 1.35, -r * .88, r * .42, r * .95, r * .15, k.shield); RR(c, r * .93, -r * .88, r * .42, r * .95, r * .15, k.shield);
      RR(c, -r * .3, -r * .78, r * .85, r * .45, r * .12, '#bfe3f6');
      c.strokeStyle = shade(k.col, -.35); c.lineWidth = 1.1; c.beginPath();
      for (let i = 0; i < 4; i++) { c.moveTo((-.45 + i * .3) * r, r * .0); c.lineTo((-.45 + i * .3) * r, r * .25); }
      c.stroke();
      whites(c, r, this.eyes);
    },
  },
  // Höhlenmensch: Fellschurz in Teamfarbe, Keule mit Fackelflamme
  hoehle: {
    eyes: eyePair(.25, -.22, .19),
    body(c, r, k, f) {
      caveman(c, r, k, f);
      Ln(c, [[r * .55, r * .3], [r * 1.12, -r * .55]], WOOD, 3);
      E(c, r * 1.18, -r * .66, r * .22, r * .3, WOOD, 1.2, O, .5);
      poly(c, r, [[1.02, -.88], [1.2, -1.35], [1.27, -1.0], [1.4, -1.22], [1.36, -.84]], '#ff8a3d', 1);
      whites(c, r, this.eyes);
    },
  },
  // Speerwerfer: Stirnband in Teamfarbe, langer Speer mit Steinspitze
  speer: {
    eyes: eyePair(.25, -.22, .19),
    body(c, r, k, f) {
      Ln(c, [[-r * .7, r * .8], [r * 1.35, -r * 1.05]], WOOD, 2);
      poly(c, r, [[1.3, -1.0], [1.62, -1.32], [1.42, -.92]], '#9aa3b5', 1.1);
      caveman(c, r, k, f);
      Ln(c, [[-r * .76, -r * .42], [r * .76, -r * .42]], k.shield, 2.4);
      whites(c, r, this.eyes);
    },
  },
  // Schamanin: Federkrone, Stab mit grüner Kugel, Kräuterrauch
  schamane: {
    eyes: eyePair(.25, -.2, .19),
    body(c, r, k, f) {
      Ln(c, [[r * .95, -r * 1.0], [r * .95, r * .95]], WOOD, 2);
      E(c, r * .95, -r * 1.1, r * .2, r * .2, '#4fc07a', 1.2);
      for (const [x, y, s] of [[-1.25, -.9, .2], [-1.05, -1.2, .16], [-1.4, -1.25, .12]]) E(c, x * r, y * r, s * r, s * r, 'rgba(168,216,106,.7)', 0);
      caveman(c, r, k, f, '#7a5236');
      for (const [x, col] of [[-.45, '#d8433b'], [-.15, '#ffd84d'], [.15, '#4fc07a'], [.45, '#d8433b']]) poly(c, r, [[x - .1, -.72], [x, -1.32], [x + .1, -.72]], col, 1);
      whites(c, r, this.eyes);
    },
  },
  // Raptor: schlanker grüner Körper, langer Schwanz, Kopf mit Zähnen, Rückenstreifen in Teamfarbe
  raptor: {
    eyes: eyePair(.95, -.5, .14),
    body(c, r, k, f) {
      const l = f ? .2 : -.2;
      dinoLeg(c, r, -.2, .2, l, k.dk); dinoLeg(c, r, .15, .2, -l, k.col);
      poly(c, r, [[-.45, -.25], [-1.6, -.55], [-1.75, -.42], [-.45, .25]], k.col);
      E(c, 0, 0, r * .75, r * .48, k.col);
      Ln(c, [[-r * .6, -r * .28], [r * .4, -r * .38]], k.shield, 2.6, false);
      poly(c, r, [[.45, -.3], [.75, -.75], [1.45, -.7], [1.5, -.42], [.9, -.3]], k.col);
      for (const x of [1.05, 1.22, 1.38]) poly(c, r, [[x, -.42], [x + .05, -.33], [x + .1, -.43]], '#fff', .6);
      Ln(c, [[r * .55, r * .1], [r * .8, r * .25]], k.dk, 1.6);
      whites(c, r, this.eyes);
    },
  },
  // Flugsaurier: breite Hautflügel (Bild 0 oben, 1 unten), Kopfkamm, Stein in den Krallen
  ptera: {
    eyes: eyePair(.82, -.38, .13),
    body(c, r, k, f) {
      const wing = s => {
        if (!f) poly(c, r, [[-.1, -.1], [s * 1.7 - .1, -1.0], [s * 1.2, -.5], [s * .6, -.35], [.25 * s, .05]], s < 0 ? k.dk : k.col);
        else poly(c, r, [[-.1, 0], [s * 1.75 - .1, .55], [s * 1.25, .35], [s * .6, .45], [.25 * s, .1]], s < 0 ? k.dk : k.col);
      };
      wing(-1);
      E(c, 0, r * .55, r * .2, r * .17, '#9aa3b5', 1.1);
      E(c, 0, 0, r * .55, r * .38, k.col);
      Ln(c, [[-r * .4, -r * .05], [r * .35, -r * .05]], k.shield, 2.4, false);
      poly(c, r, [[.4, -.25], [.6, -.6], [.95, -.62], [1.6, -.3], [1.0, -.18]], k.col);
      poly(c, r, [[.6, -.58], [.3, -1.0], [.8, -.62]], k.dk, 1);
      wing(1);
      whites(c, r, this.eyes);
    },
  },
  // Ankylosaurus: breiter Panzer mit Stacheln, Keulenschwanz, kleiner Kopf
  anky: {
    eyes: eyePair(1.12, -.02, .12),
    body(c, r, k, f) {
      const l = f ? .1 : -.1;
      for (const [x, i] of [[-.55, 0], [-.2, 1], [.3, 0], [.6, 1]]) RR(c, (x + (i ? l : -l)) * r - r * .1, r * .3, r * .2, r * .55, r * .06, k.dk);
      Ln(c, [[-r * .95, r * .05], [-r * 1.4, -r * .15]], k.col, 2.6);
      E(c, -r * 1.48, -r * .2, r * .22, r * .18, shade(k.col, -.2), 1.2);
      E(c, 0, 0, r * 1.05, r * .55, k.col);
      for (const x of [-.65, -.3, .05, .4]) poly(c, r, [[x - .1, -.42], [x, -.72], [x + .1, -.42]], '#e3d4b2', 1);
      Ln(c, [[-r * .9, r * .22], [r * .9, r * .22]], k.shield, 2.6, false);
      E(c, r * 1.1, r * .05, r * .32, r * .26, k.col);
      E(c, r * 1.35, r * .12, r * .04, r * .03, O, 0);
      whites(c, r, this.eyes);
    },
  },
  // Triceratops: Körper, Nackenschild, drei Hörner
  trike: {
    eyes: eyePair(.92, -.05, .13),
    body(c, r, k, f) {
      const l = f ? .12 : -.12;
      for (const [x, i] of [[-.6, 0], [-.25, 1], [.2, 0], [.5, 1]]) RR(c, (x + (i ? l : -l)) * r - r * .11, r * .3, r * .22, r * .55, r * .06, k.dk);
      poly(c, r, [[-.8, -.1], [-1.35, .05], [-.8, .25]], k.col);
      E(c, -r * .15, 0, r * .95, r * .6, k.col);
      Ln(c, [[-r * .85, -r * .1], [r * .3, -r * .35]], k.shield, 2.6, false);
      poly(c, r, [[.45, -.8], [.75, -.95], [.95, -.65], [.8, .25], [.45, .1]], '#d97c4f');
      E(c, r * .95, r * .05, r * .42, r * .36, k.col);
      Ln(c, [[r * .95, -r * .2], [r * 1.55, -r * .55]], '#f3ead8', 1.8); Ln(c, [[r * 1.1, -r * .12], [r * 1.7, -r * .35]], '#f3ead8', 1.8);
      Ln(c, [[r * 1.3, r * .12], [r * 1.5, r * .05]], '#f3ead8', 1.4);
      whites(c, r, this.eyes);
    },
  },
  // T-Rex: großer Kopf mit Zähnen, kleine Ärmchen, kräftige Beine, Schwanz nach hinten
  rex: {
    eyes: eyePair(.82, -.88, .11),
    body(c, r, k, f) {
      const l = f ? .18 : -.18;
      dinoLeg(c, r, -.3, .25, l, k.dk, 4.5);
      poly(c, r, [[-.5, -.35], [-1.6, .15], [-1.7, .3], [-.5, .35]], k.col);
      E(c, -r * .1, r * .05, r * .72, r * .62, k.col);
      Ln(c, [[-r * .7, -r * .25], [r * .35, -r * .5]], k.shield, 3.2, false);
      dinoLeg(c, r, .05, .3, -l, k.col, 4.5);
      poly(c, r, [[.25, -.45], [.3, -1.0], [.7, -1.15], [1.5, -1.05], [1.55, -.75], [.95, -.62], [1.45, -.55], [1.35, -.38], [.6, -.3]], k.col);
      for (const x of [.95, 1.1, 1.25, 1.4]) poly(c, r, [[x, -.75], [x + .05, -.65], [x + .1, -.75]], '#fff', .6);
      Ln(c, [[r * .45, -r * .2], [r * .7, -r * .05]], k.col, 1.6); Ln(c, [[r * .4, -r * .1], [r * .6, r * .05]], k.dk, 1.4);
      whites(c, r, this.eyes);
    },
  },
  // Dino-Ei: getupftes Ei mit Riss, die Augen schauen schon heraus
  rexei: {
    eyes: eyePair(0, -.18, .22),
    body(c, r, k, f) {
      E(c, 0, r * .05, r * .82, r * 1.0, k.col);
      for (const [x, y, s] of [[-.45, .35, .14], [.4, .5, .11], [.35, -.65, .1], [-.3, -.6, .08]]) E(c, x * r, y * r, s * r, s * r, k.shield, 0);
      Ln(c, [[-r * .78, r * .15], [-r * .45, -r * .02], [-r * .2, r * .2], [r * .1, -r * .02], [r * .4, r * .18], [r * .78, 0]], O, .2, false);
      c.strokeStyle = O; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-r * .78, r * .15); c.lineTo(-r * .45, -r * .02 + (f ? .03 * r : 0)); c.lineTo(-r * .2, r * .2);
      c.lineTo(r * .1, -r * .02); c.lineTo(r * .4, r * .18); c.lineTo(r * .78, 0); c.stroke();
      whites(c, r, this.eyes);
    },
  },
});

// Varianten: 0 = neutral (Sandkasten), 1..4 = Teams. Teamabhängig gezeichnet werden nur Typen,
// deren Körper die Teamfarbe trägt (TINT), der Ritter (Schild in Teamfarbe) und der Ghul (Lumpen in Teamfarbe, k.shield).
export const TEAM_KEYS = ['', 'blau', 'rot', 'gruen', 'gelb'];
export const TEAM_INDEX = { blau: 1, rot: 2, gruen: 3, gelb: 4 };
// Task 6: Kreaturen mit Akzent in Teamfarbe (k.shield) und ihr neutraler Akzent im Sandkasten
export const T6_ACCENT = { troll: '#8a6a4a', zyklop: '#8a6a4a', hexe: '#3d8f5a', phoenix: '#ffd84d', einhorn: '#9b6be0' };
const teamed = t => TINT.has(t) || t === 'ritter' || t === 'ghul' || T6_ACCENT[t] !== undefined || TEAM_ACCENT.has(t) || ERA_ACCENT.has(t);   // Task 5: Halstuch, Decke

function colors(t, vi) {
  const tc = vi ? TEAMS[TEAM_KEYS[vi]].body : null;
  const col = tc && TINT.has(t) ? tc : U[t].col;
  return { col, dk: shade(col, -.3), shield: tc || (t === 'ghul' ? '#8a7a64' : T6_ACCENT[t] || '#3f6fcf') };
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
const EXTRA_PARTS = ['shield'];
const extraNames = t => (DEF[t].parts ? [] : EXTRA_PARTS.filter(n => DEF[t][n]));
// Angstteile (Spez. #27): Brauen für normale Figuren mit Augen; Bosse zeigen nur kleine Pupillen und den Tropfen
const FEAR_PARTS = ['brow'];
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

// Symbolbild (data-URL) für Palette, Zählerliste und Charakterkarten: das Rig in Ruhepose (Pupillen leicht nach
// vorn unten), mit denselben Zeichenfunktionen wie der Rig-Atlas. px: Kantenlänge (Layout in 96er-Einheiten,
// skaliert), vi: Teamvariante wie im Atlas (0 = Grundfarbe, sonst TEAM_KEYS-Index).
export function iconURL(t,px=96,vi=0){
  const c=document.createElement('canvas');c.width=c.height=px;const x=c.getContext('2d'),k=px/96;
  x.setTransform(k,0,0,k,0,0);
  if(U[t]&&DEF[t].boss){
    // Boss-Sticker: ganze Figur in Ruhepose, auf die Breite iconFit[0] (r-Einheiten) eingepasst
    const D=DEF[t],r=drawR(t),f=D.iconFit,s=84/(f[0]*r);
    x.setTransform(s*k,0,0,s*k,(48-f[1]*r*s)*k,(52-f[2]*r*s)*k);x.lineCap='round';x.lineJoin='round';
    D.compose(x,r,colors(t,vi),true);
  }
  else if(U[t]){
    const r=U[t].r,s=Math.min(42/(r*2.3),4.4),D=DEF[t];
    const at=(tx,ty)=>{x.setTransform(s*k,0,0,s*k,44*k,52*k);if(U[t].fly)x.translate(0,-r*.3);x.translate(tx,ty);};
    at(0,0);drawPart(x,t,'body',vi,0);
    if(D.eyes)for(const p of[D.eyes.L,D.eyes.R]){at(p[0]*r+D.eyes.s*r*.35,p[1]*r+D.eyes.s*r*.15);drawPart(x,t,'pupilL',0,0);}
    at(0,0);if(D.headgear)drawPart(x,t,'headgear',vi,0);
    // Römer: Speer in der Hand, Schild vor dem Körper (wie im Block)
    if(D.shield){drawPart(x,t,'weapon',vi,1);at(SHIELD_FRONT[0]*r,SHIELD_FRONT[1]*r);drawPart(x,t,'shield',vi,0);}
    else if(D.weapon)drawPart(x,t,'weapon',vi,0);
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
