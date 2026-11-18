// Reine Daten: Einheiten, Fähigkeiten, Konter, Gelände, Kategorien, Teams, Missionen. Kein DOM, kein Math.random.
export const CELL = 10;
export const HASH_CELL = 40;
export const PATH_RECHECK = .25;   // s zwischen zwei Linienprüfungen der Wegfindung je Einheit (combat.think)

export const UNITS = {
  // Balance 18.11. (Wünsche aus dem Spiel, Kosten-Nutzen-Messung): Magier Kosten 5 → 8 (Wunsch: deutlich teurer), Ritter LP 200 → 190 und Kosten 4,5 →
  // 4,75, Sanitäter Heilung 10 → 12 und Reichweite 90 → 140 (vorher floh er vor jedem Nahkampf, bevor er heilen konnte),
  // Vampir Kosten 8 → 7, Phönix Kosten 9,25 → 8,5 (hält den Konter phoenix > vampir), Gorilla Schaden 18 → 22. Wo der
  // Lösungsplan einer Mission dadurch teurer wurde, steigt par (und bei ga-5, vamp-1 das Budget) um genau diese Differenz.
  krieger:{n:'Krieger',cat:'armee',col:'#5b8def',r:9,hp:64,dmg:12,range:3,speed:52,cd:.8,cost:2,mass:1,d:'Marschiert in Reihe und umzingelt Gegner. Treffer von hinten machen +35 %.'},
  schuetze:{n:'Schütze',cat:'armee',col:'#6cc067',r:9,hp:40,dmg:12,range:210,speed:44,cd:1.2,cost:2.5,mass:1,d:'Schießt Pfeile und weicht Nahkämpfern aus.'},
  ritter:{n:'Ritter',cat:'armee',col:'#b4bcc8',r:11,hp:190,dmg:20,range:3,speed:34,cd:1.05,cost:4.75,mass:2,d:'Ab 3 Rittern Schildwall: kaum Schaden durch Pfeile und Schwerter. Stark gegen Krieger, Schützen und Reiter. Bienenschwärme, Scharfschützen, Bomben und Feuer setzen ihm zu.'},
  grenadier:{n:'Grenadier',cat:'armee',col:'#e5574f',r:9,hp:45,dmg:20,range:170,splash:42,speed:44,cd:2.8,cost:4,mass:1,d:'Wirft Bomben. Sprengt auch Mauern.'},
  reiter:{n:'Reiter',cat:'armee',col:'#d9a35b',r:13,hp:120,dmg:17,range:4,speed:115,cd:1.1,cost:3,mass:3,d:'Reitet über die Flanke an, stürmt durch die Reihen und wendet.'},
  // Task 7: LP 95 → 100 (römer > schuetze stand an zwei Formen bei 1–2/4)
  roemer:{n:'Römer',cat:'armee',col:'#c94a3a',r:10,hp:100,dmg:15,range:3,speed:47,cd:.9,cost:3,mass:1.4,pilum:20,d:'Marschiert als Block im Gleichschritt und wirft vor dem Zusammenstoß Speere. In Formation halten die Schilde Pfeile und Kugeln von vorn ab: stark gegen Schützen und Krieger. Bomben, Mörser, Feuerbälle und Reiter über die Flanke brechen den Block.'},
  koenig:{n:'König',cat:'armee',col:'#5b8def',r:12,hp:320,dmg:20,range:3,speed:40,cd:1,cost:20,mass:2,d:'Teuer und wertvoll: seine Aura macht nahe Armee-Truppen mutig und stärker, sein Schlachtruf heilt sie. Fällt er, verlieren sie den Mut.'},
  // Pikenier (18.11., Ideenrunde): lange Pike, stemmt sie gegen Stürme (abilities.PIKE): Reiter, Einhorn, Elefant,
  // Büffel und Triceratops prallen im Ansturm ab. Gegen Fußvolk und Fernkampf eher schwach.
  pikenier:{n:'Pikenier',cat:'armee',col:'#7a9bd1',r:9,hp:85,dmg:10,range:12,speed:42,cd:1.1,cost:3,mass:1.3,d:'Stemmt die lange Pike gegen jeden Ansturm: Reiter, Büffel und Elefanten prallen ab. Gegen Schützen und Fußvolk eher schwach.'},
  sani:{n:'Sanitäter',cat:'armee',col:'#f4f4f6',r:9,hp:40,heal:12,range:90,speed:50,cd:1,cost:3.5,mass:1,d:'Heilt Verbündete und hält sich aus dem Getümmel heraus.'},
  wolf:{n:'Wolf',cat:'tiere',col:'#8d939e',r:8,hp:40,dmg:7,range:3,speed:100,cd:.55,cost:1.5,mass:.8,d:'Jagt im Rudel: kreist die Beute ein und beißt von der Seite.'},
  baer:{n:'Bär',cat:'tiere',col:'#8b5a3c',r:16,hp:280,dmg:24,range:4,splash:26,speed:46,cd:1.4,cost:10,mass:6,d:'Sehr zäh. Prankenhiebe treffen mehrere.'},
  biene:{n:'Bienen',cat:'tiere',col:'#f5c518',r:4,hp:24,dmg:4,range:2,speed:135,cd:.45,cost:1,fly:1,flyZ:14,mass:.1,d:'Schwirrender Schwarm, der sein Ziel umkreist. Der erste Stich vergiftet. Billig und lästig.'},
  magier:{n:'Magier',cat:'mythisch',col:'#9b6be0',r:9,hp:50,dmg:20,range:230,splash:38,speed:40,cd:3.2,cost:8,mass:1,d:'Zauberbuch: Feuerball, Blitz, Windstoß oder Steinwand, je nach Lage. Drei zusammen rufen einen Meteor.'},
  geist:{n:'Geist',cat:'mythisch',col:'#eef3fa',r:10,hp:55,dmg:7,range:3,speed:62,cd:.7,cost:3,fly:1,flyZ:18,mass:.6,d:'Schwebt über alles und jagt Schützen, Magier und Sanitäter. Nur Feuer trifft voll.'},
  drache:{n:'Drache',cat:'mythisch',col:'#2fae8f',r:26,hp:900,dmg:6,range:110,speed:48,cd:.2,cost:40,fly:1,flyZ:60,mass:30,d:'Kreist über dem Ziel und speit Feuer in einem Kegel.'},
  // Vampir (Spez. #32): Biss mit Lebensraub, Fledermausform (BAT_FORM, unten) und Ghule (abilities.js); Teamfarbe am Umhang
  // Task 7: Kosten 6 → 8, LP 160 → 130: 20 Vampire gewannen M4 bis 8/8 und M7 bis 8/8 (Spam muss verlieren)
  vampir:{n:'Vampir',cat:'mythisch',col:'#7a2944',r:10,hp:130,dmg:18,range:3,speed:54,cd:.8,cost:7.5,mass:1.2,d:'Beißt und heilt sich dabei. Auf langen Wegen und auf der Flucht fliegt er als Fledermausschwarm. Wen er totbeißt, steht als Ghul auf.'},
  // Ghul (Festlegung 3): nicht malbar, entsteht nur durch den tödlichen Biss eines Vampirs; langsam, schwach, zerfällt
  ghul:{n:'Ghul',cat:'mythisch',col:'#8f9c84',r:9,hp:40,dmg:7,range:3,speed:32,cd:1.1,cost:1,mass:1,paint:false,d:'Entsteht durch den Biss eines Vampirs. Langsam, schwach und hirnlos. Zerfällt mit der Zeit und mit seinem Vampir.'},
  soldat:{n:'Soldat',cat:'modern',col:'#7f8f4f',r:9,hp:55,dmg:9,range:190,speed:50,cd:.9,cost:3,mass:1,d:'Sturmgewehr auf mittlere Distanz. Weicht Nahkämpfern aus.'},
  // MG (Nachtrag 5, #40): Abklingzeit .13 → .11 s (18 % mehr Kugeln, sichtbar dichteres Dauerfeuer); Reiter, Scharfschütze und Panzerfaust schlagen es weiter
  mg:{n:'MG-Schütze',cat:'modern',col:'#c2a66b',r:10,hp:115,dmg:3.9,range:170,speed:36,cd:.11,cost:3.5,mass:1.3,d:'Dauerfeuer. Mäht Schwärme und Infanterie, aber langsam.'},
  // Flammenwerfer (18.11., Ideenrunde): kurzer Flammenkegel wie der Drachenatem (combat.flame), zündet alles darin an
  // und setzt Wald in Brand. Erreicht niedrige Flieger (Bienen, Geister), aber nichts Hohes (world.groundMelee).
  flamme:{n:'Flammenwerfer',cat:'modern',col:'#d9643a',r:9,hp:75,dmg:3.5,range:72,speed:46,cd:.25,cost:5,mass:1.1,d:'Kurzer Flammenstrahl, der alle im Kegel anzündet und Wald in Brand setzt. Stark gegen Schwärme, Trolle und dichte Blöcke. Auf Abstand hilflos.'},
  // Scharfschütze (Nachtrag 4, #36): schießt nur im Liegen; dafür Schaden und Abklingzeit ×1,5 (60 → 90, 3 → 4,5 s), Reichweite +20 % (380 → 456)
  sniper:{n:'Scharfschütze',cat:'modern',col:'#4f6b3a',r:9,hp:40,dmg:90,range:456,speed:40,cd:4.5,cost:7,mass:1,d:'Riesige Reichweite, ein Schuss, ein Treffer, aber nur im Liegen. Sehr verwundbar.'},
  panzerfaust:{n:'Panzerfaust',cat:'modern',col:'#b59060',r:9,hp:85,dmg:70,range:230,splash:22,speed:44,cd:3.5,cost:6,mass:1,d:'Rakete gegen Panzer und Hubschrauber. Lange Nachladezeit.'},
  // Nachtrag 7 (#47): Splash 55 → 62, Abklingzeit 4,5 → 4,2 s (Römer außerhalb des Blocks weichen aus, moerser > roemer hielt nicht)
  moerser:{n:'Mörser',cat:'modern',col:'#8a8f5a',r:9,hp:40,dmg:40,range:420,splash:66,speed:34,cd:4.2,cost:8.5,mass:1,d:'Indirektes Feuer über Mauern hinweg. Hilflos im Nahkampf.'},
  panzer:{n:'Panzer',cat:'modern',col:'#6b7b45',r:22,hp:1000,dmg:45,range:260,splash:30,speed:32,cd:3,cost:35,mass:40,d:'Kugeln, Pfeile und Schwerter prallen ab. Kanone mit Flächenschaden. Schwach gegen Raketen.'},
  // Overhaul 18.11.: high = fliegt so hoch, dass Nahkämpfer am Boden nicht rankommen (world.outOfMelee); Heli hält Abstand
  heli:{n:'Hubschrauber',cat:'modern',col:'#7b8a78',r:18,hp:340,dmg:4,range:200,speed:85,cd:.2,cost:18,fly:1,flyZ:46,high:1,mass:12,d:'Schwebt auf Abstand und feuert Salven. Gepanzert gegen Kugeln, Pfeile und Raketen treffen voll. Nahkämpfer kommen nicht ran.'},
  // Lufteinheiten (18.11., air.js): Jet = Luftüberlegenheit im Überflug, Kampfdrohne = billige Kamikaze-Drohne gegen Panzerung,
  // Bomber = langsamer Teppich aus Bomben gegen Bodentruppen. Alle drei fliegen hoch (high).
  jet:{n:'Kampfjet',cat:'modern',col:'#8e9aa6',r:11,hp:150,dmg:4,range:170,speed:230,cd:.12,cost:11,fly:1,flyZ:72,high:1,mass:6,d:'Rast im Überflug heran, feuert die Bordkanone und dreht weit. Jagt zuerst Flieger. Gegen Bodentruppen schwach.'},
  kampfdrohne:{n:'Kampfdrohne',cat:'modern',col:'#9aa39a',r:6,hp:24,dmg:70,range:4,splash:26,speed:130,cd:4,cost:3,fly:1,flyZ:30,high:1,mass:.4,d:'Billige Kamikaze-Drohne. Sucht sich das teuerste Ziel in der Nähe und stürzt sich hinein. Zerbrechlich.'},
  bomber:{n:'Bomber',cat:'modern',col:'#6f7d63',r:20,hp:620,dmg:60,range:4,splash:50,speed:52,cd:5,cost:26,fly:1,flyZ:86,high:1,mass:25,d:'Langsamer Riese. Überfliegt die dichteste Gruppe am Boden und wirft einen Bombenteppich, der auch Eigene trifft. Knackt Panzer und Elefanten. Wehrlos gegen Flieger und Gewehre.'},
  // --- Task 6: Kreaturen (Spez. #34; Verhalten in abilities.js, Abschnitt Kreaturen) ---
  // Troll: heilt sich ständig, Feuer stoppt das; Zyklop: Felsbrocken im Bogen (combat 'boulder'), im Nahkampf unbeholfen;
  // Hexe: fliegt niedrig (Festlegung 6), Zauber 'hex', Froschfluch; Phönix: fliegt, Feuerspur, steht einmal wieder auf;
  // Einhorn: Sturmlauf mit dem Horn, Heilaura; Frosch: nicht malbar, entsteht nur durch den Froschfluch (Festlegung 3).
  // Task 7: Kosten 8 → 7, Schaden 22 → 24 (wirkte zu schwach: verlor fast jedes Duell gleicher Punkte)
  troll:{n:'Troll',cat:'mythisch',col:'#7f9a62',r:14,hp:260,dmg:24,range:4,speed:38,cd:1.3,cost:7.5,mass:4,d:'Zäh, mit Keule. Heilt sich ständig selbst, nur Feuer stoppt die Heilung.'},
  // Task 7: Kosten 10 → 12 (Spam gewann M8 und M9 öfter als der Mörser)
  // Nachtrag 7 (#47): Abklingzeit 3,6 → 3,3 s (Grenadiere weichen den Felsbrocken aus, zyklop > grenadier hielt nicht)
  zyklop:{n:'Zyklop',cat:'mythisch',col:'#d0a983',r:15,hp:220,dmg:30,range:280,splash:34,speed:29,cd:3.3,cost:12,mass:5,d:'Mythische Artillerie: wirft Felsbrocken im Bogen über Mauern und Köpfe. Im Nahkampf unbeholfen.'},
  hexe:{n:'Hexe',cat:'mythisch',col:'#6a4c8c',r:9,hp:55,dmg:10,range:200,speed:58,cd:1.3,cost:5,fly:1,flyZ:24,mass:.8,d:'Fliegt niedrig auf dem Besen und schießt grüne Zauber. Verwandelt Gegner kurz in harmlose Frösche.'},
  // Task 7: Kosten 7 → 9,5 (Spam gewann M4 und M7 öfter als der Geist)
  phoenix:{n:'Phönix',cat:'mythisch',col:'#ff8a3d',r:11,hp:110,dmg:12,range:3,speed:88,cd:.8,cost:8.5,fly:1,flyZ:26,mass:1,d:'Feuervogel mit Feuerspur, die Bodentruppen anzündet. Steht einmal pro Schlacht aus seiner Asche wieder auf.'},
  einhorn:{n:'Einhorn',cat:'mythisch',col:'#f4f0fa',r:13,hp:150,dmg:16,range:4,speed:105,cd:1.1,cost:4.5,mass:3,d:'Schneller Sturmläufer mit dem Horn voran. Heilt Verbündete in der Nähe ein wenig.'},
  frosch:{n:'Frosch',cat:'mythisch',col:'#5cb85c',r:6,hp:20,dmg:0,range:3,speed:30,cd:1,cost:0,mass:.5,paint:false,d:'Entsteht durch Froschfluch: ein verwandelter Gegner. Harmlos, hüpft weg und wird nach 5 s wieder er selbst.'},
  // --- Task 5: Tiere (Spez. #33; Verhalten in abilities.js, Block "Task 5") ---
  // Elefant: Boss-Sticker (rig.js), furchtlos gegen Brüllen und Spuk, aber Bienen erschrecken ihn; nie Ghul oder Frosch.
  // Krokodil: swim/land = Tempofaktor im Wasser (statt der Wasserbremse) und an Land (physics.integrate).
  // tier: 1 = eines der neuen Tiere (combat.think ruft abilities.stepAnimal/animalPassive; ein Feld statt Set.has im heißen Pfad).
  elefant:{n:'Elefant',cat:'tiere',col:'#9aa0ab',r:20,hp:900,dmg:30,range:4,speed:36,cd:1.6,cost:24,mass:25,tier:1,d:'Langsamer, riesiger Dickhäuter. Trampelt alle 20 s durch die Reihen. Brüllen und Spuk lassen ihn kalt, vor Bienen flieht er.'},
  // Task 7: Kosten 4 → 4,5 (Spam gewann M4, die Flussmission, bis 4/8)
  krokodil:{n:'Krokodil',cat:'tiere',col:'#5e8a4a',r:11,hp:120,dmg:16,range:3,speed:50,cd:1,cost:4.75,mass:2,swim:1.6,land:.7,tier:1,d:'Im Wasser schnell und fast unsichtbar, an Land langsam. Packt aus dem Hinterhalt zu.'},
  gorilla:{n:'Gorilla',cat:'tiere',col:'#4a4552',r:12,hp:200,dmg:22,range:3,speed:52,cd:.95,cost:6,mass:3,tier:1,d:'Starker Nahkämpfer. Wirft Gegner in die Menge und schlägt sich auf die Brust.'},
  // Task 7: Kosten 3 → 4 (Spam gewann M7 öfter als der Geist; Nahkämpfer erreichen ihn oben nicht)
  adler:{n:'Adler',cat:'tiere',col:'#8a5a32',r:8,hp:55,dmg:9,range:3,speed:105,cd:.8,cost:4,fly:1,flyZ:30,mass:.5,tier:1,d:'Kreist hoch oben und stößt auf Schützen herab. Kleine Gegner packt er, trägt sie fort und lässt sie fallen. Nahkämpfer erwischen ihn nur unten. Schützen, Soldaten und MGs holen ihn runter.'},
  lama:{n:'Lama',cat:'tiere',col:'#efe4d2',r:11,hp:90,dmg:9,range:185,speed:50,cd:1.3,cost:3.5,mass:1.5,d:'Spuckt auf Abstand, auch auf Flieger. Wen die Spucke trifft, der wird 2 s lang langsamer.'},
  bueffel:{n:'Büffel',cat:'tiere',col:'#5a4334',r:12,hp:140,dmg:13,range:3,speed:50,cd:1.1,cost:4,mass:3,tier:1,d:'Herdentier. Ab 3 Büffeln stürmt die Herde los und rammt alles um. Einzeln eher harmlos.'},
  // --- Schrottplatz (5. Kategorie, 18.11.): Roboter (bot: 1). Kategorie-Regeln in abilities.js (Block "Schrottplatz"):
  // Schild aus 20 % der LP, der sich nach 4 s ohne Treffer auflädt; Blitz macht doppelten Schaden; Wasser schließt kurz.
  // Zerstörte Bots bleiben als Schrott liegen (ihre Leiche), die Schrauber-Drohne baut daraus Minibots.
  minibot:{n:'Minibot',cat:'schrott',col:'#b4bcc8',r:8,hp:45,dmg:7,range:3,speed:62,cd:.7,cost:1.5,mass:.8,bot:1,d:'Billiger kleiner Roboter. Ab 5 Minibots beieinander schlagen sie härter zu. Schrauber-Drohnen bauen neue aus Schrott.'},
  laserbot:{n:'Laserbot',cat:'schrott',col:'#a9b6c9',r:9,hp:55,dmg:10,range:200,speed:44,cd:1.4,cost:3,mass:1,bot:1,d:'Laserstrahl trifft sofort, auch Flieger, und geht durch bis zu einen zweiten Gegner dahinter.'},
  drohne:{n:'Schrauber-Drohne',cat:'schrott',col:'#ffc533',r:9,hp:50,heal:8,range:90,speed:60,cd:1,cost:3,fly:1,flyZ:18,mass:.6,bot:1,repair:1,d:'Fliegt niedrig, repariert Maschinen und baut aus Schrott neue Minibots.'},
  kuppel:{n:'Schildkuppel',cat:'schrott',col:'#8fa3c4',r:11,hp:140,dmg:9,range:3,speed:40,cd:1,cost:4.5,mass:2,bot:1,d:'Spannt eine Kuppel auf, die feindliche Geschosse von außen abfängt, bis sie überlastet. Schwach im Nahkampf.'},
  spinne:{n:'Springspinne',cat:'schrott',col:'#4a4552',r:9,hp:80,dmg:11,range:3,speed:70,cd:.8,cost:3,mass:1,bot:1,d:'Springt über die Front und über Mauern auf Fernkämpfer und Heiler.'},
  schweisser:{n:'Schweißer',cat:'schrott',col:'#d99a12',r:10,hp:90,dmg:9,range:3,speed:46,cd:.7,cost:4,mass:1.4,bot:1,d:'Nahkampf mit dem Schweißbrenner: zündet Gegner an und flickt Bots in der Nähe.'},
  magnet:{n:'Magnet-Mech',cat:'schrott',col:'#9aa3b5',r:13,hp:260,dmg:16,range:4,speed:38,cd:1.2,cost:5.5,mass:4,bot:1,d:'Zieht Gegner aus Metall zu sich in einen Haufen: Ritter, Römer, Soldaten und andere Roboter.'},
  tesla:{n:'Teslaspule',cat:'schrott',col:'#c9a27a',r:11,hp:120,dmg:15,range:170,speed:32,cd:2,cost:7,mass:2,bot:1,d:'Kettenblitz springt auf bis zu 6 Gegner. Stark gegen Schwärme und Flieger.'},
  mega:{n:'Mega-Mech',cat:'schrott',col:'#8d97a8',r:22,hp:1000,dmg:30,range:5,splash:30,speed:30,cd:1.6,cost:32,mass:30,bot:1,d:'Riesiger Stampfer. Zerfällt beim Tod in 4 Minibots. Blitze und Raketen setzen ihm zu.'},
  // --- Urzeit (5. Kategorie, 18.11.): grow = s bis zum Erwachsensein. Jungtiere tragen YOUNG[t] als u.T (70 % LP,
  // 60 % Schaden, kleiner, data.js unten); der T-Rex schlüpft erst aus dem Ei (REX_HATCH). Verhalten in abilities.js.
  hoehle:{n:'Höhlenmensch',cat:'urzeit',col:'#f2c9a0',r:9,hp:76,dmg:12,range:3,speed:50,cd:.85,cost:2,mass:1,d:'Keule mit Fackel: jeder vierte Schlag zündet den Gegner an.'},
  speer:{n:'Speerwerfer',cat:'urzeit',col:'#e8bf94',r:9,hp:45,dmg:13,range:190,speed:46,cd:1.5,cost:2.5,mass:1,d:'Wirft Speere im Bogen, trifft auch Flieger. Weicht Nahkämpfern aus.'},
  schamane:{n:'Schamanin',cat:'urzeit',col:'#f0c49a',r:9,hp:45,heal:8,range:90,speed:48,cd:1,cost:3.5,mass:1,d:'Heilt Verbündete. Ihr Kräuterrauch lässt Jungtiere in der Nähe doppelt so schnell wachsen.'},
  raptor:{n:'Raptor',cat:'urzeit',col:'#6fae5a',r:10,hp:80,dmg:13,range:3,speed:92,cd:.7,cost:2.5,mass:1,grow:10,d:'Schlüpft klein und wächst in 10 s. Springt Fernkämpfer und Heiler an.'},
  ptera:{n:'Flugsaurier',cat:'urzeit',col:'#c9a27a',r:12,hp:70,dmg:18,range:30,splash:26,speed:80,cd:2.4,cost:4.5,fly:1,flyZ:34,mass:1,d:'Fliegt hoch und lässt Steine fallen: Flächenschaden, sprengt Mauern. Nahkämpfer erreichen ihn nicht.'},
  anky:{n:'Ankylosaurus',cat:'urzeit',col:'#a68a5b',r:15,hp:330,dmg:16,range:4,speed:34,cd:1.2,cost:6.5,mass:6,grow:12,d:'Gepanzerter Tank, wächst in 12 s. Von vorn halber Schaden, die Schwanzkeule fegt Gegner hinter ihm weg.'},
  trike:{n:'Triceratops',cat:'urzeit',col:'#8fb0c9',r:15,hp:360,dmg:22,range:4,speed:52,cd:1.2,cost:8,mass:8,grow:12,d:'Wächst in 12 s. Stürmt mit den Hörnern voran durch die Reihen, im Lauf halber Schaden von vorn.'},
  rex:{n:'T-Rex',cat:'urzeit',col:'#5e8a4a',r:20,hp:1000,dmg:34,range:5,splash:24,speed:40,cd:1.4,cost:22,mass:25,grow:24,d:'Startet als Ei, schlüpft nach 8 s und ist nach 24 s ein Riese. Sein Brüllen lässt Kleinere fliehen.'},
  rexei:{n:'Dino-Ei',cat:'urzeit',col:'#f3e6cf',r:9,hp:160,dmg:0,range:3,speed:0,cd:1,cost:0,mass:3,paint:false,egg:1,d:'Aus dem Ei schlüpft nach 8 s ein T-Rex. Wer früh angreift, trifft ihn hier.'},
};

