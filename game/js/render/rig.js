// Figuren aus Teilen: die Zeichnungen der alten Datei (paint() aus kritzelschlacht.html) pro Typ
// aufgeteilt in Körper (mit Augenweiß), Pupillen, Lid, Kopfbedeckung und Waffe. bakeRigTextures backt
// alle Teile in gemeinsame Atlas-Seiten (ein Draw-Call für viele Einheiten); die reine Pose kommt aus
// pose.js (poseUnit, RIG_PARTS) und wird hier nur weitergereicht.
//
// Koordinaten der Teile: Welt-Einheiten relativ zum Einheiten-Ursprung (u.x, u.y), nicht gespiegelt
// (Blick nach rechts). Spiegeln, Neigen und Quetschen macht der Renderer am Container.
/* global PIXI */
import { UNITS, TEAMS, TINT } from '../data.js';
import { RIG_PARTS } from './pose.js';
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

/* ---------- Teile pro Typ ----------
   body(c,r,k,f)       Körper mit Augenweiß; f = Bild 0/1 (Füße, Beine, Flügel, Ketten, Heckrotor)
   eyes                Augen für Pupillen und Lid (fehlt: keine Pupillen)
   lid(c,r,e)          eigenes Lid statt des Standardlids; lid:false = kein Lid
   headgear(c,r,k,f)   Kopfbedeckung; hgFrames:2 = zwei Bilder (Hauptrotor)
   weapon              {draw(c,r,k), grip:[x,y] Drehpunkt in r, axis: Richtung des Rückstoßes (rad), swing: Anteil am Schwung}
   k = {col, dk, shield} der Variante (neutral oder Team). */
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
  drache: {
    eyes: eyePair(.95, -.55, .15),
    body(c, r, k, f) {
      const wy = f ? -r * 1.3 : -r * .75;
      c.beginPath(); c.moveTo(-r * .5, -r * .1); c.lineTo(-r * 1.05, wy); c.quadraticCurveTo(-r * .5, wy * .55, -r * .15, wy * .95); c.quadraticCurveTo(0, wy * .45, r * .3, wy * .9); c.lineTo(r * .3, -r * .2); c.closePath();
      c.fillStyle = k.dk; c.fill(); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke();
      Ln(c, [[-r * .85, r * .25], [-r * 1.35, r * .45], [-r * 1.75, r * .1]], k.col, 4.5);
      E(c, 0, r * .15, r * 1.05, r * .72, k.col);
      E(c, r * .15, r * .35, r * .6, r * .33, '#c4ecdd', 0);
      c.beginPath(); c.moveTo(r * .85, -r * .8); c.lineTo(r * .75, -r * 1.25); c.lineTo(r * 1.05, -r * .88); c.closePath(); c.fillStyle = '#f3e2b0'; c.fill(); c.lineWidth = 1.1; c.strokeStyle = O; c.stroke();
      c.beginPath(); c.moveTo(r * 1.15, -r * .8); c.lineTo(r * 1.2, -r * 1.22); c.lineTo(r * 1.38, -r * .82); c.closePath(); c.fill(); c.stroke();
      E(c, r * 1.0, -r * .42, r * .6, r * .46, k.col);
      E(c, r * 1.48, -r * .32, r * .3, r * .22, k.col, 1.2);
      whites(c, r, this.eyes);
      E(c, r * 1.66, -r * .38, r * .05, r * .04, O, 0);
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
  panzer: {
    eyes: eyePair(.22, -.5, .14),
    body(c, r, k, f) {
      const w = f ? r * .05 : 0;
      RR(c, -r * 1.3, r * .18, r * 2.6, r * .55, r * .27, '#3a3d45');
      for (let i = -3; i <= 3; i++) E(c, i * r * .34 + w, r * .46, r * .13, r * .13, '#7b808a', 1);
      RR(c, -r * 1.15, -r * .2, r * 2.3, r * .5, r * .12, k.col);
      E(c, -r * .05, -r * .5, r * .62, r * .38, k.col);
      E(c, -r * .25, -r * .84, r * .22, r * .08, k.dk, 1);
      whites(c, r, this.eyes);
    },
    // Kanonenrohr: Rückstoß schiebt es in den Turm
    weapon: {
      grip: [.5, -.55], axis: Math.atan2(-.05, 1.3), swing: 0,
      draw(c, r, k) { Ln(c, [[r * .5, -r * .55], [r * 1.8, -r * .6]], k.dk, 3.4); },
    },
  },
  heli: {
    eyes: eyePair(.52, -.06, .12),
    lidCol: '#bfe3f2',
    body(c, r, k, f) {
      Ln(c, [[-r * .6, -r * .1], [-r * 1.7, -r * .35]], k.col, 3.4);
      E(c, -r * 1.75, -r * .38, r * .08, f ? r * .42 : r * .16, '#cfd5dd', 1);
      Ln(c, [[-r * .75, r * .78], [r * .8, r * .78]], '#2f3340', 1.6, false);
      Ln(c, [[-r * .4, r * .45], [-r * .45, r * .78]], '#2f3340', 1.4, false); Ln(c, [[r * .4, r * .45], [r * .45, r * .78]], '#2f3340', 1.4, false);
      E(c, 0, 0, r * .98, r * .64, k.col);
      E(c, r * .5, -r * .08, r * .4, r * .32, '#bfe3f2', 1.2);
      whites(c, r, this.eyes);
      Ln(c, [[0, -r * .6], [0, -r * .86]], '#2f3340', 1.6, false);
    },
    // Hauptrotor: zwei Bilder
    hgFrames: 2,
    headgear(c, r, k, f) {
      E(c, 0, -r * .9, r * 1.85, r * .16, 'rgba(60,60,70,.12)', 0);
      if (f) Ln(c, [[-r * 1.85, -r * .9], [r * 1.85, -r * .9]], '#2f3340', 1.6, false); else Ln(c, [[-r * .6, -r * 1.02], [r * .6, -r * .78]], '#2f3340', 1.6, false);
    },
    // neu: Bordkanone unter der Nase
    weapon: {
      grip: [.35, .56], axis: 0, swing: 0,
      draw(c, r) { Ln(c, [[r * .35, r * .56], [r * 1.1, r * .58]], '#2f3340', 1.6); },
    },
  },
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

// Zeichnet ein Teil in Variante vi, Bild f (Ursprung = Einheit bzw. Drehpunkt bei Pupillen).
function drawPart(c, t, part, vi, f) {
  const D = DEF[t], r = U[t].r, k = colors(t, vi);
  c.lineCap = 'round'; c.lineJoin = 'round';
  switch (part) {
    case 'shadow':
      E(c, 0, r * 1.05, r * .85, r * .28, 'rgba(40,40,70,.13)', 0);
      if (vi) E(c, 0, r * 1.0, r * 1.12, r * .42, null, 3, TEAMS[TEAM_KEYS[vi]].c);
      break;
    case 'body': D.body(c, r, k, f); break;
    case 'pupilL': case 'pupilR': E(c, 0, 0, D.eyes.prx * r, D.eyes.pry * r, O, 0); break;
    case 'lid': if (D.lid) D.lid(c, r, D.eyes); else drawLid(c, r, D.eyes); break;
    case 'headgear': D.headgear(c, r, k, f); break;
    case 'weapon': D.weapon.draw(c, r, k); break;
  }
}

// Welche Teile ein Typ hat, wie viele Varianten und Bilder; Drehpunkt in Welt-Einheiten
function partSpec(t, part) {
  const D = DEF[t], r = U[t].r, tv = teamed(t) ? 5 : 1;
  switch (part) {
    case 'shadow': return { nv: 5, nf: 1, scanV: 1, pivot: [0, 0] };
    case 'body': return { nv: tv, nf: D.frames || 2, scanV: 0, pivot: [0, 0] };
    case 'pupilL': case 'pupilR': return D.eyes ? { nv: 1, nf: 1, scanV: 0, pivot: [0, 0] } : null;
    case 'lid': return D.eyes && D.lid !== false ? { nv: 1, nf: 1, scanV: 0, pivot: [0, 0] } : null;
    case 'headgear': return D.headgear ? { nv: tv, nf: D.hgFrames || 1, scanV: 0, pivot: [0, 0] } : null;
    case 'weapon': return D.weapon ? { nv: tv, nf: 1, scanV: 0, pivot: [D.weapon.grip[0] * r, D.weapon.grip[1] * r] } : null;
  }
  return null;
}

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
     r, fly, teamed, pivotY (Quetsch-Drehpunkt: Füße bzw. Mitte), offY (alter Flieger-Versatz; der Renderer
     zeichnet Flieger seit der Höhenachse bei y − z und nutzt offY nicht mehr) }
   Die Map trägt zusätzlich resolution und destroy(). renderer bleibt für die Schnittstelle erhalten. */
// eslint-disable-next-line no-unused-vars
export function bakeRigTextures(renderer, resolution) {
  const t0 = performance.now(), res = resolution, atlas = createAtlas();
  let maxPx = 0;
  for (const t in U) maxPx = Math.max(maxPx, Math.ceil(spriteSize(U[t].r) * res));
  const scv = document.createElement('canvas'); scv.width = scv.height = maxPx;
  const sc = scv.getContext('2d', { willReadFrequently: true });
  const paintScratch = (spx, t, part, vi, f) => {
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, spx, spx);
    sc.setTransform(res, 0, 0, res, spx / 2, spx / 2);
    drawPart(sc, t, part, vi, f);
  };

  const rigs = new Map();
  for (const t in U) {
    const T = U[t], D = DEF[t], r = T.r, spx = Math.ceil(spriteSize(r) * res);
    const lidTint = [0, 1, 2, 3, 4].map(vi => hexNum(D.lidCol || colors(t, vi).col));
    const rig = {
      type: t, r, fly: !!T.fly, teamed: teamed(t), anchors: {}, tex: {}, lidTint,
      eyes: D.eyes ? { L: [D.eyes.L[0] * r, D.eyes.L[1] * r], R: [D.eyes.R[0] * r, D.eyes.R[1] * r] } : null,
      eyeR: D.eyes ? D.eyes.s * r : 0,
      axis: D.weapon ? D.weapon.axis : 0, swing: D.weapon ? D.weapon.swing : 0,
      pivotY: T.fly ? 0 : r, offY: T.fly ? -r * .5 : 0,
    };
    for (const part of RIG_PARTS) {
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
  if(U[t]){
    const r=U[t].r,s=Math.min(42/(r*2.3),4.4),D=DEF[t];
    const at=(tx,ty)=>{x.setTransform(s,0,0,s,44,52);if(U[t].fly)x.translate(0,-r*.3);x.translate(tx,ty);};
    at(0,0);drawPart(x,t,'body',0,0);
    if(D.eyes)for(const p of[D.eyes.L,D.eyes.R]){at(p[0]*r+D.eyes.s*r*.35,p[1]*r+D.eyes.s*r*.15);drawPart(x,t,'pupilL',0,0);}
    at(0,0);if(D.headgear)drawPart(x,t,'headgear',0,0);if(D.weapon)drawPart(x,t,'weapon',0,0);
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
export { E };
