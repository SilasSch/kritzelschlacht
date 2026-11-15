// Zwischenstand (Task 4): backt die Einheiten-Zeichnungen der alten Datei (paint()) in Texturen.
// Wird in Task 5 durch ein echtes Rig ersetzt. Zeichencode unverändert aus kritzelschlacht.html.
/* global PIXI */
import { UNITS, TEAMS, TINT } from '../data.js';

const U = UNITS;
const O = '#2a2a33';

export function shade(h,a){const n=parseInt(h.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const f=a<0?x=>x*(1+a):x=>x+(255-x)*a;return`rgb(${f(r)|0},${f(g)|0},${f(b)|0})`;}
function E(c,x,y,rx,ry,fill,lw=1.4,stroke=O,rot=0){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(lw&&stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.stroke();}}
function Ln(c,pts,col,lw,outline=true){const path=()=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));};if(outline){path();c.strokeStyle=O;c.lineWidth=lw+2.2;c.stroke();}path();c.strokeStyle=col;c.lineWidth=lw;c.stroke();}
function eyes(c,x,y,s){E(c,x-s,y,s*.95,s*1.1,'#fff',1.1);E(c,x+s,y,s*.95,s*1.1,'#fff',1.1);E(c,x-s+s*.35,y+s*.15,s*.48,s*.55,O,0);E(c,x+s+s*.35,y+s*.15,s*.48,s*.55,O,0);}
function feet(c,r,col,f){const d=f?r*.14:-r*.14;E(c,-r*.42+d,r*.92,r*.3,r*.17,col,1.2);E(c,r*.42-d,r*.92,r*.3,r*.17,col,1.2);}

