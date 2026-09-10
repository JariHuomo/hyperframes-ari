# A4 — yhden esiintymän oma kohtauskopio

Tila: toteutettu ja paikallisesti testattu tuetuille kohtausjonon itsenäisille HTML-kohtauksille. A5:n vientivertailu, B–D ja ihmistestaus eivät kuulu tämän erän näyttöön. Työ tehtiin hyperframes-ari-forkissa, 0 USD, ilman ulkoisia palvelukutsuja, commitia tai pushia.

## Toiminta ja rajaus

**Kohtaukset → valittu esiintymä → uuden tiedoston nimi → Tee oma kopio → Tallenna kohtausmuutos.** Ehdotus kertoo ennen kirjoitusta, että vain valittu esiintymä saa oman sisällön; alkuperäinen, muut esiintymät, ajoitukset ja kokonaiskesto säilyvät. Vanha **Kopioi kohtaus** lisää edelleen uuden esiintymän yhteisestä lähteestä.

Agentti käyttää samoja `studio_prepare_scene`- ja `studio_edit_scene`-työkaluja: `action: "detach"`, aktiivinen `sourceFile`, `studio_scenes`-listauksen yksiselitteinen `target` ja `fileName`. Tallennukseen tarvitaan saman ehdotuksen `reviewVersion`. Kuitissa ovat todellinen `target`, `selectionSourceFile`, `instance`, `createdSource`, `affectsInstances: 1`, isännän `version` ja molempien tiedostojen `versions`. Esikatselun epäonnistuminen ei muuta onnistunutta lähdetallennusta epäonnistuneeksi.

[Kohtauskopion palvelu](packages/studio/src/ari/sceneSourceCopy.ts) sijoittaa uuden tiedoston alkuperäisen rinnalle ja kopioi sen tavuntarkasti. Näin suhteelliset kuva-, tyyli- ja skriptipolut, inline-tyylit, elementtitunnisteet sekä liikkeet säilyvät. Tuetut sisältömuokkaukset kirjoittavat kopion omaan HTML-tiedostoon; kuvia ja ulkoisia tyylejä käytetään yhteisinä lukuriippuvuuksina. Tämä ei ole kaikkien aineistojen arkistokopio.

Muita `data-composition-src`-lähteitä sisältävä kohtaus torjutaan ennen kirjoitusta: transitiivisten kohtausriippuvuuksien itsenäistä kopiointia ei vielä tueta. Kohtausjonon aiemmat rajoitukset pysyvät: peräkkäiset suorat isännät, vakionopeus ja lähteen sisään mahtuva näkyvä ikkuna. Muuttuvat nopeudet, aukollinen/päällekkäinen kohtausjono ja isäntään kohdistuvat liikkeet eivät muutu tuetuiksi tällä toimituksella.

Isännän tunniste, `data-start`, `data-duration`, `data-playback-start` ja `data-playback-rate` säilyvät. Runtime käyttää esiintymäkohtaisia kompositio- ja aikajananimiä. Elementtien samat paikalliset DOM-id:t saavat esiintyä eri kompositioissa; niitä ei väitetä globaalisti yksilöllisiksi. Testi tarkistaa paikallisen yksilöllisyyden, eri isäntätunnisteet, rekisteröidyt aikajanat sekä kopion valinnan oikeasta lähteestä.

## Yhteinen tallennus ja valinta

[prepare/save](packages/studio/src/ari/sceneOperations.ts) sitoo alkuperäisen lähteen, isännän ja uuden tiedoston puuttumisen ehdotukseen. Uusi tiedosto ja yhden isännän viittaus tallennetaan yhtenä nullable-historiamuutoksena. Vanhentunut lähde/isäntä, poistettu esiintymä ja nimiristiriita torjutaan; kirjoitus- tai historiavirhe palauttaa muutoksen ehdollisesti.

[Suomalainen kontrolli](packages/studio/src/ari/AriScenes.tsx) ja [agenttityökalut](packages/studio/src/webmcp/tools/sceneStructureTools.ts) käyttävät samaa palvelua. Tallennuksen alussa sidottu valintarevisio välitetään [valinnan palautukseen](packages/studio/src/ari/useElementReceiptSelection.ts), jotta välissä tehty käyttäjävalinta säilyy. [Aikajanan synkronointi](packages/studio/src/hooks/useTimelineSelectionPreviewSync.ts) säilyttää revision ratkaistessaan saman valinnan uudessa esikatselussa; uusi aikajanavalinta edelleen vanhentaa odottavan palautuksen.