// Fähigkeiten und Besonderheiten für die Charakterkarten (cards.js, Spez. #29): UNITS[t].abil = [{n, d}]. Einzige
// Stelle für Name und Text auch der ausgelösten Fähigkeiten (Spez. #30); ihr Verhalten steht in abilities.js (ABILITY).
// Kurz halten (Name ≤ 24, Text ≤ 140 Zeichen, tests/cards.test.js). Neue Einheiten tragen hier ein oder setzen
// abil direkt im UNITS-Eintrag; die Karten lesen nur UNITS[t].abil. Rückzug ab 25 % gilt für alle (cards.RETREAT_NOTE).
const ABIL = {
  krieger: [{n:'Von hinten', d:'Kreist Gegner ein. Angriffe von hinten machen +35 % Schaden.'}],
  schuetze: [
    {n:'Brandpfeile', d:'Alle 30 s schießt eine Schützengruppe 3 Brandpfeile. Getroffene brennen, das Feuer springt nicht über. Römerschilde halten sie ab.'},
    {n:'Ausweichen', d:'Weicht heranstürmenden Nahkämpfern aus.'},
  ],
  ritter: [
    {n:'Schildwall', d:'Ab 3 Rittern nah beieinander: kaum Schaden durch Pfeile und Schwerter.'},
    {n:'Rüstung', d:'Hält Pfeile, Schwerter und Kugeln gut ab. Bomben, Feuer, Zauber und Raketen treffen ihn dafür besonders hart.'},
  ],
  grenadier: [{n:'Mauerbrecher', d:'Bomben mit Flächenschaden sprengen auch Mauern.'}],
  koenig: [
    {n:'Königsaura', d:'Armee-Truppen bis 150 px fliehen nicht und machen 20 % mehr Nahkampfschaden.'},
    {n:'Schlachtruf', d:'Alle 18 s im Kampf: Verbündete bis 170 px heilen 25 % und sind 5 s lang 25 % schneller und stärker.'},
    {n:'Königsmord', d:'Fällt der König, erschrecken die eigenen Truppen bis 250 px für 3 s.'},
  ],
  reiter: [
    {n:'Flankenritt', d:'Reitet seitlich am Ziel vorbei, statt frontal anzugreifen.'},
    {n:'Sturmangriff', d:'Im vollen Galopp macht der Stoß fast dreifachen Schaden. Danach reitet er durch und wendet.'},
    {n:'Keil', d:'Ab 3 Reitern als Keil: Sturmangriff gegen Ritter und Römer +50 %, bricht den Schildwall.'},
  ],
  roemer: [
    {n:'Blockformation', d:'Marschiert als Block im Gleichschritt. Im Block hält er bis 15 % Leben durch.'},
    {n:'Speersalve', d:'Vor dem Zusammenstoß wirft der Block Reihe für Reihe seine Speere.'},
    {n:'Schilde', d:'Nur in Formation: Pfeile, Kugeln und Speere von vorn prallen fast wirkungslos ab.'},
  ],
  sani: [
    {n:'Heilwelle', d:'Alle 20 s heilt er alle Verbündeten im Umkreis um ein Viertel ihrer Lebenspunkte. Nahe Sanitäter warten danach mit ihrer Welle.'},
    {n:'Heilen', d:'Heilt einen Verbündeten, Fliehende zuerst. Heilen mehrere dasselbe Ziel, wirkt jede weitere Heilung schwächer.'},
  ],
  wolf: [
    {n:'Heulen', d:'Ab 3 Wölfen heult das Rudel alle 25 s: 5 s lang 30 % schneller und 30 % stärkerer Biss.'},
    {n:'Rudel', d:'Ab 3 Wölfen fächert das Rudel auf, greift von der Seite an und beißt 40 % härter.'},
  ],
  baer: [
    {n:'Brüllen', d:'Alle 20 s brüllt er nahe Feinde an, die dann 2 s lang fliehen. Panzer, Hubschrauber und Drachen lässt das kalt.'},
    {n:'Prankenhieb', d:'Trifft alle Feinde vor sich und stößt sie zurück.'},
  ],
  biene: [
    {n:'Schwarm', d:'Umkreist das Ziel und sticht von allen Seiten. Stark in großer Zahl.'},
    {n:'Gift', d:'Der erste Stich jeder Biene vergiftet: 3 s lang 4 Schaden je Sekunde. Neues Gift frischt auf, stapelt aber nicht.'},
  ],
  magier: [
    {n:'Feuerball', d:'Gegen dichte Gruppen und Geister: Flächenschaden, setzt in Brand. Nie, wo mehr Eigene als Feinde stehen.'},
    {n:'Blitz', d:'Gegen Einzelziele und Flieger: trifft sofort und springt auf bis zu 3 nahe Feinde.'},
    {n:'Windstoß', d:'Kommen Nahkämpfer zu nah, schleudert er sie zurück und pustet Bienen weg. Alle 6 s.'},
    {n:'Steinwand', d:'Lädt der Wind noch, zieht er eine kurze Mauer hoch. Sie zerbröselt nach 12 s. Alle 10 s.'},
    {n:'Meteor (Gruppenzauber)', d:'Ab 3 Magiern nah beieinander: 1,5 s gemeinsam zaubern, dann ein Meteor in die dichteste Feindgruppe. Alle 30 s.'},
  ],
  geist: [
    {n:'Spuk', d:'Alle 15 s erschreckt er sein Ziel, das dann 2,5 s lang in Panik flieht.'},
    {n:'Körperlos', d:'Nur Feuer trifft voll, alles andere macht halben Schaden.'},
    {n:'Lebensraub', d:'Jeder Treffer heilt ihn um den angerichteten Schaden. Darum flieht er nie, auch nicht mit wenig Leben.'},
  ],
  drache: [
    {n:'Sturzflug', d:'Alle 30 s stürzt er sich in eine Feindgruppe und schleudert alles im Kreis weg. Nur Feinde nehmen Schaden.'},
    {n:'Feueratem', d:'Speit Feuer in einem Kegel. Getroffene brennen, und das Feuer springt auf Nachbarn über.'},
    {n:'Feuerfest', d:'Fängt selbst kein Feuer.'},
  ],
  soldat: [
    {n:'Handgranate', d:'Alle 15 s wirft er eine Granate in eine Feindgruppe. Die Explosion trifft auch Eigene.'},
    {n:'Ausweichen', d:'Weicht heranstürmenden Nahkämpfern aus.'},
  ],
  mg: [{n:'Hinlegen', d:'Liegt, wenn kein Nahkämpfer nah ist: halber Schaden durch Kugeln, Pfeile und Explosionen, ruhigeres Feuer.'}],
  sniper: [
    {n:'Nur im Liegen', d:'Schießt nur liegend und legt sich hin, wenn kein Nahkämpfer nah ist: halber Schaden durch Kugeln, Pfeile und Explosionen.'},
    {n:'Geduldig', d:'Rückt nur bis auf Schussweite vor, bleibt hinter der eigenen Front und weicht zurück, wenn Feinde nahe kommen.'},
  ],
  panzerfaust: [{n:'Rakete', d:'Trifft Panzer und Hubschrauber besonders hart.'}],
  moerser: [
    {n:'Sperrfeuer', d:'Alle 30 s feuert er 3 Granaten kurz hintereinander rund um das Ziel. Die Einschläge treffen auch Eigene.'},
    {n:'Steilfeuer', d:'Schießt im hohen Bogen über Mauern hinweg.'},
  ],
  panzer: [
    {n:'Ramme', d:'Alle 25 s fährt er mit dreifachem Tempo in die Reihen und schleudert alles weg. Nur Feinde nehmen Schaden.'},
    {n:'Panzerung', d:'Kugeln, Pfeile und Schwerter prallen ab. Raketen treffen hart.'},
    {n:'Bug-MG', d:'Während die Kanone nachlädt, feuert ein MG in der Wanne auf nahe Infanterie (200 px).'},
  ],
  vampir: [
    {n:'Lebensraub', d:'Jeder Biss heilt ihn um die Hälfte des Schadens.'},
    {n:'Fledermausform', d:'Auf langen Wegen und auf der Flucht ein schneller Fledermausschwarm: Nahkämpfer erreichen ihn nicht, er beißt nicht.'},
    {n:'Ghule', d:'Wen sein Biss tötet, steht als Ghul in seinem Team auf. Höchstens 3 zugleich, nie aus Bossen und Fliegern.'},
    {n:'Schwäche: Feuer', d:'Feuer macht doppelten Schaden, auch der Brand.'},
  ],
  ghul: [
    {n:'Vampirbiss', d:'Nicht malbar, entsteht durch Vampirbiss: Wen ein Vampir totbeißt, steht als Ghul auf. Sanitäter heilen ihn nicht.'},
    {n:'Zerfall', d:'Verliert jede Sekunde 4 % seiner Lebenspunkte. Stirbt sein Vampir, zerfällt er sofort.'},
  ],
  heli: [
    {n:'Raketensalve', d:'Alle 25 s feuert er 4 Raketen schnell hintereinander auf die dichteste Feindgruppe. Die Explosionen treffen auch Eigene.'},
    {n:'Gepanzert', d:'Kugeln machen nur drei Viertel Schaden. Raketen treffen hart, Pfeile und fliegende Nahkämpfer voll.'},
    {n:'Hoch oben', d:'Hält Abstand und schwebt seitlich hin und her. Nahkämpfer am Boden kommen nicht ran.'},
  ],
  jet: [
    {n:'Überflug', d:'Fliegt nie still: rast aufs Ziel zu, feuert, solange es vor der Nase ist, schießt vorbei und dreht in weitem Bogen.'},
    {n:'Luftüberlegenheit', d:'Jagt zuerst Flieger und macht gegen sie dreifachen Schaden. Bodentruppen beharkt er nur im Vorbeiflug.'},
    {n:'Luft-Luft-Raketen', d:'Alle 6 s zwei Raketen gegen Flieger vor der Nase. Sie lenken ihrem Ziel nach, wer scharf ausweicht, entkommt.'},
  ],
  kampfdrohne: [
    {n:'Kamikaze', d:'Stürzt sich auf das teuerste Ziel im Umkreis. Die Ladung trifft nur Feinde und wirkt wie eine Rakete. Schwärme verteilen sich.'},
    {n:'Zerbrechlich', d:'Wenige LP: Schützen, Soldaten und MGs holen sie leicht runter, Nahkämpfer erst, wenn sie da ist.'},
  ],
  bomber: [
    {n:'Bombenteppich', d:'Alle 5 s wirft er im Überflug 6 Bomben hintereinander auf die dichteste Gruppe am Boden. Trifft auch Eigene.'},
    {n:'Wehrlos', d:'Hat kein Bordgeschütz: Jets, MGs und Raketen holen ihn runter. Sehr hoch, Nahkämpfer kommen nicht ran.'},
  ],
  // --- Task 6: Kreaturen ---
  troll: [
    {n:'Regeneration', d:'Heilt jede Sekunde 3 % seiner Lebenspunkte.'},
    {n:'Schwäche: Feuer', d:'Nach jedem Feuertreffer, auch durch Brand, 4 s lang keine Heilung.'},
  ],
  zyklop: [
    {n:'Felsbrocken', d:'Wirft Felsen im Bogen über Mauern hinweg. Der Einschlag trifft alle im Umkreis, auch Eigene. Schilde halten ihn nicht ab.'},
    {n:'Unbeholfen', d:'Im Nahkampf schlägt er nur halb so oft und halb so stark zu.'},
  ],
  hexe: [
    {n:'Froschfluch', d:'Alle 14 s wird ihr Ziel 5 s lang ein harmloser Frosch, danach mit seinen LP wieder es selbst. Bosse und Ghule sind immun.'},
    {n:'Hexenzauber', d:'Schießt grüne Zauber geradeaus. Fliegt niedrig: Nahkämpfer erreichen sie.'},
  ],
  phoenix: [
    {n:'Wiedergeburt', d:'Beim ersten Tod wird er zu Asche, ist 2 s unverwundbar und steht mit halben LP wieder auf. Der zweite Tod ist endgültig.'},
    {n:'Feuerspur', d:'Wo er tief über Feinde fliegt, fangen Bodentruppen kurz Feuer. Selbst fängt er kein Feuer.'},
  ],
  einhorn: [
    {n:'Hornstoß', d:'Stürmt mit dem Horn voran: der erste Stoß aus vollem Lauf macht 50 % mehr Schaden, dann läuft es durch.'},
    {n:'Heilaura', d:'Verbündete bis 70 px heilen 2 LP je Sekunde, auch neben mehreren Einhörnern nicht mehr. Ghule nicht.'},
  ],
  frosch: [
    {n:'Froschfluch', d:'Nicht malbar, entsteht durch Froschfluch: Eine Hexe verwandelt einen Gegner für 5 s, er behält seine LP.'},
    {n:'Harmlos', d:'Greift nicht an und hüpft vor Feinden weg. Ein Biss macht aus ihm keinen Ghul.'},
  ],
  // --- Task 5: Tiere ---
  elefant: [
    {n:'Trampeln', d:'Alle 20 s stürmt er 1,5 s durch die Reihen und schleudert alles zur Seite. Nur Feinde nehmen Schaden.'},
    {n:'Dickhäuter', d:'Brüllen, Spuk und Froschfluch wirken nicht auf ihn.'},
    {n:'Angst vor Bienen', d:'Kommen feindliche Bienen näher als 50 px, flieht er 1,5 s lang. Höchstens alle 6 s.'},
  ],
  krokodil: [
    {n:'Lauern', d:'Im Wasser 1,6-mal so schnell und versteckt: Feinde sehen es erst ab 60 px oder kurz nach einem Biss.'},
    {n:'Packen', d:'Alle 8 s ein Biss mit doppeltem Schaden, der das Opfer 1 s lang festhält.'},
    {n:'Schwerfällig', d:'An Land nur 70 % Tempo.'},
  ],
  gorilla: [
    {n:'Wurf', d:'Alle 12 s packt er einen leichten Gegner (bis Ritter) und wirft ihn 120 px weit in die dichteste Feindgruppe.'},
    {n:'Brustklopfen', d:'Beim ersten Kontakt, dann alle 20 s: Feinde mit weniger Leben als er fliehen 1,5 s lang.'},
  ],
  adler: [
    {n:'Sturzflug', d:'Alle 10 s stößt er auf ein Ziel herab, am liebsten auf Fernkämpfer. Der erste Treffer macht dreifachen Schaden.'},
    {n:'Hoch oben', d:'Nahkämpfer erreichen ihn nur, wenn er zum Angriff herabstößt.'},
  ],
  lama: [
    {n:'Spucke', d:'Trifft am Boden und in der Luft. Getroffene sind 2 s lang 40 % langsamer.'},
    {n:'Auf Abstand', d:'Weicht Nahkämpfern aus wie ein Schütze.'},
  ],
  bueffel: [
    {n:'Stampede', d:'Ab 3 Büffeln nah beieinander stürmt die Herde 2 s lang los und rammt alles um. Danach 20 s Pause.'},
    {n:'Herde', d:'Bleibt bei den anderen Büffeln.'},
  ],
  // --- Schrottplatz ---
  minibot: [{n:'Verbund', d:'Ab 5 Minibots nah beieinander macht jeder Schlag 25 % mehr Schaden.'}],
  laserbot: [{n:'Laser', d:'Trifft sofort, auch Flieger, und geht durch bis zu einen weiteren Gegner dahinter.'}],
  drohne: [
    {n:'Reparieren', d:'Repariert Maschinen: Roboter, Panzer und Hubschrauber. Menschen und Tiere heilt sie nicht.'},
    {n:'Bauen', d:'Liegen 2 eigene Schrotthaufen bis 70 px nah, baut sie daraus einen Minibot. Alle 6 s.'},
  ],
  kuppel: [{n:'Schildkuppel', d:'Fängt feindliche Geschosse ab, die von außen in die Kuppel (70 px) fliegen. Nach 150 Schaden 10 s Pause.'}],
  spinne: [{n:'Sprung', d:'Alle 10 s springt sie auf einen Fernkämpfer oder Heiler bis 240 px weit, auch über Mauern. Der erste Biss macht doppelt.'}],
  schweisser: [
    {n:'Schweißbrenner', d:'Jeder dritte Treffer zündet den Gegner an.'},
    {n:'Flicken', d:'Bots bis 50 px reparieren 3 LP je Sekunde, er selbst nicht.'},
  ],
  magnet: [{n:'Anziehen', d:'Alle 12 s zieht er Gegner aus Metall bis 220 px zu sich und betäubt sie kurz: Ritter, Römer, Soldaten, Roboter.'}],
  tesla: [{n:'Kettenblitz', d:'Der Blitz springt auf bis zu 5 weitere Gegner bis 80 px. Roboter nehmen doppelten Schaden.'}],
  mega: [
    {n:'Stampfen', d:'Jeder Schlag trifft alle Feinde vor ihm und stößt sie zurück.'},
    {n:'Zerfallen', d:'Beim Tod steigen 4 Minibots aus dem Wrack.'},
  ],
  // --- Urzeit ---
  hoehle: [{n:'Fackel', d:'Jeder vierte Schlag zündet den Gegner an.'}],
  speer: [{n:'Speerwurf', d:'Speere im Bogen, auch auf Flieger. Römerschilde halten sie ab.'}, {n:'Ausweichen', d:'Weicht heranstürmenden Nahkämpfern aus.'}],
  schamane: [{n:'Kräuterrauch', d:'Jungtiere bis 90 px wachsen doppelt so schnell.'}, {n:'Heilen', d:'Heilt einen Verbündeten, Fliehende zuerst.'}],
  raptor: [{n:'Anspringen', d:'Alle 10 s springt er einen Fernkämpfer oder Heiler bis 200 px weit an. Der erste Biss macht doppelt.'}],
  ptera: [{n:'Steinwurf', d:'Lässt Steine fallen: Flächenschaden an Feinden am Boden und an Mauern. Eigene und Flieger trifft er nicht.'}, {n:'Hoch oben', d:'Nahkämpfer am Boden erreichen ihn nicht.'}],
  anky: [{n:'Panzerplatten', d:'Von vorn halber Schaden durch Schläge, Pfeile und Kugeln.'}, {n:'Schwanzkeule', d:'Alle 8 s fegt er Gegner hinter und neben sich weg.'}],
  trike: [{n:'Hornwand', d:'Im Lauf von vorn halber Schaden.'}, {n:'Ansturm', d:'Alle 14 s stürmt er 1,2 s geradeaus und schleudert alles zur Seite.'}],
  rex: [
    {n:'Ei', d:'Startet als Ei mit 160 LP, schlüpft nach 8 s und wächst bis 24 s zum Riesen.'},
    {n:'Brüllen', d:'Erwachsen alle 15 s: Feinde bis 110 px mit weniger LP als er fliehen 2,5 s lang.'},
  ],
  rexei: [{n:'Schlüpfen', d:'Nicht malbar: so beginnt jeder T-Rex. Nach 8 s schlüpft er.'}],
};
for (const k in ABIL) if (UNITS[k] && !UNITS[k].abil) UNITS[k].abil = ABIL[k];