function RR(c,x,y,w,h,rad,fill){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,rad);else c.rect(x,y,w,h);c.fillStyle=fill;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();}
function paint(c,t,f,tc){
  const T=U[t],r=T.r,col=tc&&TINT.has(t)?tc:T.col,dk=shade(col,-.3),b=f?-.8:0,shield=tc||'#3f6fcf';
  c.lineCap='round';c.lineJoin='round';
  switch(t){
  case'krieger':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.42+b,r*.98,r*.62,0,Math.PI,0);c.closePath();c.fillStyle='#a7b0bb';c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    eyes(c,r*.28,-r*.02+b,r*.27);
    Ln(c,[[r*.78,r*.3+b],[r*1.75,-r*.75+b]],'#e6ebf0',2.2);
    Ln(c,[[r*.52,-r*.02+b],[r*1.08,r*.5+b]],'#8a5a2b',1.8);
    break;
  case'schuetze':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.25+b,r*1.03,r*.8,0,Math.PI*1.02,Math.PI*1.98);c.closePath();c.fillStyle=dk;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    eyes(c,r*.28,r*.05+b,r*.27);
    c.beginPath();c.arc(r*.85,r*.1+b,r*.95,-1.25,1.25);c.strokeStyle=O;c.lineWidth=3.6;c.stroke();c.strokeStyle='#a5692f';c.lineWidth=1.8;c.stroke();
    c.beginPath();c.moveTo(r*.85+Math.cos(-1.25)*r*.95,r*.1+b+Math.sin(-1.25)*r*.95);c.lineTo(r*.85+Math.cos(1.25)*r*.95,r*.1+b+Math.sin(1.25)*r*.95);c.strokeStyle='#fff';c.lineWidth=.8;c.stroke();
    break;
  case'ritter':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    E(c,-r*.15,-r*1.02+b,r*.38,r*.22,'#e5574f',1.2,O,-.4);
    c.beginPath();c.rect(-r*.6,-r*.36+b,r*1.4,r*.42);c.fillStyle='#3a3f4a';c.fill();
    E(c,r*.12,-r*.15+b,r*.14,r*.1,'#fff',0);E(c,r*.48,-r*.15+b,r*.14,r*.1,'#fff',0);
    c.beginPath();c.moveTo(r*.45,-r*.3+b);c.lineTo(r*1.28,-r*.3+b);c.lineTo(r*1.28,r*.25+b);c.quadraticCurveTo(r*1.28,r*.85+b,r*.86,r*1.0+b);c.quadraticCurveTo(r*.45,r*.85+b,r*.45,r*.25+b);c.closePath();
    c.fillStyle=shield;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    Ln(c,[[r*.86,-r*.22+b],[r*.86,r*.85+b]],'#ffd25a',1.4,false);
    break;
  case'grenadier':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    E(c,-r*.05,-r*.86+b,r*.58,r*.3,'#2f3340',1.2);
    eyes(c,r*.28,-r*.05+b,r*.27);
    Ln(c,[[r*1.15,-r*.1+b],[r*1.35,-r*.42+b]],'#c9a26b',1.2,false);
    E(c,r*1.05,r*.32+b,r*.42,r*.42,'#2f3340',1.2);
    E(c,r*1.38,-r*.45+b,r*.18,r*.18,'#ffb800',0);
    break;
  case'reiter':{
    const l=f?r*.18:-r*.18;
    [-r*.72,-r*.36,r*.36,r*.72].forEach((x,i)=>Ln(c,[[x,r*.45],[x+(i%2?l:-l),r*1.05]],'#d8c8b0',2.2));
    Ln(c,[[-r*1.05,r*.1],[-r*1.45,r*.6]],'#7a5a3a',2.4);
    E(c,0,r*.28+b,r*1.15,r*.55,'#efe4d2');
    E(c,r*1.05,-r*.22+b,r*.44,r*.3,'#efe4d2',1.4,O,-.5);
    E(c,r*1.15,-r*.3+b,r*.06,r*.06,O,0);
    E(c,-r*.1,-r*.42+b,r*.55,r*.58,col);
    eyes(c,r*.06,-r*.48+b,r*.16);
    Ln(c,[[r*.1,-r*.2+b],[r*1.9,-r*.95+b]],'#c9a26b',1.8);
    break;}
  case'sani':
    feet(c,r,'#c7cad3',f);E(c,0,b,r,r*1.05,col);
    c.fillStyle='#e5574f';c.fillRect(-r*.12,r*.08+b,r*.24,r*.62);c.fillRect(-r*.31,r*.27+b,r*.62,r*.24);
    E(c,0,-r*.84+b,r*.6,r*.26,'#fff',1.2);
    c.fillStyle='#e5574f';c.fillRect(-r*.06,-r*.98+b,r*.12,r*.28);c.fillRect(-r*.14,-r*.9+b,r*.28,r*.12);
    eyes(c,r*.28,-r*.22+b,r*.25);
    break;
  case'wolf':{
    const l=f?r*.2:-r*.2;
    [-r*.7,-r*.3,r*.35,r*.75].forEach((x,i)=>Ln(c,[[x,r*.5],[x+(i%2?l:-l),r*.95]],dk,2.2));
    Ln(c,[[-r*1.05,0],[-r*1.6,-r*.45]],col,3);
    E(c,0,r*.15+b,r*1.2,r*.72,col);
    c.beginPath();c.moveTo(r*.55,-r*.6+b);c.lineTo(r*.65,-r*1.2+b);c.lineTo(r*.95,-r*.75+b);c.closePath();c.fillStyle=dk;c.fill();c.lineWidth=1.2;c.strokeStyle=O;c.stroke();
    c.beginPath();c.moveTo(r*1.0,-r*.7+b);c.lineTo(r*1.2,-r*1.25+b);c.lineTo(r*1.38,-r*.68+b);c.closePath();c.fill();c.stroke();
    E(c,r*.98,-r*.32+b,r*.6,r*.52,col);
    E(c,r*1.46,-r*.18+b,r*.32,r*.22,'#cfd3da');
    E(c,r*1.74,-r*.22+b,r*.1,r*.09,O,0);
    eyes(c,r*.98,-r*.45+b,r*.17);
    break;}
  case'baer':
    feet(c,r,dk,f);
    E(c,-r*.58,-r*.78+b,r*.28,r*.28,col);E(c,r*.58,-r*.78+b,r*.28,r*.28,col);
    E(c,-r*.58,-r*.78+b,r*.13,r*.13,'#d3a37f',0);E(c,r*.58,-r*.78+b,r*.13,r*.13,'#d3a37f',0);
    E(c,0,b,r,r,col);
    E(c,r*.42,r*.18+b,r*.38,r*.28,'#d3a37f',1.2);
    E(c,r*.62,r*.08+b,r*.11,r*.08,O,0);
    eyes(c,r*.2,-r*.25+b,r*.2);
    break;
  case'biene':
    E(c,-r*.4,-r*.95,r*.55,f?r*.85:r*.45,'rgba(255,255,255,.9)',1,O);
    E(c,r*.2,-r*.95,r*.5,f?r*.8:r*.4,'rgba(255,255,255,.9)',1,O);
    c.save();c.beginPath();c.ellipse(0,0,r*1.25,r*.95,0,0,Math.PI*2);c.fillStyle=col;c.fill();c.clip();
    c.fillStyle=O;c.fillRect(-r*.5,-r,r*.32,r*2);c.fillRect(r*.08,-r,r*.32,r*2);c.restore();
    E(c,0,0,r*1.25,r*.95,null,1.1);
    E(c,r*.78,-r*.18,r*.2,r*.24,O,0);
    break;
  case'magier':
    feet(c,r,dk,f);
    Ln(c,[[r*1.08,r*.95+b],[r*1.08,-r*1.15+b]],'#8a5a2b',1.8);
    E(c,r*1.08,-r*1.32+b,r*.28,r*.28,'#ffcf5a',1.1);
    E(c,0,b,r,r*1.05,col);
    eyes(c,r*.28,-r*.0+b,r*.26);
    c.beginPath();c.moveTo(-r*.95,-r*.5+b);c.lineTo(r*.95,-r*.5+b);c.lineTo(-r*.1,-r*2.05+b);c.closePath();c.fillStyle=dk;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    E(c,0,-r*.5+b,r*1.08,r*.2,dk,1.2);
    E(c,-r*.12,-r*1.1+b,r*.14,r*.14,'#ffd84d',0);
    break;
  case'geist':
    c.globalAlpha=.93;c.beginPath();c.moveTo(-r,r*.1+b);c.arc(0,-r*.05+b,r,Math.PI,0);c.lineTo(r,r*.9+b);
    for(let i=0;i<4;i++){const x0=r-i*r*.5;c.quadraticCurveTo(x0-r*.25,r*(i%2?1.2:.6)+b,x0-r*.5,r*.9+b);}
    c.closePath();c.fillStyle=col;c.fill();c.lineWidth=1.4;c.strokeStyle='#8f9bb0';c.stroke();c.globalAlpha=1;
    E(c,r*.05,-r*.15+b,r*.17,r*.25,O,0);E(c,r*.52,-r*.15+b,r*.17,r*.25,O,0);
    E(c,r*.3,r*.32+b,r*.11,r*.14,O,0);
    break;
  case'drache':{
    const wy=f?-r*1.3:-r*.75;
    c.beginPath();c.moveTo(-r*.5,-r*.1);c.lineTo(-r*1.05,wy);c.quadraticCurveTo(-r*.5,wy*.55,-r*.15,wy*.95);c.quadraticCurveTo(0,wy*.45,r*.3,wy*.9);c.lineTo(r*.3,-r*.2);c.closePath();
    c.fillStyle=dk;c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    Ln(c,[[-r*.85,r*.25],[-r*1.35,r*.45],[-r*1.75,r*.1]],col,4.5);
    E(c,0,r*.15,r*1.05,r*.72,col);
    E(c,r*.15,r*.35,r*.6,r*.33,'#c4ecdd',0);
    c.beginPath();c.moveTo(r*.85,-r*.8);c.lineTo(r*.75,-r*1.25);c.lineTo(r*1.05,-r*.88);c.closePath();c.fillStyle='#f3e2b0';c.fill();c.lineWidth=1.1;c.strokeStyle=O;c.stroke();
    c.beginPath();c.moveTo(r*1.15,-r*.8);c.lineTo(r*1.2,-r*1.22);c.lineTo(r*1.38,-r*.82);c.closePath();c.fill();c.stroke();
    E(c,r*1.0,-r*.42,r*.6,r*.46,col);
    E(c,r*1.48,-r*.32,r*.3,r*.22,col,1.2);
    eyes(c,r*.95,-r*.55,r*.15);
    E(c,r*1.66,-r*.38,r*.05,r*.04,O,0);
    break;}
  case'soldat':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.42+b,r*1.02,r*.66,0,Math.PI,0);c.closePath();c.fillStyle='#5d6b3a';c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    Ln(c,[[-r*1.1,-r*.42+b],[r*1.1,-r*.42+b]],'#4a552d',1.4,false);
    eyes(c,r*.28,b,r*.26);
    Ln(c,[[-r*.15,r*.45+b],[r*1.85,r*.15+b]],'#2f3340',2.2);
    Ln(c,[[r*.75,r*.32+b],[r*.8,r*.7+b]],'#2f3340',1.6,false);
    break;
  case'mg':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.42+b,r*1.02,r*.66,0,Math.PI,0);c.closePath();c.fillStyle='#5d6b3a';c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    eyes(c,r*.28,b,r*.26);
    [[.1,.75],[-.15,.85],[-.4,.9]].forEach(p=>E(c,r*p[0],r*p[1]+b,r*.12,r*.12,'#ffcf5a',.8));
    Ln(c,[[-r*.3,r*.42+b],[r*2.05,r*.3+b]],'#2f3340',3.2);
    Ln(c,[[r*1.55,r*.36+b],[r*1.4,r*.9+b]],'#2f3340',1.2,false);Ln(c,[[r*1.55,r*.36+b],[r*1.75,r*.9+b]],'#2f3340',1.2,false);
    break;
  case'sniper':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    E(c,0,-r*.62+b,r*1.18,r*.26,'#4a5a30',1.2);
    c.beginPath();c.ellipse(0,-r*.66+b,r*.66,r*.46,0,Math.PI,0);c.closePath();c.fillStyle='#4a5a30';c.fill();c.lineWidth=1.2;c.strokeStyle=O;c.stroke();
    [[-.5,-1.05],[-.1,-1.2],[.35,-1.1]].forEach(p=>Ln(c,[[r*p[0],-r*.95+b],[r*p[0]+r*.12,r*p[1]+b]],'#6d8a45',1.4,false));
    eyes(c,r*.28,b,r*.26);
    Ln(c,[[-r*.4,r*.4+b],[r*2.4,r*.05+b]],'#2f3340',1.7);
    E(c,r*.75,r*.12+b,r*.34,r*.14,'#2f3340',0);
    break;
  case'panzerfaust':
    feet(c,r,dk,f);E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.42+b,r*1.02,r*.66,0,Math.PI,0);c.closePath();c.fillStyle='#5d6b3a';c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    eyes(c,r*.3,r*.05+b,r*.25);
    Ln(c,[[-r*1.15,-r*.05+b],[r*1.25,-r*.6+b]],'#6b7a46',3.6);
    c.beginPath();c.moveTo(r*1.2,-r*.85+b);c.lineTo(r*1.85,-r*.72+b);c.lineTo(r*1.3,-r*.38+b);c.closePath();c.fillStyle='#3a3f4a';c.fill();c.lineWidth=1.2;c.strokeStyle=O;c.stroke();
    break;
  case'moerser':
    feet(c,r,dk,f);
    Ln(c,[[r*.55,r*.98],[r*1.35,r*.98]],'#2f3340',2,false);
    Ln(c,[[r*.95,r*.95],[r*1.4,-r*.35]],'#3a3f4a',4.2);
    E(c,0,b,r,r*1.05,col);
    c.beginPath();c.ellipse(0,-r*.42+b,r*1.02,r*.66,0,Math.PI,0);c.closePath();c.fillStyle='#5d6b3a';c.fill();c.lineWidth=1.4;c.strokeStyle=O;c.stroke();
    eyes(c,r*.28,b,r*.26);
    break;
  case'panzer':{
    const w=f?r*.05:0;
    RR(c,-r*1.3,r*.18,r*2.6,r*.55,r*.27,'#3a3d45');
    for(let i=-3;i<=3;i++)E(c,i*r*.34+w,r*.46,r*.13,r*.13,'#7b808a',1);
    RR(c,-r*1.15,-r*.2+b,r*2.3,r*.5,r*.12,col);
    Ln(c,[[r*.3,-r*.55+b],[r*1.8,-r*.6+b]],dk,3.4);
    E(c,-r*.05,-r*.5+b,r*.62,r*.38,col);
    E(c,-r*.25,-r*.84+b,r*.22,r*.08,dk,1);
    eyes(c,r*.22,-r*.5+b,r*.14);
    break;}
  case'heli':
    Ln(c,[[-r*.6,-r*.1],[-r*1.7,-r*.35]],col,3.4);
    E(c,-r*1.75,-r*.38,r*.08,f?r*.42:r*.16,'#cfd5dd',1);
    Ln(c,[[-r*.75,r*.78],[r*.8,r*.78]],'#2f3340',1.6,false);
    Ln(c,[[-r*.4,r*.45],[-r*.45,r*.78]],'#2f3340',1.4,false);Ln(c,[[r*.4,r*.45],[r*.45,r*.78]],'#2f3340',1.4,false);
    E(c,0,0,r*.98,r*.64,col);
    E(c,r*.5,-r*.08,r*.4,r*.32,'#bfe3f2',1.2);
    eyes(c,r*.52,-r*.06,r*.12);
    Ln(c,[[0,-r*.6],[0,-r*.86]],'#2f3340',1.6,false);
    E(c,0,-r*.9,r*1.85,r*.16,'rgba(60,60,70,.12)',0);
    if(f)Ln(c,[[-r*1.85,-r*.9],[r*1.85,-r*.9]],'#2f3340',1.6,false);else Ln(c,[[-r*.6,-r*1.02],[r*.6,-r*.78]],'#2f3340',1.6,false);
    break;
  }
}

