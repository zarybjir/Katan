# Souostroví – pokyny pro Claude

Tahová strategie pro 2–6 hráčů na mapě ze šestiúhelníků: hod kostkami přináší suroviny, hráči
staví cesty, osady a města, obchodují a soupeří o vítězné body. Android aplikace (APK) s hrou
na jednom zařízení, po místní síti i přes internet, s boty. **Server hry běží na zařízení, které
hru založilo** – žádný vlastní herní server neexistuje.

„Souostroví“ je pracovní název (repo se jmenuje Katan); dá se změnit jedním řádkem v `data.js`
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
4. **Čekání na tah je krátké.** Boti hrají do 1–2 s, animace se dají přeskočit klepnutím, hod
   a výnos surovin proběhnou najednou. Obchodní nabídka nezdržuje hru déle než pár vteřin.
5. **Stav je čitelný na telefonu.** Je vidět, kdo je na tahu, co se právě stalo (kdo co dostal)
   a co můžu udělat. Místa, kde lze stavět, se zvýrazní; neplatná akce jde poznat předem, ne až
   z chybové hlášky.
6. **Stejná hra ve všech režimech.** Jedno zařízení, místní síť i internet se liší jen přenosem
   zpráv. Žádná pravidla ani obrazovky jen pro jeden režim (kromě předání zařízení).
7. **Boti jsou použitelní soupeři.** Hrají platně, staví smysluplně, reagují na obchod. Tři
   obtížnosti se liší kvalitou rozhodování, ne podváděním (bot nevidí víc než hráč).

### Návrh pravidel (výchozí, lze měnit)

- **Mapa** se generuje ze seedu; velikost podle počtu hráčů. Dílky: les (dřevo), lom (kámen),
  pole (obilí), loviště (ryby), důl (železo), pustina (nic). Každý dílek kromě pustiny má číslo
  2–12 bez 7; generátor hlídá, aby nejčastější čísla nesousedila a suroviny nebyly v jednom shluku.
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
  (mDNS) a ukáže adresu a QR kód. Klient hru najde v seznamu nebo zadá adresu. Funguje bez
  internetu.
- **Internet:** telefon za mobilním operátorem nebo domácím routerem nepřijme příchozí spojení,
  takže WebSocket server přes internet nestačí. Proto WebRTC: data jdou přímo mezi zařízeními
  a hostitel zůstává serverem hry. K navázání spojení je ale potřeba krátká výměna adres
  (signalizace) přes veřejnou službu – **otevřené rozhodnutí**, výchozí návrh: veřejný
  signalizační broker PeerJS + veřejné STUN servery, kód hry = id hostitele. Herní data přes ně
  nejdou. Na části mobilních sítí (symetrický NAT) se přímé spojení nenaváže; bez placeného
  TURN relé to nejde obejít a aplikace to má hráči říct srozumitelně.
- **Jedno zařízení (předávání):** mezi tahy lidí je obrazovka „předej zařízení hráči X“, aby
  nebyly vidět cizí karty.
- **Zprávy** jsou JSON s polem `t`. Klient → hostitel: `hello` (jméno, token, verze), `action`,
  `ping`. Hostitel → klient: `lobby`, `view` (pohled + události + pořadové číslo), `error`, `pong`.
  Verze protokolu je konstanta `PROTO`; při neshodě hostitel spojení odmítne s hláškou
  „rozdílná verze aplikace“.
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
  `hud.js` (ruka, tlačítka akcí, deník), `trade.js`, `lobby.js`, `menu.js`, `anim.js`.
- `hra/js/app.js` – start, přepínání obrazovek, ukládání nastavení.
- `hra/gfx/`, `hra/sounds/` – grafika a zvuky. `hra/tests/` – testy.
- `app/` – Android obal (Kotlin):
  - `MainActivity.kt` – WebView načítá hru přes `WebViewAssetLoader` ze stálého https originu
    (aby přežilo `localStorage`), drží obrazovku zapnutou během hry.
  - `LanServer.kt` – WebSocket server (knihovna `org.java-websocket`), jen přeposílá text mezi
    spojeními a WebView hostitele. **Nezná pravidla.**
  - `Bridge.kt` – `@JavascriptInterface`: `startServer`, `stopServer`, `send(id, text)`,
    zpětná volání `onOpen/onMessage/onClose`, NSD ohlášení a hledání, místní IP adresa.
  - Hostování běží ve foreground službě s oznámením, jinak Android server po zhasnutí
    obrazovky ukončí.
  - Klient se k `ws://` adrese v místní síti připojuje ze stránky s https originem – ve WebView
    je k tomu potřeba povolit smíšený obsah a nešifrovaný provoz; když to nepůjde, klientské
    spojení se vede také přes `Bridge`.
