# Osadníci – pokyny pro Claude

Tahová strategie pro 2–6 hráčů na mapě ze šestiúhelníků: hod kostkami přináší suroviny, hráči
staví cesty, osady a města, obchodují a soupeří o vítězné body. Android aplikace (APK) s hrou
na jednom zařízení, po místní síti i přes internet, s boty. **Server hry běží na zařízení, které
hru založilo** – žádný vlastní herní server neexistuje.

Název hry je „Osadníci“ (dříve Souostroví; repo se jmenuje Katan); mění se v `NAME` v `data.js`
a v `strings.xml`.

Hra je vlastní dílo v žánru „osidlování hexové mapy, suroviny z kostek, obchod“. Mechaniky žánru
jsou v pořádku, ale **nepřebírej nic konkrétního z existujících deskových ani počítačových her** –
název, rozložení mapy, vzhled dílků a figurek, texty a názvy karet, přesné ceníky a počty.
Téma (ostrovy, přístavy, bouře), grafika, texty i čísla jsou původní; čísla se ladí simulací botů.

## Co má hra splnit

Každou změnu poměřuj těmito body.

1. **Pravidla jsou na jednom místě a platí pro všechny stejně.** Člověk, bot i vzdálený hráč
   posílají stejné akce stejnému jádru. Co jádro nepovolí, nejde zahrát odnikud.
2. **Hostitel rozhoduje, klient jen zobrazuje.** Klient nikdy nepočítá výsledek sám (kostky, karty,
   body). Dostane jen to, co smí vidět – cizí karty v ruce k němu vůbec nedorazí.
3. **Hra se nesmí zaseknout.** Odpojený hráč, zavřená aplikace, bot bez tahu – vždy existuje cesta
   dál (časový limit tahu, bot převezme hráče, hráč se může vrátit).
4. **Tempo je sledovatelné, ale nezdržuje.** Zadavateli bylo všechno moc rychlé: bot dělá akci
   po `NET.botDelay` (1,6 s), po hodu čeká `NET.botAfterRoll` (4,6 s), až doběhnou kostky
   a rozdávání. Kostky lze přeskočit klepnutím. Obchodní nabídka nezdržuje hru déle než pár vteřin.
5. **Stav je čitelný na telefonu.** Je vidět, kdo je na tahu, co se právě stalo (kdo co dostal)
   a co můžu udělat. Místa, kde lze stavět, se zvýrazní; neplatná akce jde poznat předem, ne až
   z chybové hlášky.
6. **Stejná hra ve všech režimech.** Jedno zařízení, místní síť i internet se liší jen přenosem
   zpráv. Žádná pravidla ani obrazovky jen pro jeden režim (kromě předání zařízení).
7. **Boti jsou použitelní soupeři.** Hrají platně, staví smysluplně, reagují na obchod. Tři
   obtížnosti se liší kvalitou rozhodování, ne podváděním (bot nevidí víc než hráč).

### Návrh pravidel (výchozí, lze měnit)

