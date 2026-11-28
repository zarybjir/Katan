// Tabulky hry. Čísla se ladí tady, ne v kódu.
export const NAME = 'Osadníci';
export const PROTO = 12;

// ---------- suroviny a dílky ----------
export const RES = ['wood', 'stone', 'grain', 'sheep', 'brick'];
export const RES_NAME = { wood: 'dřevo', stone: 'kámen', grain: 'obilí', sheep: 'ovce', brick: 'cihly' };
export const RES_COLOR = { wood: '#2f7d4a', stone: '#7f8792', grain: '#e2b93b', sheep: '#8bb83a', brick: '#b4533a' };
export const TERRAIN = { forest: 'wood', quarry: 'stone', field: 'grain', pasture: 'sheep', claypit: 'brick', waste: null };
export const TERRAIN_NAME = { forest: 'les', quarry: 'skály', field: 'pole', pasture: 'pastvina', claypit: 'hliniště', waste: 'pustina' };
// obrázky dílků v gfx/ (bez přípony .jpg); víc variant = víc položek v poli
export const TERRAIN_GFX = { forest: ['les-1', 'les-2'], quarry: ['skaly-1'], field: ['pole-1'], pasture: ['pastvina-1'], claypit: ['hliniste-1'], waste: ['pustina-1'] };
// hotové šestiúhelníkové dílky s okrajem (špičkou nahoru); když chybí, použije se TERRAIN_GFX
export const TERRAIN_HEX = { forest: ['hex-les', 'hex-les-2'], quarry: ['hex-skaly', 'hex-skaly-2'], field: ['hex-pole'], pasture: ['hex-pastvina'], claypit: ['hex-hliniste'], waste: ['hex-pustina'] };
// úprava obrázků krajin (CSS filtr): les je příliš tmavý a kontrastní
export const TERRAIN_FILTER = { quarry: 'brightness(1.08) contrast(0.9)' };
export const TERRAIN_COLOR = { forest: '#3c8f55', quarry: '#9aa1aa', field: '#ecc94f', pasture: '#9fcf5a', claypit: '#c2673f', waste: '#d9cfb4' };

// ---------- stavby ----------
export const COST = {
  road: { wood: 1, brick: 1 },
  settle: { wood: 1, brick: 1, grain: 1, sheep: 1 },
  city: { stone: 3, grain: 2 },
  card: { grain: 1, sheep: 1, stone: 1 },
};
export const KIND_NAME = { road: 'cesta', settle: 'osada', city: 'město', card: 'výprava' };
export const KIND_TEXT = {
  road: 'Vede od vlastní stavby nebo cesty. Bez cesty nelze stavět dál. Nejdelší cesta dává bonus.',
  settle: '1 bod. Dostává suroviny ze sousedních dílků. Nesmí stát hned vedle jiné stavby.',
  city: '2 body. Vzniká z vlastní osady a dostává dvojnásobek surovin.',
  card: 'Náhodná karta: hlídka, stavitelé, zásoby nebo objev (1 bod). Zahrát ji lze od dalšího tahu.',
};
export const PIECES = { road: 16, settle: 6, city: 4 };