// Leistung: alle Einträge in eine gemeinsame Form bringen (dieselben Schlüssel in derselben Reihenfolge, fehlende
// als undefined, Werte unverändert). Mit dem Römer (pilum) hätte u.T sonst fünf Formen, und Zugriffe wie u.T.r
// in physics.collide würden megamorph (V8 merkt sich höchstens vier Formen je Zugriff): Kollision 0,33 → 0,67 ms
// je Schritt in tools/bench.mjs mixed. Ein Konstruktor statt {} hält die Felder im Objekt selbst (schneller als
// nachträglich angehängte), mixed 1,7 → 1,5 ms.
// paint: false = nicht malbar (Ghul; Vorgabe 3: main.js catKeys und randomBattle, bench.js und ui.js filtern), sonst true.
for (const k in UNITS) if (UNITS[k].paint === undefined) UNITS[k].paint = true;
// Wendigkeit (Nachtrag 7, #47): Chance, einer Bombe, Granate, Mörsergranate oder einem Felsbrocken auszuweichen
// (dodge.js). Jede Einheit trägt den Schlüssel dodge (gleiche Form für V8): flink etwa 60 %, normal etwa 30 % (Infanterie,
// Magier, Gorilla und alle übrigen, auch Frosch und Ghul), schwer 0–10 %. Liegende MG- und Scharfschützen und Römer im
// Block weichen nie aus (dodge.canDodge); Flieger trifft ein Bogenwurf ohnehin nicht.
// normal 30 % (unteres Ende von "etwa 35 %"): mit 35 % fiel grenadier > krieger an einer Weltform (Balance nach #47)
export const AGILITY = { flink: .6, normal: .3 };
export const NIMBLE = new Set(['wolf', 'biene', 'reiter', 'adler', 'einhorn', 'geist', 'vampir', 'spinne', 'raptor']);
export const HEAVY = { ritter: 0, troll: .05, zyklop: .05, elefant: 0, bueffel: .1, panzer: 0, mega: 0, magnet: .1, rex: 0, anky: .05, trike: .1, rexei: 0 };
for (const k in UNITS) UNITS[k].dodge = NIMBLE.has(k) ? AGILITY.flink : k in HEAVY ? HEAVY[k] : AGILITY.normal;
const UNIT_KEYS = [...new Set(Object.values(UNITS).flatMap(T => Object.keys(T)))];
function UnitType(T) { for (const p of UNIT_KEYS) this[p] = T[p]; }
for (const k in UNITS) UNITS[k] = new UnitType(UNITS[k]);