- **Mapa** se generuje ze seedu; velikost podle počtu hráčů. Typ mapy určuje tvar pevniny
  (`MAPS` v `data.js`, tvary v `SHAPES` v `mapgen.js`): souměrný ostrov (šestiúhelník 19 dílků,
  pro 5–6 hráčů 31) se spirálou čísel, souměrný ostrov s náhodnými čísly (`symrand`), ostrov,
  zátoky, atol, šíje, hřeben. Počty krajin podle poměru `TERRAIN_SHARE` (les, pastvina, pole po 4,
  hliniště a skály po 3; na 19 dílcích přesně 4/4/4/3/3 + pustina).
  Pevnina je vždy souvislá (lodě nejsou). Nový typ = záznam v `MAPS`, `MAP_TEXT`, `SHAPES` a test tvaru.
  Při zakládání hry náhled ukazuje přesně tu mapu, na které se bude hrát (krajiny, čísla, přístavy),
  s ukázkovým úvodním rozmístěním osad a cest v barvách míst (rozmístí ho boti, jen pro ilustraci); u náhodných tvarů jde tvar vyměnit tlačítkem Jiný tvar. Dílky: les (dřevo), skály (kámen),
  pole (obilí), pastvina (ovce), hliniště (cihly), pustina (nic). Každý dílek kromě pustiny má číslo
  2–12 bez 7; 6 a 8 nesousedí a stejná čísla také ne (test na 1000 mapách každého typu). Souměrný
  ostrov klade čísla ve spirále od okraje ke středu podle vlastních posloupností `SPIRAL` v `data.js`
  (náhodný roh a směr, vybere se první, která splní pravidla); ostatní mapy náhodně s návratem.
  Přístavy: 2:1 pro každou z pěti surovin na hraně pobřeží, jejíž vrchol sousedí se dvěma dílky;
  3:1 (`PORTS_ANY`, 4) přednostně na hranách, kde oba vrcholy sousedí jen s jedním dílkem.
  Přístavy nesmí sousedit (ani společný, ani sousední vrchol): rozmisťují se rovnoměrně po nejdelším
  cyklu pobřeží a ze všech posunů se vybere nejlepší; test to hlídá na 1000 mapách každého typu.
- **Tah:** hod dvěma kostkami → dílky s tím číslem dají surovinu sousedním osadám (1) a městům (2)
  → obchod a stavba v libovolném pořadí → konec tahu.
- **Stavby:** cesta na hraně, osada na vrcholu (ne vedle jiné osady, napojená na vlastní cestu),
  město jako vylepšení osady. Úvodní rozmístění: každý dvě osady s cestou, druhé kolo v opačném
  pořadí.
- **Bouře** (padne 7): hráči s příliš mnoha kartami polovinu odhodí, hráč na tahu přesune bouři
  na jiný dílek (ten nevyrábí) a vezme náhodnou kartu jednomu sousedovi.
- **Obchod:** s bankou v pevném poměru, výhodněji přes přístav na pobřeží, mezi hráči nabídkou
  („dám–chci“), kterou ostatní přijmou, odmítnou nebo upraví.
- **Výpravy** (karty kupované za suroviny, skryté): zahnání bouře, stavba cest zdarma, suroviny
  z banky, vítězný bod. Přibudou až po fungujícím jádru.
- **Body:** osada 1, město 2, nejdelší cesta a největší počet zahraných výprav bonus. Vyhrává, kdo
  na svém tahu dosáhne cílového počtu (výchozí 10, volitelné v nastavení hry).

Texty ve hře jsou česky, v neutrálním tónu (bez vykřičníků, žertů a oslovování hráče).

## Jak pracovat (šetři kód i tokeny)

1. **Než něco napíšeš, najdi, jestli to už neexistuje.** Grepni název nebo podobnou funkci.
2. **Nejmenší změna, která funguje.** Žádné refaktory ani „úklid“, o které nikdo nežádal.
   Nepřidávej abstrakce pro jedno použití.
3. **Žádné npm ani build krok pro hru.** Hra běží offline ze složky `hra/`. Závislosti jen
   v Android obalu a jen ty vyjmenované níže.
4. **Nečti celé velké soubory.** Grepni název funkce a čti jen okolí.
5. **Čísla laď v datech, ne v kódu.** Ceny, počty dílků, limity a bodování jsou v `data.js`.
6. **Pravidlo patří do `core/`, nikam jinam.** Když se v `ui/` nebo v `net/` objeví podmínka
   typu „smí hráč…“, je to chyba – UI se ptá jádra (`legal`).
7. Když zadání jde udělat jednodušeji, než bylo popsáno, řekni to dřív, než začneš psát.

## Architektura

```
klient (UI) ──akce──▶ přenos ──▶ HOSTITEL: core.apply(stav, akce) ──▶ pohled pro každého hráče
     ▲                                  ▲                                    │
     └──────────── pohled + události ───┼────────────────────────────────────┘
                                   boti (stejné akce)
```

- **Stav** je jeden prostý objekt (jde přes `JSON.stringify`): mapa, hráči, ruce, banka, fáze,
  kdo je na tahu, stav generátoru náhody. Žádné třídy, funkce ani odkazy na DOM uvnitř stavu.