export const spriteSize = r => r * 4.6 + 14;

// Liefert Texturen pro type|team|flip|frame (Körper) und type|team (Schatten + Teamring).
// resolution = Pixel je Welteinheit. Texturen werden beim ersten Bedarf gebacken.
export function bakeUnitTextures(renderer, resolution) {
  const cache = new Map();
  const make = (t, fn) => {
    const r = U[t].r, S = spriteSize(r), px = Math.ceil(S * resolution);
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const c = cv.getContext('2d');
    fn(c, r, px);
    return PIXI.Texture.from(cv);
  };
  return {
    resolution,
    size: t => spriteSize(U[t].r),
    get(t, team, flip, frame) {
      const key = t + '|' + (team || '') + '|' + (flip ? 1 : 0) + '|' + frame;
      let tex = cache.get(key);
      if (!tex) {
        tex = make(t, (c, r, px) => {
          c.setTransform(resolution * (flip ? -1 : 1), 0, 0, resolution, px / 2, px / 2);
          if (U[t].fly) c.translate(0, -r * .5);
          paint(c, t, frame, team ? TEAMS[team].body : null);
        });
        cache.set(key, tex);
      }
      return tex;
    },
    shadow(t, team) {
      const key = 'sh|' + t + '|' + (team || '');
      let tex = cache.get(key);
      if (!tex) {
        tex = make(t, (c, r, px) => {
          c.setTransform(resolution, 0, 0, resolution, px / 2, px / 2);
          E(c, 0, r * 1.05, r * .85, r * .28, 'rgba(40,40,70,.13)', 0);
          if (team) E(c, 0, r * 1.0, r * 1.12, r * .42, null, 3, TEAMS[team].c);
        });
        cache.set(key, tex);
      }
      return tex;
    },
    destroy() { for (const tex of cache.values()) tex.destroy(true); cache.clear(); },
  };
}

// Symbolbild (data-URL) für Palette und Zählerliste
export function iconURL(t){
  const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');
  if(U[t]){const r=U[t].r,s=Math.min(42/(r*2.3),4.4);x.setTransform(s,0,0,s,44,52);if(U[t].fly)x.translate(0,-r*.3);paint(x,t,0);}
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
export { E };