// Fledermausform des Vampirs (Spez. #32, abilities.stepBat): u.T wird für die Dauer der Form gegen diesen Typ getauscht.
// Gleiche Schlüssel und Werte wie UNITS.vampir (gleiche Form für V8, gleiche Karte), aber fliegend in 22 px Höhe mit
// doppeltem Tempo. So gelten alle Flieger-Regeln von selbst (Physik, Kollision nur mit Fliegern, über Mauern, keine
// Wegfindung, kein Wald); Nahkämpfer am Boden erreichen sie nicht (world.outOfMelee).
export const BAT_FORM = new UnitType(Object.assign({}, UNITS.vampir, { fly: 1, flyZ: 22, speed: UNITS.vampir.speed * 2 }));

// --- Urzeit: Jungtiere (abilities.stepGrow) ---
// Wer T.grow trägt, startet mit YOUNG[t] als u.T (70 % LP, 60 % Schaden, kleiner und leichter, gleiche Schlüssel wie
// UNITS[t] für V8) und bekommt nach T.grow s wieder UNITS[t] (LP im gleichen Anteil). Der T-Rex startet als Ei (u.T =
// UNITS.rexei, data egg: 1; er greift nicht an und läuft nicht) und ist von REX_HATCH s bis T.grow s ein Jungtier.
// Die Zeichnung schrumpft mit (renderer.js: Maßstab u.T.r / UNITS[t].r).
export const YOUNG_HP = .7, YOUNG_DMG = .6, YOUNG_R = .7, REX_HATCH = 8;
export const YOUNG = {};
for (const k in UNITS) {
  const T = UNITS[k];
  if (!T.grow) continue;
  YOUNG[k] = new UnitType(Object.assign({}, T, {
    hp: T.hp * YOUNG_HP, dmg: T.dmg * YOUNG_DMG, r: Math.round(T.r * YOUNG_R), mass: T.mass * YOUNG_HP,
    splash: T.splash ? Math.round(T.splash * YOUNG_R) : T.splash, speed: T.speed * 1.05,
  }));
}
// Schrottplatz-Regeln (abilities.js): Schild = SHIELD · LP, lädt nach RECHARGE_T s ohne Treffer mit RECHARGE · LP je s;
// Blitz ×LIGHTNING; Wasser betäubt Bodenroboter SHORT_T s, danach SHORT_CD s nicht wieder
export const BOT = { SHIELD: .2, RECHARGE_T: 4, RECHARGE: .1, LIGHTNING: 2, SHORT_T: .8, SHORT_CD: 3 };
// Schildkuppel: fängt feindliche Geschosse in R px ab (Schütze außerhalb), bis HP Schaden; dann DOWN s Pause
export const DOME = { R: 70, HP: 150, DOWN: 10 };
// Maschinen: Roboter (T.bot) und Fahrzeuge. Die Schrauber-Drohne (T.repair) repariert nur sie; Brüllen und Spuk
// lassen Roboter kalt (abilities.FEARLESS).
export const MACHINE = new Set(['panzer', 'heli']);
for (const k in UNITS) if (UNITS[k].bot) MACHINE.add(k);
// Metall: was der Magnet-Mech anzieht (abilities.MAGNET)
export const METAL = new Set(['ritter', 'roemer', 'krieger', 'soldat', 'mg', 'sniper', 'panzerfaust', 'moerser', 'grenadier']);
for (const k in UNITS) if (UNITS[k].bot && k !== 'mega') METAL.add(k);