// ---------- mapa ----------
export const MAPSIZE = { 2: 16, 3: 19, 4: 22, 5: 27, 6: 31 }; // počet dílků podle počtu hráčů
// typy map (tvar pevniny); klíč se ukládá do nastavení
export const MAPS = { sym: 'Souměrný ostrov', symrand: 'Souměrný ostrov – náhodná čísla', island: 'Ostrov', bays: 'Zátoky', atoll: 'Atol', isthmus: 'Šíje', ridge: 'Hřeben' };
export const MAP_TEXT = {
  sym: 'Pravidelný šestiúhelník; čísla ve spirále od okraje ke středu.',
  symrand: 'Pravidelný šestiúhelník; čísla náhodně, stejná čísla ani 6 a 8 nesousedí.',
  island: 'Sevřený ostrov, krátké vzdálenosti.',
  bays: 'Členité pobřeží s výběžky, hodně přístavů.',
  atoll: 'Prstenec pevniny kolem laguny.',
  isthmus: 'Dvě pevniny spojené úzkou šíjí.',
  ridge: 'Dlouhý úzký pás pevniny.',
};
export const PORTS_ANY = 4; // počet přístavů 3:1 (2:1 je po jednom pro každou surovinu)
// souměrný ostrov: čísla se kladou ve spirále od okraje ke středu (pustina se přeskočí) v tomto
// pořadí; posloupnosti jsou vlastní, nalezené tak, aby pro každou polohu pustiny šlo zvolit začátek
// a směr spirály, při kterém stejná čísla ani 6 a 8 nesousedí. Klíč = počet dílků s číslem.
export const SPIRAL = {
  18: [11, 4, 5, 12, 6, 4, 5, 8, 11, 9, 2, 10, 8, 3, 10, 3, 6, 9],
  29: [5, 9, 6, 9, 11, 8, 11, 11, 8, 6, 10, 12, 6, 10, 4, 5, 4, 9, 3, 5, 9, 3, 4, 3, 6, 10, 8, 2, 5],
};
// poměr krajin (podle pravidel deskové hry: les, pastvina, pole po 4, hliniště a skály po 3);
// pro jinou velikost mapy se přepočítá a zaokrouhlí
export const TERRAIN_SHARE = { forest: 4, pasture: 4, field: 4, claypit: 3, quarry: 3 };
export const NUMS = [6, 8, 5, 9, 4, 10, 3, 11, 5, 9, 6, 8, 4, 10, 2, 12, 3, 11]; // pořadí přidělování čísel
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// ---------- pravidla ----------
export const RULES = {
  target: 10,        // výchozí cílový počet bodů
  discardOver: 8,    // při bouři odhazuje, kdo má víc karet
  bankRate: 4, portRate: 3, portResRate: 2,
  longMin: 5, longPts: 2,     // nejdelší cesta
  guardMin: 3, guardPts: 2,   // nejvíc zahraných hlídek
  maxOffers: 3,      // nabídek obchodu za tah
};
export const bankSize = n => 14 + 3 * n; // karet každé suroviny v bance
export const CARDS = { guard: 'hlídka', roads: 'stavitelé', supply: 'zásoby', point: 'objev' };
export const CARD_TEXT = {
  guard: 'Přesune bouři a vezme kartu sousedovi.',
  roads: 'Dvě cesty zdarma.',
  supply: 'Dvě suroviny z banky podle výběru.',
  point: 'Jeden vítězný bod. Nezahrává se.',
};
export const deckFor = n => { const k = n > 4 ? 1.4 : 1; return { guard: Math.round(11 * k), roads: Math.round(3 * k), supply: Math.round(3 * k), point: Math.round(4 * k) }; };

// ---------- hráči a boti ----------
// paleta barev hráčů; hráč si barvu vybírá při zakládání hry (index do palety je v stavu hry `colors`)
export const COLORS = ['#ff2b2b', '#1f7bff', '#ffffff', '#ff9500', '#a640ff', '#00c9a7', '#2b2b2b', '#ff3fae'];
export const COLOR_NAME = ['červená', 'modrá', 'bílá', 'oranžová', 'fialová', 'tyrkysová', 'černá', 'růžová'];
export const COLOR_LIGHT = [false, false, true, false, false, false, false, false]; // světlá barva = tmavé písmo
export const BOT_NAMES = ['Alba', 'Bruno', 'Cyril', 'Dora', 'Emil', 'Flora'];
export const BOT_LEVEL = { easy: 'lehký', mid: 'střední', hard: 'těžký' };
// váhy rozhodování botů: noise = náhodný šum v ohodnocení, trade = obchoduje, block = cílí bouří na vedoucího
export const BOT = {
  easy: { noise: 0.6, trade: false, block: false, plan: false },
  mid: { noise: 0.15, trade: true, block: false, plan: true },
  hard: { noise: 0.03, trade: true, block: true, plan: true },
};

// přednost cílů bota: o kolik chybějících karet smí být stavba dál než levnější možnost
export const BOT_BIAS = { city: 1.5, settle: 1.5, road: 0.5, card: 0 };
export const BOT_OFFER = 0.2; // šance, že bot v tahu podá nabídku, když mu chybí jedna surovina

// ---------- síť ----------
export const NET = { maxMsg: 16000, maxRate: 30, turnLimit: 120, botDelay: 1600, botAfterRoll: 4600, lanPort: 47600, ping: 5, dead: 16 };
export const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]; // sem patří i TURN relé