- **Akce** je prostý objekt `{t:'build', kind:'road', at:…}`. `apply(stav, hráč, akce)` ji ověří,
  změní stav a vrátí **události** (co se stalo – pro animace a deník). Neplatná akce stav nezmění
  a vrátí chybu.
- **`legal(stav, hráč)`** vrací všechny dovolené akce. Používá ho UI (zvýraznění), boti (výběr)
  i testy (náhodné hry).
- **`view(stav, hráč)`** vrací stav bez toho, co hráč nesmí vidět (cizí ruce a výpravy jen jako
  počty, balíček jen jako počet, stav generátoru náhody vůbec).
- **Náhoda** jen přes generátor se seedem uložený ve stavu. Žádné `Math.random()` v `core/`
  ani v botech – stejný seed a stejné akce dají stejnou hru (přehrání, testy, hlášení chyb).
- **Hostitel** drží jediný pravý stav, přijímá akce, po každé pošle každému hráči jeho pohled
  a události. Hra jednoho hráče proti botům je totéž s přenosem v paměti.
- **Klient** nemá kopii pravidel pro rozhodování; seznam dovolených akcí dostává v pohledu.

### Přenos

Jedno rozhraní (`connect`, `send`, `onMessage`, `onClose`), čtyři implementace:

| Přenos | Použití | Jak |
|---|---|---|
| `mem` | jedno zařízení, boti, testy | volání funkcí v paměti |
| `tabs` | vývoj v prohlížeči | `BroadcastChannel` mezi záložkami |
| `lan` | místní síť (Wi-Fi, hotspot) | WebSocket server v Android obalu hostitele |
| `rtc` | internet | WebRTC datový kanál přímo mezi zařízeními |

- **Místní síť:** hostitel spustí v aplikaci WebSocket server (Kotlin), ohlásí hru přes NSD
  (mDNS) a ukáže adresu. Klient hru najde v seznamu nebo zadá adresu. Funguje bez internetu.
  QR kód zatím není.
- **Internet:** telefon za mobilním operátorem nebo domácím routerem nepřijme příchozí spojení,
  takže WebSocket server přes internet nestačí. Proto WebRTC: data jdou přímo mezi zařízeními
  a hostitel zůstává serverem hry. K navázání spojení je ale potřeba krátká výměna adres
  (signalizace) přes veřejnou službu: veřejný signalizační broker PeerJS + veřejné STUN servery,
  kód hry = id hostitele. Herní data přes ně nejdou.
- **Hra musí jít i mezi různými sítěmi** (požadavek zadavatele). Na části mobilních sítí
  (symetrický NAT) se přímé spojení nenaváže; pro ně je záložní cesta přes TURN relé. Adresa
  a přístup k relé jsou v `data.js` (`ICE`), aby šla služba vyměnit bez zásahu do kódu. Zprávy
  hry jsou malé (jednotky kB na tah), takže stačí bezplatný tarif. Když se nepovede ani to,
  aplikace to hráči řekne srozumitelně.
- **Jedno zařízení (předávání):** mezi tahy lidí je obrazovka „předej zařízení hráči X“, aby
  nebyly vidět cizí karty.
- **Zprávy** jsou JSON s polem `t`. Klient → hostitel: `hello` (jméno, token, verze), `action`,
  `ping`. Hostitel → klient: `lobby`, `view` (pohled + události + pořadové číslo), `error`, `pong`.
  Verze protokolu je konstanta `PROTO`; při neshodě hostitel spojení odmítne s hláškou
  „rozdílná verze aplikace“.
- **Hlídání spojení:** klient posílá `ping` každých `NET.ping` s; kdo `NET.dead` s nic neslyší,
  spojení zavře (klient i hostitel). WebRTC samo výpadek hlásí pozdě nebo vůbec.
- **Návrat do hry:** klient si pamatuje token; po opětovném připojení dostane celý aktuální
  pohled. Po vypršení limitu převezme odpojeného hráče bot, hráč si ho může vzít zpět.