// Untote: weder Sanitäter noch Heilwelle heilen sie (sonst verlöre der Zerfall der Ghule seinen Sinn)
export const UNDEAD = new Set(['ghul']);
// Hinweis, wenn im Lexikon eine nicht malbare Einheit (paint: false) angeklickt wird (ui.js)
export const MSG_NO_PAINT = 'Diese Einheit kann man nicht malen.';

// [a, b, Punkte]: a schlägt b bei gleichen Punkten. Quelle für tools/balance.mjs (über tools/plans.mjs) und die
// Charakterkarten (stark/schwach gegen, cards.js).
export const COUNTERS = [
  ['ritter', 'krieger', 60], ['ritter', 'schuetze', 60],
  ['biene', 'ritter', 60], ['biene', 'schuetze', 60],
  ['wolf', 'schuetze', 60], ['wolf', 'grenadier', 60],
  ['reiter', 'schuetze', 60], ['reiter', 'grenadier', 60],
  ['magier', 'krieger', 60], ['grenadier', 'krieger', 72],   // 72 statt 60 (18.11.): bei 60 Punkten an 1726x820 und 1400x1050 nur 5/8, schon auf dem Basis-Stand
  ['panzerfaust', 'panzer', 90], ['panzerfaust', 'heli', 90], ['soldat', 'heli', 90],
  // Lufteinheiten (18.11.): Jet jagt Flieger, Drohne stürzt sich auf teure Ziele, Bomber trifft schwere Bodentruppen
  ['jet', 'heli', 90], ['jet', 'bomber', 104], ['mg', 'jet', 90],
  ['kampfdrohne', 'sniper', 90], ['kampfdrohne', 'moerser', 90], ['mg', 'kampfdrohne', 90], ['schuetze', 'kampfdrohne', 90],
  ['bomber', 'panzer', 140], ['bomber', 'elefant', 104], ['soldat', 'bomber', 104],
  ['panzer', 'krieger', 105], ['panzer', 'soldat', 105],
  ['mg', 'biene', 90], ['mg', 'krieger', 90], ['sniper', 'ritter', 90],
  ['roemer', 'schuetze', 60], ['roemer', 'krieger', 60],
  ['grenadier', 'roemer', 60], ['reiter', 'roemer', 60], ['magier', 'roemer', 60], ['moerser', 'roemer', 90],
  // Task 7: je neue Einheit mindestens ein „schlägt“ und ein „wird geschlagen“ (Bericht Task 7: Duelltabelle, Gründe)
  ['mg', 'adler', 90], ['adler', 'sniper', 90],
  ['vampir', 'zyklop', 90],
  ['troll', 'bueffel', 90], ['krieger', 'troll', 90],
  ['zyklop', 'grenadier', 90], ['reiter', 'zyklop', 90],
  ['hexe', 'baer', 90], ['schuetze', 'hexe', 90],
  ['phoenix', 'vampir', 90], ['soldat', 'phoenix', 90],
  ['einhorn', 'schuetze', 90], ['ritter', 'einhorn', 90],
  ['elefant', 'grenadier', 96], ['panzerfaust', 'elefant', 96], ['biene', 'elefant', 96],
  ['krokodil', 'bueffel', 90], ['schuetze', 'krokodil', 90],
  // Flammenwerfer (18.11.): brennt Schwärme und dichte Blöcke weg, verliert gegen Gewehre und schnelle Reiter
  ['flamme', 'biene', 90], ['flamme', 'troll', 90], ['flamme', 'roemer', 90], ['flamme', 'krieger', 90],
  ['soldat', 'flamme', 90], ['reiter', 'flamme', 90],
  // Pikenier (18.11.): bricht jeden Ansturm, verliert gegen Fußvolk und Schützen
  ['pikenier', 'reiter', 90], ['pikenier', 'bueffel', 90], ['pikenier', 'elefant', 96],
  ['krieger', 'pikenier', 90], ['schuetze', 'pikenier', 90],
  ['gorilla', 'grenadier', 90], ['ritter', 'gorilla', 90],
  ['bueffel', 'grenadier', 90], ['ritter', 'bueffel', 90],
  // Ritter gegen Magier (Feuer und Zauber ×1,5) und Geist gegen Magier (Feuerball trifft ihn voll): als Duell festgehalten
  ['magier', 'ritter', 90],
  // König (18.11.): allein schwach gegen Fernkampf, aber zäh gegen Wurfgeschosse
  ['koenig', 'grenadier', 100], ['sniper', 'koenig', 100],
  // Lama (18.11.): Tiere gegen Flieger; Wölfe sind schneller bei ihm, als es zurückweichen kann
  ['lama', 'hexe', 90], ['lama', 'phoenix', 90], ['wolf', 'lama', 90],
  // Schrottplatz und Urzeit (18.11.): je Einheit ein „schlägt“ und ein „wird geschlagen“ (Stützen nur geschlagen)
  ['laserbot', 'krieger', 60], ['mg', 'laserbot', 90],
  ['minibot', 'schuetze', 60], ['ritter', 'minibot', 60],
  ['spinne', 'moerser', 90], ['krieger', 'spinne', 60],
  ['schweisser', 'ritter', 60], ['soldat', 'schweisser', 60],
  ['magnet', 'soldat', 90], ['schuetze', 'magnet', 60],
  ['tesla', 'biene', 90], ['reiter', 'tesla', 90],
  ['mega', 'krieger', 96], ['panzerfaust', 'mega', 96],
  ['kuppel', 'grenadier', 60], ['krieger', 'kuppel', 60], ['wolf', 'drohne', 60],
  ['hoehle', 'troll', 90], ['krieger', 'hoehle', 60],
  ['speer', 'troll', 60], ['reiter', 'speer', 60],
  ['raptor', 'schuetze', 60], ['ritter', 'raptor', 60], ['wolf', 'schamane', 60],
  ['ptera', 'ritter', 90], ['soldat', 'ptera', 90],
  ['anky', 'grenadier', 90], ['panzerfaust', 'anky', 90],
  ['trike', 'soldat', 90], ['panzerfaust', 'trike', 90],
  ['rex', 'grenadier', 96], ['panzerfaust', 'rex', 96],
];

