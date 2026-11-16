// Reine Daten: Einheiten, Gelände, Kategorien, Teams, Missionen. Kein DOM, kein Math.random.
export const CELL = 10;
export const HASH_CELL = 40;
export const PATH_RECHECK = .25;   // s zwischen zwei Linienprüfungen der Wegfindung je Einheit (combat.think)

export const UNITS = {
  krieger:{n:'Krieger',cat:'armee',col:'#5b8def',r:9,hp:60,dmg:12,range:3,speed:52,cd:.8,cost:2,mass:1,d:'Marschiert in Reihe und umzingelt Gegner. Treffer von hinten machen +35 %.'},
  schuetze:{n:'Schütze',cat:'armee',col:'#6cc067',r:9,hp:40,dmg:12,range:210,speed:44,cd:1.2,cost:2.5,mass:1,d:'Schießt Pfeile und weicht Nahkämpfern aus.'},
  ritter:{n:'Ritter',cat:'armee',col:'#b4bcc8',r:11,hp:200,dmg:15,range:3,speed:34,cd:1,cost:4.5,mass:2,d:'Ab 3 Rittern Schildwall: kaum Schaden durch Pfeile und Schwerter. Anfällig für Bomben und Feuer.'},
  grenadier:{n:'Grenadier',cat:'armee',col:'#e5574f',r:9,hp:45,dmg:20,range:170,splash:42,speed:44,cd:2.8,cost:4,mass:1,d:'Wirft Bomben. Sprengt auch Mauern.'},
  reiter:{n:'Reiter',cat:'armee',col:'#d9a35b',r:13,hp:120,dmg:17,range:4,speed:115,cd:1.1,cost:3,mass:3,d:'Reitet über die Flanke an, stürmt durch die Reihen und wendet.'},
  sani:{n:'Sanitäter',cat:'armee',col:'#f4f4f6',r:9,hp:40,heal:10,range:90,speed:50,cd:1,cost:3,mass:1,d:'Heilt Verbündete und hält sich aus dem Getümmel heraus.'},
  wolf:{n:'Wolf',cat:'tiere',col:'#8d939e',r:8,hp:40,dmg:7,range:3,speed:100,cd:.55,cost:1.5,mass:.8,d:'Jagt im Rudel: kreist die Beute ein und beißt von der Seite.'},
  baer:{n:'Bär',cat:'tiere',col:'#8b5a3c',r:16,hp:280,dmg:24,range:4,splash:26,speed:46,cd:1.4,cost:10,mass:6,d:'Sehr zäh. Prankenhiebe treffen mehrere.'},
  biene:{n:'Bienen',cat:'tiere',col:'#f5c518',r:4,hp:7,dmg:3,range:2,speed:125,cd:.45,cost:0.5,fly:1,flyZ:14,mass:.1,d:'Schwirrender Schwarm, der sein Ziel umkreist. Billig und lästig.'},
  magier:{n:'Magier',cat:'mythisch',col:'#9b6be0',r:9,hp:50,dmg:20,range:230,splash:38,speed:40,cd:2.6,cost:5,mass:1,d:'Feuerbälle mit Flächenschaden.'},
  geist:{n:'Geist',cat:'mythisch',col:'#eef3fa',r:10,hp:55,dmg:7,range:3,speed:62,cd:.7,cost:3,fly:1,flyZ:18,mass:.6,d:'Schwebt über alles und jagt Schützen, Magier und Sanitäter. Nur Feuer trifft voll.'},
  drache:{n:'Drache',cat:'mythisch',col:'#2fae8f',r:26,hp:900,dmg:6,range:110,speed:48,cd:.2,cost:40,fly:1,flyZ:60,mass:30,d:'Kreist über dem Ziel und speit Feuer in einem Kegel.'},
  soldat:{n:'Soldat',cat:'modern',col:'#7f8f4f',r:9,hp:55,dmg:9,range:190,speed:50,cd:.9,cost:3,mass:1,d:'Sturmgewehr auf mittlere Distanz. Weicht Nahkämpfern aus.'},
  mg:{n:'MG-Schütze',cat:'modern',col:'#c2a66b',r:10,hp:100,dmg:4.5,range:170,speed:36,cd:.15,cost:3.5,mass:1.3,d:'Dauerfeuer. Mäht Schwärme und Infanterie, aber langsam.'},
  sniper:{n:'Scharfschütze',cat:'modern',col:'#4f6b3a',r:9,hp:40,dmg:60,range:380,speed:40,cd:3,cost:7,mass:1,d:'Riesige Reichweite, ein Schuss, ein Treffer. Sehr verwundbar.'},
  panzerfaust:{n:'Panzerfaust',cat:'modern',col:'#b59060',r:9,hp:60,dmg:70,range:230,splash:22,speed:44,cd:3.5,cost:6,mass:1,d:'Rakete gegen Panzer und Hubschrauber. Lange Nachladezeit.'},
  moerser:{n:'Mörser',cat:'modern',col:'#8a8f5a',r:9,hp:40,dmg:40,range:420,splash:55,speed:34,cd:4.5,cost:9,mass:1,d:'Indirektes Feuer über Mauern hinweg. Hilflos im Nahkampf.'},
  panzer:{n:'Panzer',cat:'modern',col:'#6b7b45',r:22,hp:1000,dmg:45,range:260,splash:30,speed:32,cd:3,cost:35,mass:40,d:'Kugeln, Pfeile und Schwerter prallen ab. Kanone mit Flächenschaden. Schwach gegen Raketen.'},
  heli:{n:'Hubschrauber',cat:'modern',col:'#7b8a78',r:18,hp:340,dmg:4,range:200,speed:85,cd:.2,cost:18,fly:1,flyZ:46,mass:12,d:'Fliegt, kreist und feuert Salven. Nahkämpfer kommen nicht ran, Raketen schon.'},
};