- **Hostitel odejde = hra stojí.** Hostitel stav po každé akci ukládá a hru umí znovu otevřít;
  ostatní se připojí zpět stejným kódem. Přenos role hostitele na jiné zařízení se nedělá.
- Hostitel **nevěří klientovi**: ověřuje, že akce patří hráči daného spojení, omezuje velikost
  a četnost zpráv, neplatný JSON zahodí.

## Struktura

Soubory vznikají postupně – když soubor ještě neexistuje, založ ho podle tohoto rozdělení.
Hra používá **ES moduly** (`<script type="module">`, `import`/`export`); stejné soubory načítá
prohlížeč, WebView i Node v testech.

- `hra/index.html` – kostra stránky a `js/app.js`.
- `hra/js/data.js` – tabulky: suroviny, dílky, ceny staveb, velikosti map, limity, bodování, `PROTO`.
- `hra/js/core/` – pravidla, bez DOM a bez sítě:
  - `hex.js` – souřadnice dílků (axiální), vrcholy a hrany, sousednosti. Jediné místo s geometrií.
  - `mapgen.js` – generování mapy ze seedu a kontrola vyváženosti.
  - `state.js` – založení hry, `view`. `rules.js` – `legal` a `apply`.
  - `score.js` – body, nejdelší cesta. `rng.js` – generátor se seedem.
- `hra/js/bot/` – `bot.js` (výběr akce z `legal` podle ohodnocení), `eval.js` (ohodnocení pozic,
  staveb a obchodu), obtížnosti jako tabulka vah v `data.js`.
- `hra/js/net/` – `host.js` (místnost, hráči, tokeny, limity, ukládání), `client.js`,
  `proto.js` (tvary zpráv a jejich kontrola), `transport-*.js` (viz Přenos).
- `hra/js/ui/` – `board.js` (kreslení mapy na canvas, výběr místa dotykem, posun a zoom),
  `hud.js` (herní obrazovka: hráči, ruka, tlačítka akcí, deník), `trade.js` (dialogy obchodu,
  odhození a výprav), `menu.js` (nabídka, založení hry, připojení, lobby), `text.js` (věty do
  deníku), `dom.js` (`h()`, dialogy, značky hráčů), `icons.js` (SVG ikonky surovin a ukazatelů),
  `anim.js` (hod kostkami, rozdávání surovin z dílků, suroviny do banky a z banky – ikonka banky
  vpravo nahoře na mapě; jen vizuální vrstva `#fx`,
  stav se mění hned; zapínají se v nastavení `so-set.anim`; rychlost letu surovin `so-set.anim.speed`
  = `fast`/`mid`/`slow`, tabulka `SPEEDS` v `anim.js`). Animace spouští `G.animate(události)`
  po překreslení.
- `hra/js/app.js` – start, přepínání obrazovek, relace hostitele a klienta, ukládání nastavení.
- `hra/lib/peerjs.min.js` – jediná cizí knihovna (MIT), načítá se až při hře přes internet. Nečti ji.
- `hra/gfx/` – obrázky dílků (`<krajina>-<varianta>.jpg`, 640×640, JPEG kvalita 80; seznam
  variant je `TERRAIN_GFX` v `data.js`; úprava jasu a kontrastu je `TERRAIN_FILTER`). Les jsou
  dva klidné obrázky `les-1/2.jpg`, dotónované při zmenšení do tmavší modrozelené, aby se nepletly
  s pastvinou). Dílek bez obrázku se kreslí barvou a značkou.
  Hotové šestiúhelníkové dílky s okrajem jsou `hex-*.webp` (`TERRAIN_HEX`), zapínají se
  konstantou `HEX_TILES` v `board.js` (zatím vypnuto, čeká na rozhodnutí zadavatele).
  Další malovaná grafika: `res-*.webp` a `banka.webp` (žetony, `icons.js`), `boure.webp` (mapa),
  `fig-osada.webp`, `fig-mesto.webp` (bílé figurky, `board.js` je obarví na barvu
  hráče), `btn-wood.webp`, `btn-brass.webp`, `ramecek.webp` (CSS `border-image`), `drevo-*.jpg`, `more.jpg`,
  `pozadi-menu.jpg`, `karta-<druh>.jpg`. Obrázky na zeleném pozadí se klíčují skriptem (zelená →
  průhlednost), ořezávají a ukládají jako WebP; originály do repa nejdou. Ikona aplikace je
  `app/src/main/res/drawable-nodpi/ic_launcher_img.png` a `mipmap-*/ic_launcher.png`.
  Originály od zadavatele se zmenšují, do repa jdou jen zmenšené. Zvuky nejsou soubory: skládá je
  `hra/js/ui/sound.js` přes WebAudio (`sfx.dice()`, `sfx.gain(r)` …), spouští je `G.animate`
  podle událostí; vypínají se v nastavení `so-set.anim.sound`.
  `hra/tests/` – testy, `hra/tests/out/` – snímky z testu (necommitují se).