// sp: Tempofaktor für Bodentruppen auf der Zelle (ohne: 1); haz: Lava und Mauer, die Bodentruppen meiden
// (freie Römer, Flucht). Daraus TERR_SPEED und TERR_HAZ nach id (unten).
// Synergien zwischen verschiedenen Truppen (Wunsch Silas, 18.11.: nicht nur Rudel, auch gemischte Truppen).
// a: wer den Vorteil hat, b: wer ihn auslöst. Werte und Verhalten in synergy.js (SYN); Text ≤ 140 Zeichen (Karte).
// near: wirkt, solange ein eigener Partner bis R px nah ist (Linie auf dem Feld); sonst löst ein Ereignis aus (Funken).
export const SYNERGY = [
  {k:'schild', n:'Schildschutz', a:['schuetze'], b:['ritter','roemer'], near:true, d:'Schützen bis 70 px bei einem Ritter oder Römer nehmen 40 % weniger Schaden durch Pfeile und Kugeln.'},
  {k:'zange', n:'Zange', a:['reiter'], b:['krieger','ritter','roemer'], d:'Reiter machen 40 % mehr Schaden gegen Feinde, die gerade mit eigenen Kriegern, Rittern oder Römern kämpfen.'},
  {k:'feldarzt', n:'Feldarzt', a:['ritter','roemer'], b:['sani'], d:'Sanitäter heilen Ritter und Römer 50 % stärker.'},
  {k:'jagd', n:'Jagdpartner', a:['wolf','baer'], b:['adler'], d:'Wen ein Adler trifft, ist 4 s markiert: Wölfe und Bären machen gegen ihn 30 % mehr Schaden.'},
  {k:'schreck', n:'Schreckbeute', a:['vampir','ghul'], b:['geist','gorilla','baer'], d:'Vampire und Ghule machen 50 % mehr Schaden gegen erschreckte Feinde (Spuk, Brustklopfen, Brüllen).'},
  {k:'feuerschutz', n:'Feuerschutz', a:['soldat'], b:['mg'], near:true, d:'Soldaten bis 140 px um ein eigenes MG schießen 25 % schneller.'},
  {k:'geleit', n:'Geleitschutz', a:['soldat','mg','panzerfaust'], b:['panzer'], near:true, d:'Infanterie bis 100 px um einen eigenen Panzer nimmt 30 % weniger Schaden durch Kugeln, Pfeile und Explosionen.'},
  {k:'klebrig', n:'Klebrig', a:['schuetze','soldat','mg','sniper'], b:['lama'], d:'Von Lamaspucke Gebremste nehmen 25 % mehr Schaden durch Pfeile und Kugeln.'},
  {k:'klinge', n:'Zauberklinge', a:['krieger','ritter','reiter','roemer'], b:['magier'], near:true, d:'Nahkämpfer der Armee bis 130 px um einen eigenen Magier setzen ihr Ziel in Brand, höchstens alle 3 s.'},
  {k:'turm', n:'Kriegselefant', a:['schuetze'], b:['elefant'], near:true, d:'Schützen bis 80 px um einen eigenen Elefanten machen 30 % mehr Schaden.'},
];