export const TERRAIN = {
  wasser:{n:'Wasser',id:1,cost:.04,d:'Bremst Bodentruppen auf 40 % Tempo.'},
  lava:{n:'Lava',id:2,cost:.12,d:'Verbrennt alles, was nicht fliegt.'},
  wald:{n:'Wald',id:3,cost:.04,d:'Deckung: halber Schaden durch Pfeile und Explosionen.'},
  mauer:{n:'Mauer',id:4,cost:.1,d:'Blockiert Bodentruppen, bis sie zerschlagen wird.'},
  radierer:{n:'Radierer',id:0,cost:0,d:'Entfernt Einheiten und Gelände unter dem Pinsel.'},
};

export const PLURAL = {krieger:'Krieger',schuetze:'Schützen',ritter:'Ritter',grenadier:'Grenadiere',reiter:'Reiter',sani:'Sanitäter',wolf:'Wölfe',baer:'Bären',biene:'Bienen',magier:'Magier',geist:'Geister',drache:'Drachen',soldat:'Soldaten',mg:'MG-Schützen',sniper:'Scharfschützen',panzerfaust:'Panzerfäuste',moerser:'Mörser',panzer:'Panzer',heli:'Hubschrauber'};

export const CATEGORIES = [['armee','Armee'],['tiere','Tiere'],['mythisch','Mythisch'],['modern','Modern'],['gelaende','Gelände']];

export const TEAMS = {blau:{n:'Blau',c:'#3f7cff',body:'#5b8def'},rot:{n:'Rot',c:'#ff4d4d',body:'#ef5d55'},gruen:{n:'Grün',c:'#2fbf6b',body:'#4fc07a'},gelb:{n:'Gelb',c:'#ffb800',body:'#ffc533'}};

// Typen, deren Körper die Teamfarbe trägt
export const TINT = new Set(['krieger','schuetze','grenadier','magier','reiter','soldat','mg','sniper','panzerfaust','moerser','panzer','heli']);