- `app/` – Android obal (Kotlin). Hra je běžná aplikace na celou obrazovku: žádný adresní
  řádek, žádné otevírání v prohlížeči, běh bez internetu. WebView je jen vykreslovací plocha.
  - `MainActivity.kt` – WebView načítá hru přes `WebViewAssetLoader` ze stálého https originu
    (aby přežilo `localStorage`), drží obrazovku zapnutou během hry.
  - `LanServer.kt` – WebSocket server (knihovna `org.java-websocket`), jen přeposílá text mezi
    spojeními a WebView hostitele. **Nezná pravidla.**
  - `Bridge.kt` – `@JavascriptInterface`: `startServer`, `stopServer`, `send(id, text)`,
    zpětná volání `onOpen/onMessage/onClose`, NSD ohlášení a hledání, místní IP adresa.
  - Hostování běží ve foreground službě s oznámením, jinak Android server po zhasnutí
    obrazovky ukončí.
  - Klient se k `ws://` adrese v místní síti připojuje přes `Bridge` (`wsConnect`), ne přes
    WebSocket stránky – ta má https origin a nešifrované spojení by prohlížeč mohl odmítnout.
  - Smlouva mostu (názvy metod a zpětných volání `AndroidCb`) je popsaná v `Bridge.kt`
    a používá ji jen `net/transport-lan.js` a `app.js`. Měnit vždy obě strany najednou.
  - `Updater.kt` – aktualizace z aplikace: stáhne APK z vydání na GitHubu (jen adresy
    `github.com/zarybjir/Katan/releases/download/`) a otevře systémový instalátor přes
    `FileProvider`. Most: `version()`, `versionCode()`, `updateInstall(url)`, zpětné volání
    `AndroidCb.onUpdate(druh, data)`. Kontrolu nové verze dělá `hra/js/update.js` (GitHub API).
- `.github/workflows/build.yml` – sestavení APK na GitHubu. Se secrets `KATAN_*` podepíše
  release APK stálým klíčem a při nové `versionName` vytvoří vydání `v<verze>` se souborem
  `souostrovi.apk`. **Každá změna viditelná pro hráče = zvýšit verzi**, jinak se nevydá.
  Podpisový klíč nikdy necommitovat (`*.jks` je v `.gitignore`); repo je veřejné.

Souřadnice mapy: axiální `(q, r)` pro dílky; vrchol a hrana mají **jednoznačné id** odvozené
z dílku a směru (každý vrchol i hrana právě jedno id, i když sousedí s více dílky). Na pixely
převádí jen `ui/board.js`.

## Boti

- Bot je funkce `(pohled, seed) → akce`. Dostává **pohled**, ne stav – nevidí cizí karty.
- Běží u hostitele, se zpožděním kvůli čitelnosti (nastavitelné, v testech nulové).
- Rozhodování je ohodnocení dovolených akcí, žádné prohledávání do hloubky, dokud to nebude
  potřeba. Úvodní rozmístění hodnotí výnos čísel a pestrost surovin.