## Testinäyttö

| Tarkistus                                                                                                                  | Tulos                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Kohdennetut palvelu-, oikeiden tiedostojen, nullable-palautuksen ja valinnan testit](screenshots/2026-09-10-a4/tests.log) | 7 tiedostoa, 65 testiä läpi                                             |
| [Ari-testit](screenshots/2026-09-10-a4/ari-tests.log)                                                                      | 36 tiedostoa, 466 testiä läpi                                           |
| [Valinnan viimeinen regressioajo](screenshots/2026-09-10-a4/selection-tests.log)                                           | 17 testiä läpi                                                          |
| [Studio typecheck](screenshots/2026-09-10-a4/typecheck.log)                                                                | exit 0                                                                  |
| [ari:build](screenshots/2026-09-10-a4/build.log)                                                                           | exit 0                                                                  |
| [Koko diffiin kohdistuva rakennetarkistus](screenshots/2026-09-10-a4/structure.log)                                        | vihreä, ei uusia löydöksiä tai ohituksia; 26 perittyä löydöstä eroteltu |
| [oxlint](screenshots/2026-09-10-a4/lint.log) / [oxfmt](screenshots/2026-09-10-a4/format.log)                               | läpi koko muuttuneiden/uusien tiedostojen joukossa                      |
| [Tuotantotiedostojen rivimäärät](screenshots/2026-09-10-a4/line-counts.json)                                               | kaikki alle 600; suurin 598                                             |

[Oikeiden tiedostojen testit](packages/studio/src/ari/sceneOperations.test.ts) todistavat oman kopion, alkuperäisen säilymisen, samat suhteelliset media-/tyyliviittaukset, playback-startin 0,25 s ja nopeuden 0,5, historian uudelleenlatauksen sekä tavuntarkan undo/redon. Kuusi parametrisoitua virhepolkua kattavat isännän/lähteen muuttumisen, nimiristiriidan, poistetun esiintymän, toisen kirjoituksen ja historian epäonnistumisen. Monitiedostopalautuksen aiemmat konfliktitestit ajettiin mukana. Uudet valintatestit kattavat myös tallennuksen aikana vaihtuneen tai tyhjentyneen valinnan.

Joissakin Vitest-lokeissa on aiempi avoimien kahvojen sulkemisvaroitus (`close timed out after 10000ms`); prosessit päättyivät exit-koodiin 0. Buildin chunk-varoituksia ei käsitellä testivirheinä.

## Näkyvät hyväksyntäajot

[Lopullinen selainraportti](screenshots/2026-09-10-a4/browser-attempt-10/report.json): **4 × 13 tarkistusta**, UI-only ja yhdistelmä molemmissa koossa 1280×800 ja 1440×900, kaikki `ok: true`. Ei sivuvirheitä, korjaavia reload-kutsuja, ulkoisia pyyntöjä eikä odottamattomia HTTP-virheitä. Valinnaiset FFmpeg-404-kyselyt eritellään raportissa.

Ajuri rakentaa paikallisen projektin, kohtaukset, tuontikuvan ja yhteiset esiintymät olemassa olevilla toiminnoilla. Toinen esiintymä irrotetaan, kuvataan samassa pääajan 9,5 s kohdassa, perutaan/palautetaan ja siihen lisätään näkyvä teksti **Vain oma kopio**. Uudelleenavaus tarkistaa erillisen kopion sisällön sekä alkuperäisen säilymisen. Lähteitä ei käsikorjattu. [Koottu lähde- ja kuvavertailu](screenshots/2026-09-10-a4/acceptance-summary.json) vahvistaa, että kaikilla neljällä polulla alkuperäiset ovat keskenään samat ja muokatut kopiot keskenään samat.