export const TERRAIN = {
  wasser:{n:'Wasser',id:1,cost:.04,sp:.4,d:'Bremst Bodentruppen auf 40 % Tempo.'},
  lava:{n:'Lava',id:2,cost:.12,sp:.8,haz:true,d:'Verbrennt alles, was nicht fliegt. Niemand läuft freiwillig hinein, Hineingeschleuderte laufen sofort heraus.'},
  wald:{n:'Wald',id:3,cost:.04,sp:.85,d:'Deckung: halber Schaden durch Pfeile und Explosionen. Feuer setzt ihn in Brand.'},
  mauer:{n:'Mauer',id:4,cost:.1,haz:true,d:'Blockiert Bodentruppen, bis sie zerschlagen wird.'},
  // Asche (Waldbrand, wildfire.js): entsteht aus verbranntem Wald, frei begehbar, keine Deckung; nicht malbar
  asche:{n:'Asche',id:5,cost:0,paint:false,d:'Verbrannter Wald: keine Deckung mehr.'},
  radierer:{n:'Radierer',id:0,cost:0,d:'Entfernt Einheiten und Gelände unter dem Pinsel.'},
};
// Nach Gelände-id (0 = frei): Tempofaktor (physics.integrate, formation.march) und Gefahr (formation.hazardAt).
// Hier statt in physics.js, weil formation.js physics.js nicht importieren kann (Kreis über combat.js, das FORM
// schon beim Laden liest).
export const TERR_SPEED = [], TERR_HAZ = [];
for (const k in TERRAIN) { const T = TERRAIN[k]; TERR_SPEED[T.id] = T.sp ?? 1; TERR_HAZ[T.id] = !!T.haz; }

