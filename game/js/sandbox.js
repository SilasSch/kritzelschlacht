// Sandkasten: die Demo-Szene beim Start und die Zufallsschlacht (Würfel). Aus main.js ausgelagert; der Aufrufer leert
// vorher die Welt und zeichnet danach das Gelände neu.
import { UNITS, TEAMS } from './data.js';
import { spawn } from './world.js';
import { placeRect, placeCircle, tRect, tCircle } from './sim.js';

export function seedDemo(world) {
  tCircle(world, 'wasser', .66, .52, .2); tCircle(world, 'wald', .3, .78, .09);
  placeRect(world, 'krieger', 36, .12, .18, .24, .42, 'blau');
  placeRect(world, 'ritter', 12, .14, .58, .22, .74, 'blau');
  placeRect(world, 'grenadier', 18, .4, .52, .48, .68, 'rot');
  placeRect(world, 'reiter', 9, .42, .12, .52, .26, 'rot');
  placeCircle(world, 'biene', 40, .9, .2, .07, 'gelb');
  placeRect(world, 'schuetze', 14, .86, .62, .92, .84, 'gruen');
}

export function randomBattle(world, rand = Math.random) {
  const rnd = (a, b) => a + rand() * (b - a);
  const ter = ['wasser', 'wald', 'lava', 'mauer'];
  for (let i = 0; i < 2; i++) {
    const k = ter[rand() * ter.length | 0];
    if (k === 'mauer') { const x = rnd(.4, .58), y = rnd(.1, .4); tRect(world, k, x, y, x + .012, y + rnd(.25, .45)); }
    else tCircle(world, k, rnd(.35, .65), rnd(.25, .75), rnd(.06, .14));
  }
  const types = Object.keys(UNITS).filter(k => k !== 'drache' && UNITS[k].paint !== false);
  const spots = [[.06, .1], [.06, .6], [.78, .1], [.78, .6]];
  const nf = 3 + (rand() * 2 | 0), teams = Object.keys(TEAMS);
  for (let i = 0; i < nf; i++) {
    const t = types[rand() * types.length | 0], [sx, sy] = spots[i];
    const n = Math.max(2, Math.round(60 / UNITS[t].cost));
    placeRect(world, t, Math.min(n, 60), sx, sy, sx + .14, sy + .28, teams[i]);
    if (rand() < .4) {
      const t2 = types[rand() * types.length | 0];
      placeRect(world, t2, Math.max(1, Math.min(Math.round(30 / UNITS[t2].cost), 30)), sx + .02, sy + .05, sx + .12, sy + .22, teams[i]);
    }
  }
  if (rand() < .25) spawn(world, 'drache', world.W * .5, world.H * .1, teams[rand() * nf | 0]);
}