// Fernkämpfer (Zielvorlieben von Geist/Reiter, KI)
export const RANGED = new Set(['schuetze','grenadier','magier','soldat','mg','sniper','panzerfaust','moerser']);

// Placement: ['rect',type,n,x0,y0,x1,y1] | ['circle',type,n,cx,cy,rr] | ['unit',type,x,y]
//          | ['tRect',terKey,x0,y0,x1,y1] | ['tCircle',terKey,cx,cy,rr,inner?]
// Koordinaten in Anteilen von W/H, Radien in Anteilen von H. Einheiten gehören dem Team 'rot'.
export const MISSIONS = [
  {n:'Erster Zusammenstoß',budget:60,par:42,hint:'Wähle Krieger, male deine Armee links der Linie und drück Los. Für drei Sterne: Ritter halten mehr aus.',place:[['rect','krieger',24,.70,.36,.80,.64]]},
  {n:'Pfeilregen',budget:100,par:70,hint:'Hinter der Front warten Schützen. Ritter im Schildwall halten Pfeile aus, schnelle Reiter und Wölfe sind schnell bei ihnen.',place:[['rect','krieger',20,.62,.36,.67,.64],['rect','schuetze',26,.8,.28,.88,.72]]},
  {n:'Eiserne Front',budget:110,par:80,hint:'Ein Schildwall aus Rittern. Bomben und Feuer treffen sie voll, und ein Bienenschwarm findet jede Lücke.',place:[['rect','ritter',16,.66,.28,.73,.72],['rect','sani',5,.8,.4,.84,.6]]},
  {n:'Über den Fluss',budget:120,par:90,hint:'Wasser bremst Bodentruppen auf 40 %. Geister schweben drüber, Reiter sind trotzdem schnell drüben.',place:[['tRect','wasser',.47,0,.58,1],['rect','schuetze',22,.7,.28,.78,.72],['rect','grenadier',10,.82,.38,.86,.62],['rect','magier',4,.88,.42,.9,.58]]},
  {n:'Die Festung',budget:110,par:70,hint:'Mauern stoppen Bodentruppen. Magier schießen weiter als Schützen, Geister schweben einfach hinein.',place:[['tCircle','mauer',.8,.5,.3,.25],['circle','magier',8,.8,.5,.09],['circle','schuetze',16,.8,.5,.19]]},
  {n:'Wilde Jagd',budget:120,par:90,cats:['tiere','gelaende'],hint:'Nur Tiere und Gelände. Gegen Ritter hilft Masse: ein großes Rudel oder ein richtiger Schwarm.',place:[['rect','reiter',18,.68,.26,.76,.74],['rect','ritter',14,.8,.3,.86,.7]]},
  {n:'Lavafeld',budget:110,par:75,hint:'Die Lava lässt nur eine Lücke. Bären und Wölfe stürmen durch. Halte sie mit Schützen auf Abstand.',place:[['tRect','lava',.5,0,.56,.42],['tRect','lava',.5,.58,.56,1],['rect','baer',6,.7,.35,.76,.65],['rect','wolf',16,.8,.3,.86,.7]]},
  {n:'Drachenhort',budget:170,par:120,hint:'Zwei Drachen, ein Schwarm und ein Schildwall. Bomben und Feuer gegen den Schwarm, Pfeile gegen die Drachen.',place:[['unit','drache',.78,.35],['unit','drache',.78,.65],['circle','biene',80,.72,.5,.16],['rect','ritter',10,.86,.3,.9,.7]]},
  {n:'Stahlgewitter',budget:150,par:120,hint:'Zwei Panzer, Infanterie und ein Hubschrauber. Panzerfäuste knacken Panzer. Nahkämpfer erreichen den Hubschrauber nicht.',place:[['unit','panzer',.73,.36],['unit','panzer',.73,.64],['rect','soldat',18,.63,.3,.67,.7],['rect','mg',4,.78,.4,.8,.6],['unit','heli',.86,.5]]},
];