Kuvavertailussa piilotetaan vain editorin valintakehys, ei komposition sisältöä. Sisäinen geometria, tyylit, teksti ja kuvan dekoodaus vastaavat täsmälleen. Kolmen ajon ennen/jälkeen-pikselit olivat identtiset. Yhdistelmäajon 1440×900-kuvissa CSS-skaalatun iframen ruuturajauksen pyöristys muutti 1,0589 % ruutupikseleistä; 32×32-kuvien keskimääräinen RGB-ero oli 0,515/255 (raja 1/255). Raportti säilyttää molemmat mittarit eikä väitä kaikkia ruutukuvia tavuntarkoiksi.

Visuaalisesti tarkistetut kuvat: [1280×800-vaikutusehdotus](screenshots/2026-09-10-a4/browser-attempt-10/ui-only-1280-detach-impact.png), [UI-only-kopion teksti](screenshots/2026-09-10-a4/browser-attempt-10/ui-only-1440-own-edited.png), [yhdistelmäkopion teksti](screenshots/2026-09-10-a4/browser-attempt-10/mixed-1280-own-edited.png), [ennen](screenshots/2026-09-10-a4/browser-attempt-10/mixed-1440-own-before.png) ja [jälkeen](screenshots/2026-09-10-a4/browser-attempt-10/mixed-1440-own-after.png). Tämä on automaattinen näkyvä testi synteettisellä aineistolla, ei ihmistesti tai valmis asiakasmainos.

[Viivästetyn valinnan regressio](screenshots/2026-09-10-a4/selection-race/browser-report.json) läpäisi kolme tarkistusta. Oma palvelin käynnistettiin offline-estolla ennen ensimmäistä avausta. [Palvelimen verkkoloki](screenshots/2026-09-10-a4/server-network.jsonl) kirjaa eston ja ennen verkkokutsua torjutut fonttihakuyritykset.

## Kokeissa löytynyt ja korjattu

Yritysten 1–8 raportit säilyvät saman näyttöhakemiston `browser-attempt-*`-hakemistoissa. Ajurin virheellisiä oletuksia korjattiin: iframe löytyy shadow DOMista, valintakehys ei ole osa mainosta, käännetty esikatselu käyttää `data-composition-file`-attribuuttia, tunnisteet ovat kompositiokohtaisia ja iframe-elementtien tyyppi tarkistetaan realm-riippumattomasti. Kuvakaappausten CSS-pikselirajaus erotettiin varsinaisesta geometria- ja ulkoasumuutoksesta.

[Yritys 9](screenshots/2026-09-10-a4/browser-attempt-9/report.json) löysi oikean tuotantovirheen: saman aikajanavalinnan automaattinen uudelleenratkaisu vanhensi tallennuskuitin valinnan. Korjaus erottaa tämän uudesta käyttäjävalinnasta, ja [regressiotesti](packages/studio/src/hooks/useTimelineSelectionPreviewSync.test.tsx) todistaa molemmat tapaukset. Lopullinen neljän polun ajo meni läpi ilman korjaavaa uudelleenlatausta.

## Toistaminen

Forkin juuressa, foreground-istunnoissa:

```sh
ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-a4/server-network.jsonl" npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
ARI_SCENE_COPY=1 ARI_SCENE_STRUCTURE_EVIDENCE=screenshots/2026-09-10-a4/new-browser-run npx --yes bun run ari:test:scene-structure
ARI_SELECTION_RACE_EVIDENCE=screenshots/2026-09-10-a4/new-selection-run npx --yes bun run ari:test:selection-race
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/ari/sceneOperations.test.ts src/ari/AriScenes.test.tsx src/ari/useElementReceiptSelection.test.tsx src/webmcp/tools/sceneStructureTools.test.ts src/utils/nullableHistory.test.ts src/utils/conditionalFileTransaction.test.ts src/hooks/useTimelineSelectionPreviewSync.test.tsx
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues
```

Lint-/muotoilutarkistuksen [tiedostolista](screenshots/2026-09-10-a4/format-files.json) sisältää koko diffiin kuuluvat muuttuneet ja uudet TS/TSX/MJS/Markdown-tiedostot, ei examples- tai screenshots-hakemistoja. A5:n oikea vientivertailu ja B–D jäävät jatkoeriin.

Omat hyväksyntäselaimet ja foreground-palvelin on pysäytetty. [Portti 3084 on vapaa](screenshots/2026-09-10-a4/ports.log). Työpuun aiemmat muutokset säilyvät; ei commitia, pushia, stashia, checkoutia tai resetiä.
