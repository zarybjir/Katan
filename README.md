# Souostroví

Tahová strategie pro 2–6 hráčů na mapě ze šestiúhelníků. Hod kostkami přináší suroviny,
za ně se staví cesty, osady a města, obchoduje se s bankou i mezi hráči. Vyhrává, kdo první
získá cílový počet bodů. Android aplikace; server hry běží na zařízení, které hru založilo.

## Co hra umí

- Mapa se pro každou hru generuje nově, velikost podle počtu hráčů. Pět typů map: ostrov,
  zátoky, atol, šíje a hřeben; při zakládání hry je vidět náhled a mapu lze vyměnit za jinou.
- Boti ve třech obtížnostech (lehký, střední, těžký), libovolná kombinace lidí a botů.
- **Jedno zařízení:** více hráčů si zařízení předává, mezi tahy je obrazovka předání.
- **Místní síť:** hostitel hru otevře, ostatní ji uvidí v seznamu nebo zadají adresu, kterou
  hostitel vidí v lobby. Funguje i bez internetu (stejná Wi-Fi nebo hotspot).
- **Internet:** hostitel sdělí pětipísmenný kód hry, ostatní ho zadají v nabídce Připojit se.
- Odpojený nebo nečinný hráč je dočasně nahrazen botem a může se do hry vrátit.
- Hostitel má rozehranou hru uloženou a může v ní pokračovat.

- Ceník (tlačítko vedle nápovědy nad kartami) ukazuje, co lze koupit, za kolik, k čemu to je
  a co přesně chybí. Klepnutí na nedostupnou stavbu ceník otevře také.

## Pravidla ve zkratce

| Stavba | Cena |
|---|---|
| cesta | dřevo, cihly |
| osada (1 bod) | dřevo, kámen, obilí, ovce |
| město (2 body) | 2 obilí, 2 cihly, ovce |
| výprava (karta) | obilí, ovce, cihly |

- Osada nesmí stát hned vedle jiné stavby a musí navazovat na vlastní cestu.
- Součet 7 přivolá bouři: kdo má víc než 8 karet, polovinu odhodí; hráč na tahu bouři přesune
  na jiný dílek (ten nevyrábí) a vezme kartu jednomu sousedovi.
- Směna s bankou 4:1, v přístavu 3:1 nebo 2:1 za vyznačenou surovinu.
- Nejdelší cesta (od 5 úseků) a nejvíc zahraných hlídek (od 3) dávají po 2 bodech.

## Instalace

APK se sestaví na GitHubu po každém pushi: záložka **Actions** → poslední běh → **Artifacts**
→ `souostrovi-apk`. Tag `v0.1.0` navíc vytvoří Release s APK.

Bez nastavených secrets vznikne debug APK podepsaná náhodným klíčem; další verzi pak nejde
nainstalovat přes starou. Pro aktualizace nastav v Settings → Secrets and variables → Actions:
`KATAN_KEYSTORE_B64`, `KATAN_KEYSTORE_PASSWORD`, `KATAN_KEY_ALIAS`, `KATAN_KEY_PASSWORD`.

## Hra přes internet – omezení

Spojení se navazuje přímo mezi zařízeními (WebRTC). K navázání se používá veřejná služba
PeerJS; herní data přes ni nejdou. Na některých mobilních sítích přímé spojení navázat nejde.
Pro ně je potřeba relé (TURN), které zatím není nastavené – doplňuje se do `ICE` v `hra/js/data.js`.

## Vývoj

- Hra je ve složce `hra/` (JavaScript bez build kroku), Android obal v `app/`.
- Spuštění v prohlížeči: `python3 -m http.server 8080 -d hra`.
- Testy: `node hra/tests/run.js` (pravidla, boti, síť), `node hra/tests/browser.js` (rozhraní).
- Podrobnosti pro vývoj jsou v `CLAUDE.md`.
