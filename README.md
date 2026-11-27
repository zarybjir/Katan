# Souostroví

Tahová strategie pro 2–6 hráčů na mapě ze šestiúhelníků. Hod kostkami přináší suroviny,
za ně se staví cesty, osady a města, obchoduje se s bankou i mezi hráči. Vyhrává, kdo první
získá cílový počet bodů. Android aplikace; server hry běží na zařízení, které hru založilo.

## Co hra umí

- Mapa se pro každou hru generuje nově, velikost podle počtu hráčů. Šest typů map: souměrný
  ostrov (pravidelný šestiúhelník), ostrov, zátoky, atol, šíje a hřeben; při zakládání hry je vidět náhled a mapu lze vyměnit za jinou.
- Boti ve třech obtížnostech (lehký, střední, těžký), libovolná kombinace lidí a botů.
- **Jedno zařízení:** více hráčů si zařízení předává, mezi tahy je obrazovka předání.
- **Místní síť:** hostitel hru otevře, ostatní ji uvidí v seznamu nebo zadají adresu, kterou
  hostitel vidí v lobby. Funguje i bez internetu (stejná Wi-Fi nebo hotspot).
- **Internet:** hostitel sdělí pětipísmenný kód hry, ostatní ho zadají v nabídce Připojit se.
- Odpojený nebo nečinný hráč je dočasně nahrazen botem a může se do hry vrátit.
- Hostitel má rozehranou hru uloženou a může v ní pokračovat.

- Ceník (tlačítko vedle nápovědy nad kartami) ukazuje, co lze koupit, za kolik, k čemu to je
  a co přesně chybí. Klepnutí na nedostupnou stavbu ceník otevře také.

- Animace hodu kostkami, rozdávání surovin z dílků, surovin letících do banky (platby,
  odhození, směna) a z banky i mezi hráči (obchod, krádež) a hlášky uprostřed obrazovky
  (na tahu, bouře, obchod, krádež, vítěz; zmizí po 2 s); každou lze vypnout
  v nabídce Animace a zvuky (hlavní nabídka i menu ☰ ve hře). Kostky se přeskočí klepnutím.
- Zvuky: hod kostkami, příchod surovin, platby do banky, stavby, bouře, krádež, nabídka obchodu,
  začátek vlastního tahu a vítězství. Vypínají se tamtéž.

## Pravidla ve zkratce

| Stavba | Cena |
|---|---|
| cesta | dřevo, cihly |
| osada (1 bod) | dřevo, cihly, obilí, ovce |
| město (2 body) | 3 kámen, 2 obilí |
| výprava (karta) | obilí, ovce, kámen |

- Osada nesmí stát hned vedle jiné stavby a musí navazovat na vlastní cestu.
- Součet 7 přivolá bouři: kdo má víc než 8 karet, polovinu odhodí; hráč na tahu bouři přesune
  na jiný dílek (ten nevyrábí) a vezme kartu jednomu sousedovi.
- Směna s bankou 4:1, v přístavu 3:1 nebo 2:1 za vyznačenou surovinu. Na každé mapě je přístav
  2:1 pro každou surovinu (na pobřeží mezi dvěma dílky) a aspoň dva přístavy 3:1 (na výběžcích).
- Nejdelší cesta (od 5 úseků) a nejvíc zahraných hlídek (od 3) dávají po 2 bodech.

## Instalace a aktualizace

Každá nová verze se po nahrání na GitHub sama sestaví, podepíše stálým klíčem a zveřejní
v sekci **Releases** jako `souostrovi.apk`. První instalace je ruční: stáhnout APK a otevřít ho.

Další verze se instalují z aplikace: po spuštění se nová verze nabídne sama, nebo ji lze
zkontrolovat v nabídce tlačítkem **Zkontrolovat aktualizace**. Aplikace APK stáhne a otevře
systémovou instalaci; tu je potřeba potvrdit. Při první aktualizaci se Android jednou zeptá,
jestli aplikace smí instalovat aplikace. Postup i rozehraná hra zůstanou zachované.

Podmínky:
- repozitář musí být veřejný (aplikace čte vydání bez přihlášení),
- v Settings → Secrets and variables → Actions musí být podpisový klíč:
  `KATAN_KEYSTORE_B64`, `KATAN_KEYSTORE_PASSWORD`, `KATAN_KEY_ALIAS`, `KATAN_KEY_PASSWORD`.
  Klíč se nesmí ztratit ani změnit – jinak další verze nepůjde nainstalovat přes starou.
  Do repozitáře se nikdy nenahrává.

Bez secrets vznikne jen debug APK (artefakt sestavení), které aktualizovat nejde.

## Hra přes internet – omezení

Spojení se navazuje přímo mezi zařízeními (WebRTC). K navázání se používá veřejná služba
PeerJS; herní data přes ni nejdou. Na některých mobilních sítích přímé spojení navázat nejde.
Pro ně je potřeba relé (TURN), které zatím není nastavené – doplňuje se do `ICE` v `hra/js/data.js`.

## Vývoj

- Hra je ve složce `hra/` (JavaScript bez build kroku), Android obal v `app/`.
- Spuštění v prohlížeči: `python3 -m http.server 8080 -d hra`.
- Testy: `node hra/tests/run.js` (pravidla, boti, síť), `node hra/tests/browser.js` (rozhraní).
- Podrobnosti pro vývoj jsou v `CLAUDE.md`.