- Na obchodní nabídku bot odpoví vždy a hned. Nenabízí obchod opakovaně v jednom tahu.
- Bot nesmí nikdy vrátit neplatnou akci ani skončit bez akce; test to hlídá na tisících her.

## Rozhraní

- Hra je **na výšku i na šířku**; mapa uprostřed s posunem a zoomem dvěma prsty, ovládání dole
  (na šířku vpravo). Dotykové cíle nejméně 48 dp; vrcholy a hrany mají větší zásahovou plochu,
  než jak jsou nakreslené.
- Stavba: vybrat typ → zvýrazní se dovolená místa → klepnutí umístí. Drahé nebo nevratné akce
  (město, odhození karet) se potvrzují, ostatní ne.
- Hráče rozlišuje jen barva (značky zadavatel nechce). Paleta je `COLORS` (8 barev);
  barvu volí hostitel pro každé místo při zakládání, hráč ji může změnit v lobby zprávou `color`
  (jen před startem; barvu jiného člověka vzít nejde, s botem se prohodí). Ve stavu je `colors`.
  Paleta je zářivá; obarvené figurky a cesty mají navíc `saturate(1.6)`.
  Stavby jsou v původní velikosti, zesvětlené (barva hráče + `screen` bílé figurky) se světlým obrysem a stínem;
  krajiny jsou mírně ztlumené, aby stavby
  vynikly; poslední stavba se kolečkem nevyznačuje.
  Ostrov má písečný břeh s příbojem a nahnědlé pískové spáry mezi dílky. Místa ke stavbě jsou nenápadné
  světlé tečky (bílá kolečka zadavatel nechce). Přístavy kreslí `port()` v `board.js`: lávky
  (`lavka.webp`) a pergamenová cedulka s ikonkou suroviny a „2:1“, u 3:1 jen poměr. Cesta je `fig-cesta.webp` obarvená na hráče.
  V UI se barva hráče bere vždy přes `pc(p)` (tečka v textu: `dot(p)`) z `dom.js`, nikdy `COLORS[p]`.
  Cesty jsou kreslené trámy v barvě hráče, čísla na dílcích pergamenové žetony průhledné na 25 % (alpha 0,75) bez lemu (`road`, `token` v `board.js`). Čísla na dílcích jsou bez teček (zadavatel
  je nechce); 6 a 8 jsou červené a větší.
- Vzhled je střídmý a světlý (zadavatel nechce kýč ani tmavé UI): lišty a tlačítka světlé matné
  (béžové, světlá dubová textura `drevo-dub.jpg` pod krémovým závojem) s tmavým písmem, bez tmavých textur
  dřeva, moře je světlý klidný obrázek `more-svetle.jpg` (ne `more.jpg`), banka je kreslená SVG ikona. Malované
  obrázky `drevo-*.jpg`, `btn-*.webp`, `more.jpg`, `banka.webp` zůstávají v repu, ale nepoužívají se.
- Suroviny a stavby se v ceníku, obchodu, pravidlech a na tlačítkách ukazují symboly (`icon(k)`,
  `resIcons({...})` v `icons.js`), ne slovy. Karta výpravy (`cardEl` v `trade.js`) má zarámovaný
  obrázek nahoře a název s popisem dole; stejně se ukazuje v seznamu karet i při zahrání.
- Kamera mapy (posun, zoom) se mění jen na pokyn hráče: vystředí se poprvé a přes menu „Vystředit
  mapu“; spodní lišta má stálou výšku, aby mapa neposkakovala.
- Canvas se škáluje podle `devicePixelRatio` (nejvýš 2). Grafika se předkreslí do offscreen
  canvasů; ve smyčce jen `drawImage`. Překresluje se při změně, ne trvale 60× za vteřinu.

## Ukládání (localStorage)

Klíče `so-set` (nastavení: jméno, token zařízení, poslední adresa nebo kód hry, poslední rozvržení
míst) a `so-host` (rozehraná hra hostitele: celý stav + hráči a tokeny). Uložený stav má pole `v`;
při změně formátu doplň chybějící pole výchozí hodnotou, nebo starou hru zahoď se sdělením.
Přístup vždy v `try/catch`.