export const PLURAL = {krieger:'Krieger',schuetze:'Schützen',ritter:'Ritter',grenadier:'Grenadiere',reiter:'Reiter',roemer:'Römer',sani:'Sanitäter',wolf:'Wölfe',baer:'Bären',biene:'Bienen',magier:'Magier',geist:'Geister',drache:'Drachen',soldat:'Soldaten',mg:'MG-Schützen',sniper:'Scharfschützen',panzerfaust:'Panzerfäuste',moerser:'Mörser',panzer:'Panzer',heli:'Hubschrauber',vampir:'Vampire',ghul:'Ghule'};
// --- Task 6: Kreaturen ---
Object.assign(PLURAL, {troll:'Trolle',zyklop:'Zyklopen',hexe:'Hexen',phoenix:'Phönixe',einhorn:'Einhörner',frosch:'Frösche'});
// --- Task 5: Tiere ---
Object.assign(PLURAL, {koenig:'Könige', lama:'Lamas'});
Object.assign(PLURAL, {flamme:'Flammenwerfer', pikenier:'Pikeniere'});
Object.assign(PLURAL, {jet:'Kampfjets',kampfdrohne:'Kampfdrohnen',bomber:'Bomber'});
Object.assign(PLURAL, {elefant:'Elefanten',krokodil:'Krokodile',gorilla:'Gorillas',adler:'Adler',bueffel:'Büffel'});
// --- Schrottplatz und Urzeit ---
Object.assign(PLURAL, {minibot:'Minibots',laserbot:'Laserbots',drohne:'Schrauber-Drohnen',kuppel:'Schildkuppeln',spinne:'Springspinnen',schweisser:'Schweißer',magnet:'Magnet-Mechs',tesla:'Teslaspulen',mega:'Mega-Mechs',
  hoehle:'Höhlenmenschen',speer:'Speerwerfer',schamane:'Schamaninnen',raptor:'Raptoren',ptera:'Flugsaurier',anky:'Ankylosaurier',trike:'Triceratopse',rex:'T-Rexe',rexei:'Dino-Eier'});

export const CATEGORIES = [['armee','Armee'],['tiere','Tiere'],['mythisch','Mythisch'],['modern','Modern'],['schrott','Schrottplatz'],['urzeit','Urzeit'],['gelaende','Gelände']];

export const TEAMS = {blau:{n:'Blau',c:'#3f7cff',body:'#5b8def'},rot:{n:'Rot',c:'#ff4d4d',body:'#ef5d55'},gruen:{n:'Grün',c:'#2fbf6b',body:'#4fc07a'},gelb:{n:'Gelb',c:'#ffb800',body:'#ffc533'}};

// Typen, deren Körper die Teamfarbe trägt (Vampir: der Umhang; der Ghul zeigt sein Team an Lumpen und Teamring, rig.js)
export const TINT = new Set(['koenig','krieger','schuetze','grenadier','magier','reiter','roemer','soldat','mg','sniper','panzerfaust','moerser','panzer','heli','jet','kampfdrohne','bomber','vampir']);

// Fernkämpfer (Zielvorlieben von Geist/Reiter, KI)
export const RANGED = new Set(['lama','schuetze','grenadier','magier','soldat','mg','sniper','panzerfaust','moerser']);
// --- Task 6: Kreaturen --- (Hexe und Zyklop: Geister und Reiter jagen sie bevorzugt)
RANGED.add('hexe'); RANGED.add('zyklop');
// Schrottplatz und Urzeit
RANGED.add('laserbot'); RANGED.add('tesla'); RANGED.add('speer');

// Nachtrag 7 (#47): M2 par 70 → 75 (letztes Mittel): die Schützen weichen den Bomben jetzt aus, 12 Ritter + 4 Grenadiere
// gewannen nur noch 3–6/8; Ritter-LP oder Schützen-LP zu ändern brach biene > ritter bzw. roemer > schuetze. Smart: 14 + 3.
// Task 7: M2 (Pfeilregen) Budget 100 → 95: 33 Römer gewannen dort an zwei Formen 4/8 (Römer-Spam muss verlieren), 31
// verlieren 8/8; der Smart-Plan (70 = par) bleibt. M3 und M6 par +5 (Bienen 0,55 statt 0,5, #37), Pläne in tools/plans.mjs.
// M5 (Die Festung): Budget 110 → 80 und 26 statt 16 Schützen (finale Prüfung der Römer-Runde). Die Schilde halten die
// Pfeile von vorn, die Feuerbälle der Magier treffen innen oft die eigene Mauer und die eigenen Schützen: 36 Römer
// gewannen 6–8/8, schon 23 (unter par) holten drei Sterne. Mit den Römerwerten allein nicht zu trennen (gleiche
// Stärke je Punkt wie in den Duellen roemer > schuetze und roemer > krieger). Smart (14 Magier) gewinnt weiter 8/8.
// Placement: ['rect',type,n,x0,y0,x1,y1] | ['circle',type,n,cx,cy,rr] | ['unit',type,x,y]
//          | ['tRect',terKey,x0,y0,x1,y1] | ['tCircle',terKey,cx,cy,rr,inner?]
// Koordinaten: x in Anteilen des Missionsrahmens (world.frameX), y in Anteilen von H, Radien in Anteilen
// von H. Einheiten gehören dem Team 'rot'.
export const MISSIONS = [
  {n:'Erster Zusammenstoß',budget:60,par:43,hint:'Wähle Krieger, male deine Armee links der Linie und drück Los. Für drei Sterne: Ritter halten mehr aus.',place:[['rect','krieger',24,.70,.36,.80,.64]]},
  {n:'Pfeilregen',budget:92,par:84,hint:'Hinter der Front warten Schützen. Ritter im Schildwall halten Pfeile aus, schnelle Reiter und Wölfe sind schnell bei ihnen. Vorsicht: Bomben treffen auch die eigenen Ritter.',place:[['rect','krieger',20,.62,.36,.67,.64],['rect','schuetze',26,.8,.28,.88,.72]]},
  {n:'Eiserne Front',budget:110,par:90,hint:'Ein Schildwall aus Rittern. Bomben und Feuer treffen sie voll, und ein Bienenschwarm findet jede Lücke.',place:[['rect','ritter',16,.66,.28,.73,.72],['rect','sani',5,.8,.4,.84,.6]]},
  {n:'Über den Fluss',budget:120,par:90,hint:'Wasser bremst Bodentruppen auf 40 %. Geister schweben drüber, Reiter sind trotzdem schnell drüben.',place:[['tRect','wasser',.47,0,.58,1],['rect','schuetze',22,.7,.28,.78,.72],['rect','grenadier',10,.82,.38,.86,.62],['rect','magier',4,.88,.42,.9,.58]]},
  {n:'Die Festung',budget:122,par:112,hint:'Mauern stoppen Bodentruppen. Magier schießen weiter als Schützen, Geister schweben einfach hinein.',place:[['tCircle','mauer',.8,.5,.3,.25],['circle','magier',8,.8,.5,.09],['circle','schuetze',26,.8,.5,.19]]},
  {n:'Wilde Jagd',budget:120,par:110,cats:['tiere','gelaende'],hint:'Nur Tiere. Gegen Ritter hilft Masse: ein großes Rudel oder ein richtiger Schwarm.',place:[['rect','reiter',18,.68,.26,.76,.74],['rect','ritter',14,.8,.3,.86,.7]]},
  {n:'Lavafeld',budget:110,par:93,hint:'Die Lava lässt nur eine Lücke. Bären und Wölfe stürmen durch. Halte sie mit Schützen weit hinten und breit verteilt auf Abstand.',place:[['tRect','lava',.5,0,.56,.42],['tRect','lava',.5,.58,.56,1],['rect','baer',6,.7,.35,.76,.65],['rect','wolf',16,.8,.3,.86,.7]]},
  {n:'Drachenhort',budget:230,par:228,hint:'Zwei Drachen, ein Schwarm und ein Schildwall. Bomben und Feuer gegen den Schwarm, Pfeile gegen die Drachen.',place:[['unit','drache',.78,.35],['unit','drache',.78,.65],['circle','biene',36,.72,.5,.16],['rect','ritter',10,.86,.3,.9,.7]]},
  {n:'Stahlgewitter',budget:150,par:120,hint:'Zwei Panzer, Infanterie und ein Hubschrauber. Panzerfäuste knacken Panzer. Nahkämpfer erreichen den Hubschrauber nicht.',place:[['unit','panzer',.73,.36],['unit','panzer',.73,.64],['rect','soldat',18,.63,.3,.67,.7],['rect','mg',4,.78,.4,.8,.6],['unit','heli',.86,.5]]},
];