- `.github/workflows/build.yml` – sestavení APK na GitHubu (v tomto prostředí není Android SDK).

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
- Barvy hráčů se liší i tvarem nebo vzorem (barvoslepost). Čísla na dílcích ukazují i četnost
  (tečky nebo velikost písma).
- Canvas se škáluje podle `devicePixelRatio` (nejvýš 2). Grafika se předkreslí do offscreen
  canvasů; ve smyčce jen `drawImage`. Překresluje se při změně, ne trvale 60× za vteřinu.

## Ukládání (localStorage)

Klíče `so-set` (nastavení, jméno hráče), `so-host` (rozehraná hra hostitele: celý stav + hráči
a tokeny), `so-join` (poslední hra klienta: kód a token pro návrat). Uložený stav má pole `v`;
při změně formátu doplň chybějící pole výchozí hodnotou, nebo starou hru zahoď se sdělením.
Přístup vždy v `try/catch`.

## Spuštění a ověření

- `python3 -m http.server 8080 -d hra` a otevřít `http://127.0.0.1:8080/`. Víc hráčů se zkouší
  ve více záložkách přes přenos `tabs`.
- **Po změně v `core/`, `bot/`, `net/` nebo `data.js` spusť `node hra/tests/run.js`**
  (bez prohlížeče, bez npm):
  - geometrie: počty vrcholů a hran, sousednosti, jednoznačnost id,
  - generátor map: 1000 seedů splní pravidla vyváženosti,
  - pravidla: každý typ akce má test platného i neplatného použití,
  - **hry botů:** stovky celých her doběhnou do konce bez chyby, neplatné akce a zaseknutí;
    po každé akci se kontrolují invarianty (počty karet sedí s bankou, body sedí se stavbami),
  - determinismus: stejný seed a akce dají stejný stav,
  - `view`: v pohledu hráče nejsou cizí karty ani stav generátoru náhody,
  - síť přes přenos `mem`: připojení, odpojení a návrat, akce za cizího hráče je odmítnuta,
    poškozená zpráva hostitele neshodí.
- Po změně rozhraní spusť i `node hra/tests/browser.js` (Playwright s Chromiem: založí hru
  s boty, odehraje pár tahů, ve dvou záložkách ověří hru přes `tabs`, hlídá chyby v konzoli
  a pořídí snímek na výšku i na šířku). Na snímek se podívej.
- Android část (`LanServer`, `Bridge`, služba) tady spustit nejde – ověřuje se sestavením
  na GitHubu a ručně na zařízení. Proto v ní má být co nejméně logiky.
- **Když opravíš chybu nebo přidáš pravidlo, přidej k tomu test.**

## Pořadí prací

1. Jádro: geometrie, generátor mapy, stav, `legal`/`apply` pro rozmístění, hod, stavby, bouři,
   obchod s bankou, body a výhru. Testy.
2. Bot (střední obtížnost) a testy celých her.
3. Rozhraní: mapa, HUD, hra jednoho hráče proti botům přes `mem`.
4. Hostitel a klient, lobby, přenos `tabs`; hra na jednom zařízení s předáváním.
5. Obchod mezi hráči, výpravy, nejdelší cesta, další obtížnosti botů.
6. Android obal: WebView, `LanServer`, NSD, QR kód, foreground služba, sestavení APK.
7. Internet přes WebRTC (po rozhodnutí o signalizaci).
8. Grafika, zvuky, animace, ladění čísel simulací.

## Vydání verze

- Zvyš `versionCode` a `versionName` v `app/build.gradle.kts`; při změně zpráv nebo pravidel
  zvyš i `PROTO`.
- Commit ve stylu `1.2: krátký popis změn`.
- Když přibude nebo se změní funkce viditelná pro hráče, uprav i `README.md` (je česky).

## Styl

- Texty ve hře, komentáře v kódu, README i commity česky. Texty ve hře neutrálně.
- Krátké názvy, kompaktní kód, sekce oddělené `// ---------- název ----------`.