## Spuštění a ověření

- `python3 -m http.server 8080 -d hra` a otevřít `http://127.0.0.1:8080/`. Víc hráčů se zkouší
  ve více záložkách přes přenos `tabs` (kód hry z lobby). Parametr `?fast` zrychlí boty.
  `window.__so.S` je běžící relace (stav, hostitel, mapa) – používají ji testy.
- **Po změně v `core/`, `bot/`, `net/` nebo `data.js` spusť `node hra/tests/run.js`**
  (bez prohlížeče, bez npm):
  - geometrie: počty vrcholů a hran, sousednosti, jednoznačnost id,
  - generátor map: 1000 seedů každého typu splní pravidla, typy mají svůj tvar, boti na nich dohrají,
  - pravidla: každý typ akce má test platného i neplatného použití,
  - **hry botů:** stovky celých her doběhnou do konce bez chyby, neplatné akce a zaseknutí;
    po každé akci se kontrolují invarianty (počty karet sedí s bankou, body sedí se stavbami),
  - determinismus: stejný seed a akce dají stejný stav,
  - `view`: v pohledu hráče nejsou cizí karty ani stav generátoru náhody,
  - síť přes přenos `mem`: připojení, odpojení a návrat, akce za cizího hráče je odmítnuta,
    poškozená zpráva hostitele neshodí.
- Po změně čísel v `data.js` nebo rozhodování botů spusť `node hra/tests/sim.js 3 hard` (počet
  hráčů, obtížnost, volitelně typ mapy): vypíše délku her, výhry podle pořadí, podíl tahů bez
  stavby, počty staveb, obchodů a nabídek. Porovnej s hodnotami před změnou.
- Po změně rozhraní spusť i `node hra/tests/browser.js` (Playwright s Chromiem: založí hru
  s boty, odehraje pár tahů, ve dvou záložkách ověří hru přes `tabs`, hlídá chyby v konzoli
  a pořídí snímek na výšku i na šířku). Na snímek se podívej.
- Android část (`LanServer`, `Bridge`, služba) tady spustit nejde – ověřuje se sestavením
  a ručně na zařízení. Proto v ní má být co nejméně logiky. Sestavení: `./gradlew assembleDebug`
  (Android SDK se dá doinstalovat do `/opt/android-sdk`, cesta patří do `local.properties`).
- Přenos `rtc` jde ověřit ve dvou oddělených kontextech prohlížeče proti místnímu serveru PeerJS
  (`npm i peer` mimo repo, `window.__signal = {host, port, path, secure}` před načtením hry).
  Veřejný broker a průchod přes NAT se dají ověřit jen na skutečných zařízeních.
- **Když opravíš chybu nebo přidáš pravidlo, přidej k tomu test.**

## Pořadí prací

1. Jádro: geometrie, generátor mapy, stav, `legal`/`apply` pro rozmístění, hod, stavby, bouři,
   obchod s bankou, body a výhru. Testy.
2. Bot (střední obtížnost) a testy celých her.
3. Rozhraní: mapa, HUD, hra jednoho hráče proti botům přes `mem`.
4. Hostitel a klient, lobby, přenos `tabs`; hra na jednom zařízení s předáváním.
5. Obchod mezi hráči, výpravy, nejdelší cesta, další obtížnosti botů.
6. Android obal: WebView, `LanServer`, NSD, QR kód, foreground služba, sestavení APK.
7. Internet přes WebRTC včetně záložního relé.
8. Grafika, zvuky, animace, ladění čísel simulací.

## Vydání verze

- Zvyš `versionCode` a `versionName` v `app/build.gradle.kts`; při změně zpráv nebo pravidel
  zvyš i `PROTO`.
- Commit ve stylu `1.2: krátký popis změn`.
- Když přibude nebo se změní funkce viditelná pro hráče, uprav i `README.md` (je česky).

## Styl

- Texty ve hře, komentáře v kódu, README i commity česky. Texty ve hře neutrálně.
- Krátké názvy, kompaktní kód, sekce oddělené `// ---------- název ----------`.
