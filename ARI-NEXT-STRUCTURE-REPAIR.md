# A3: rakennetarkistuksen korjaus

Rajaus: nykyisen työpuun rakenteen korjaus ennen A4:ää. Ei uusia ominaisuuksia, commitia, pushia tai maksullisia palvelukutsuja. A4–A5, B3–B5, C ja D eivät valmistu tässä erässä. Työ tehdään `ari/agent-studio`-haaralla.

## Muutokset

- Poistettu käyttämättömät `buildStudioContextValue`-vienti ja `StudioProjectFileWriter`-tyyppi. `ari:test:selection-race` ja `ari:check:offline` tekevät molemmat paikalliset ajurit ajettaviksi package.jsonin kautta.
- Erotettu elementti- ja kohtaustyökalujen kontekstin tarkistus, lisäyksen tietojen tulkinta ja aineistohyllyn tarkistus. Juuren vaikutusmäärä yksi ja yhteisen lähteen todellinen määrä säilyvät.
- Valinnan palautuksessa esikatselun odotus, kohteen ratkaisu ja vanhentumissuoja ovat erillisiä tehtäviä. Sama revision ja generation tarkistus tehdään myös asynkronisen ratkaisun jälkeen. Aikakatkaisu ei muuta tallennettua lähdettä epäonnistuneeksi kirjoitukseksi.
- Ohjaamon rakennepainikkeet ja dialogien yhteinen saavutettava valitsin erotettu omiksi osikseen. GSAP-kirjoitusoperaatiot välitetään yhtenä nimettynä ryhmänä; valinnan ja esikatselun riippuvuudet säilyvät.
- CSS-tunnisteen escapetus ja GSAP:n elävän kohteen haku jaettu pieniin tehtäviin. Tunnisteen UTF-16-merkkijärjestys, kontrollimerkit ja numeroalkujen säännöt säilyvät.
- Historia- ja valintatestien yhteinen järjestely erotettu apufunktioihin. Assertioita tai testitapauksia ei poistettu. Nullable-historian tuotantopalautukseen ei tehty muutoksia.
- Näkyvien selainajojen offline-valvonta, projektin alustus, kuvatuonti, näppäimistötäyttö, raportointi ja selaimen sulkeminen keskitetty tiedostoon [ari-acceptance-browser.mjs](packages/studio/tests/e2e/ari-acceptance-browser.mjs). Molemmat näkymäkoot ja molemmat polut säilyvät.

## Rakenteen näyttö

[Alkumittaus](screenshots/2026-09-10-structure-repair/before.json) löysi 4 dead-code-asiaa (aiempaan kolmeen nähden lisäksi offline-ajuri), 14 monimutkaisuuslöydöstä ja 45 toistoryhmää. Samalla `origin/main`-vertailulla uudet löydökset olivat 4 / 12 / 20; muut olivat perittyjä.

[Lopullinen koneellinen tarkistus](screenshots/2026-09-10-structure-repair/structure.json) ja [luettava loki](screenshots/2026-09-10-structure-repair/structure.log): **pass, exit 0**, koko diffi mukana. Uusia löydöksiä **0 / 0 / 0**. Tarkistin raportoi yhä yhden perityn monimutkaisuuslöydöksen ja 25 perittyä toistoryhmää, jotka sen ennestään käytössä oleva `new-only`-portti erottaa uusista löydöksistä. Tämä ei ole väite, että koko repossa olisi nolla löydöstä. `.fallowrc.jsonc`, baseline ja rajat pysyivät ennallaan; uusia ohituksia ei lisätty.

[Rivirajamittaus](screenshots/2026-09-10-structure-repair/line-counts.json): 104 muuttunutta tai uutta tuotannon TS/TSX-tiedostoa `origin/main`-vertailussa; kaikki alle 600 riviä, suurin 599 (`domEditingLayers.ts`).

## Regressiot

| Ajo                                                   | Tulos ja loki                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ari:test`                                            | 36 tiedostoa, 456 testiä läpi; [loki](screenshots/2026-09-10-structure-repair/ari-test.log)                                                                |
| Elementti-, kohtaus-, valinta- ja nullable-regressiot | 46 tiedostoa, 462 testiä läpi; [loki](screenshots/2026-09-10-structure-repair/regressions.log)                                                             |
| Historian ja valintakytkentöjen lisäajo               | 7 tiedostoa, 66 testiä läpi; [loki](screenshots/2026-09-10-structure-repair/wiring-history.log)                                                            |
| DOM-muokkaus ja tunnisteiden escapetus                | 50 testiä läpi; [loki](screenshots/2026-09-10-structure-repair/dom-editing.log)                                                                            |
| Studio / studio-server typecheck                      | Molemmat exit 0; [Studio](screenshots/2026-09-10-structure-repair/typecheck.log), [palvelin](screenshots/2026-09-10-structure-repair/server-typecheck.log) |
| `ari:build`                                           | Exit 0; [loki](screenshots/2026-09-10-structure-repair/build.log)                                                                                          |
| oxlint / oxfmt                                        | [Lint](screenshots/2026-09-10-structure-repair/lint.log), [muotoilu](screenshots/2026-09-10-structure-repair/format.log)                                   |

Testimäärät ovat erillisiä osittain päällekkäisiä ajoja, eivät yhteen laskettava uusien testien määrä. Historiakytkentöjen 66 testin ajo tulosti lopuksi Vitestin `close timed out after 10000ms` -varoituksen; prosessi päättyi exit 0. Testien läpäisyä ei käytetä väitteenä siitä, että tämä runnerin sulkeutumisvaroitus olisi korjattu.

### Näkyvät ajot

[Elementtiraportti](screenshots/2026-09-10-structure-repair/elements/report.json): neljä näkyvää UI-only/yhdistelmäajoa koossa 1280×800 ja 1440×900, **14 tarkistusta jokaisessa**, `ok: true`. Sisäkkäisten lähteiden versiot identtiset kaikissa neljässä. Ei sivuvirheitä, korjaavia uudelleenlatauksia, ulkoisia pyyntöjä tai odottamattomia HTTP-virheitä. Valinnaiset FFmpeg-404-kyselyt eritellään raportissa. [Jaetun kohtauksen kuva](screenshots/2026-09-10-structure-repair/elements/ui-only-1280-shared-impact.png) tarkistettu visuaalisesti: toinen esiintymä ja vaikutusteksti vastaavat toisiaan.

[Kohtausraportti](screenshots/2026-09-10-structure-repair/scenes/report.json): neljä näkyvää UI-only/yhdistelmäajoa samoissa näkymäkoissa, **10 tarkistusta jokaisessa**, `ok: true` ja `equivalentSources: true`. Kaikkien ajojen normalisoidut juurilähteet ja sisäkkäinen kohtauslähde vastaavat toisiaan. Ei sivuvirheitä, korjaavia reload-kutsuja, ulkoisia pyyntöjä tai odottamattomia HTTP-virheitä. [Kopioinnin ajoitusehdotus](screenshots/2026-09-10-structure-repair/scenes/ui-only-1280-duplicate-impact.png) ja [uudelleenavattu 1440×900-näkymä](screenshots/2026-09-10-structure-repair/scenes/ui-only-1440-reopened.png) tarkistettu visuaalisesti: ehdotus näyttää yhteisen lähteen kaksi esiintymää ja uusi aikajana säilyy uudelleenavauksessa.

[Viivästetyn valinnan koe](screenshots/2026-09-10-structure-repair/selection-race/browser-report.json): **3 tarkistusta, `ok: true`**. Uusin valinta säilyy odottavan tallennuskuitin yli, lähteen tallennusversio pysyy onnistuneena ja juuren luku/kirjoitus/UI ilmoittavat yhden vaikutuskohteen. Ei sivuvirheitä tai ulkoisia pyyntöjä. [Valintakuva](screenshots/2026-09-10-structure-repair/selection-race/delayed-new-selection.png) tarkistettu visuaalisesti: uudempi taustavalinta säilyy viivästetyn käsittelyn aikana. Päällekkäiset testitekstit ovat tämän valintatestin aineistoa, eivät valmiin mainoksen laatunäyttöä.

Ensimmäinen elementtiajo epäonnistui ajurin näppäimistöaktivointiin kohdevalinnan vielä pitäessä painiketta poissa käytöstä. [Epäonnistuneen ajon raportti](screenshots/2026-09-10-structure-repair/elements-attempt-1/report.json) säilyy. Ajuri odottaa nyt saman näkyvän kontrollin aktivoitumista ennen Enteriä; lähteitä ei korjattu eikä sivua ladattu uudelleen virheen peittämiseksi.

Kohtausajon [ensimmäinen](screenshots/2026-09-10-structure-repair/scenes-attempt-1/report.json) ja [toinen](screenshots/2026-09-10-structure-repair/scenes-attempt-2/report.json) yritys löysivät todellisen välimuistivian: uudelleenavaus palautti vanhan 7 sekunnin pohjan, vaikka lähteet olivat tallentuneet. Valmiin manifestin odottaminen ei auttanut. [Rajattu diagnostiikka](screenshots/2026-09-10-structure-repair/cache-diagnostic.log) todisti saman ETagin ja `304`-vastauksen ennen ja jälkeen muutoksen. Erillinen uusi selain sai tuoreen lähteen, joten levydata ei ollut hävinnyt.

Korjaus: `StudioApiAdapter.invalidateProjectSignature` kytkee [ehdollisen kirjoitusreitin](packages/studio-server/src/routes/ariAuthoring.ts) ja [Viten allekirjoitusvälimuistin](packages/studio/vite.adapter.ts). Välimuisti vanhennetaan ennen synkronista kirjoitusta; myös osittaisen epäonnistumisen kompensaatio jää tämän sisään. Tiedostovahdin alustus tai toimitusviive ei enää voi pitää vanhaa ETagia kirjoituksen jälkeen. Tallennussopimuksen ennakkoehdot säilyvät. Ajurissa pidetään lisäksi oikea esikatselun valmiusodotus; ei korjaavaa reloadia, välimuistin poiskytkentää tai hyväksyntälähteiden käsinmuutosta.

Uudet regressiot: [kirjoitusreitti](screenshots/2026-09-10-structure-repair/signature-route.log) 4 testiä ja [Viten välimuisti](screenshots/2026-09-10-structure-repair/signature-cache.log) 9 testiä läpi. Lisätyt tapaukset todistavat luonti/muutos/poisto-kierroksen allekirjoitukset ilman watcher-tapahtumia sekä koko projektin synkronisen invalidoinnin. Ensimmäiset punaiset testitulokset säilyvät `signature-route-red.log`- ja `signature-cache-red.log`-tiedostoissa.

## Toistettavat komennot

Forkin juuressa, paikallinen Bun `npx --yes bun` -käynnistimellä:

```sh
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio test src/ari src/webmcp src/utils/nullableHistory.test.ts src/utils/nullableProjectFiles.test.ts src/utils/conditionalFileTransaction.test.ts src/utils/atomicGsapAdd.test.ts src/utils/editHistoryStorage.nullable.test.ts src/hooks/usePersistentEditHistory.test.ts src/hooks/usePersistentEditHistory.projectOwnership.test.tsx src/hooks/useDomSelectionSelectionGuards.test.ts src/hooks/useDomEditPreviewSync.test.tsx src/hooks/useGsapTweenCache.test.ts src/components/editor/domEditingDom.labels.test.ts src/components/editor/domEditingElement.identity.test.ts
npx --yes bun run --cwd packages/studio test src/utils/studioFileHistory.test.ts src/utils/gsapUndoRestore.test.ts src/hooks/useDomEditSession.test.tsx src/hooks/useDomEditSession.membersForDelete.test.ts src/hooks/useDomSelection.test.ts src/hooks/useTimelineSelectionPreviewSync.test.tsx src/hooks/useGsapTweenCache.test.ts
npx --yes bun run --cwd packages/studio test src/components/editor/domEditing.test.ts
npx --yes bun run --cwd packages/studio-server test src/routes/ariAuthoring.test.ts
npx --yes bun run --cwd packages/studio test vite.adapter.signature.test.ts
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
./node_modules/.bin/fallow audit --base origin/main --fail-on-issues
```

Tarkistin ajettiin paikallisena `node_modules/.bin/fallow`-binäärinä; ei asennusta tai verkkokutsua. Lint/muotoilun tiedostot luetellaan [tiedostolistassa](screenshots/2026-09-10-structure-repair/format-files.json). Tarkistus käyttää koko diffiä sekä uusia tiedostoja, ei vain tämän refaktoroinnin tiedostoja.

Palvelin omassa foreground-istunnossa; offline-esto asennetaan ennen API:n ja fonttikoodin lataamista:

```sh
ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-structure-repair/server-network.jsonl" npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
```

Toisessa foreground-istunnossa, ajot peräkkäin:

```sh
ARI_ELEMENTS_EVIDENCE=screenshots/2026-09-10-structure-repair/elements npx --yes bun run ari:test:elements
ARI_SCENE_STRUCTURE_EVIDENCE=screenshots/2026-09-10-structure-repair/scenes npx --yes bun run ari:test:scene-structure
ARI_SELECTION_RACE_EVIDENCE=screenshots/2026-09-10-structure-repair/selection-race npx --yes bun run ari:test:selection-race
```

Aiemmat hyväksyntähakemistot säilyvät ennallaan. Tämä on automaattinen näkyvä regressiotestaus, ei ihmistestaus eikä A4–D-toimituksen hyväksyntä.

## Lopputila

[Koottu koneluettava tulos](screenshots/2026-09-10-structure-repair/acceptance-summary.json), [tarkistuskomentojen exit-koodit](screenshots/2026-09-10-structure-repair/checks.json) ja [linkkitarkistus](screenshots/2026-09-10-structure-repair/links.json) täydentävät alkuperäisiä lokeja. Omat foreground-palvelimet ja hyväksyntäselaimet pysäytetty; [portti 3084 vapaa](screenshots/2026-09-10-structure-repair/ports.log). [Palvelimen offline-loki](screenshots/2026-09-10-structure-repair/server-network.jsonl) osoittaa eston asennuksen ennen pyyntöjä. Fonttihakuyritykset torjutaan ennen verkkokutsua; niitä ei kuvata suoritetuiksi ulkoisiksi hauiksi. Palvelukulu **0 USD**. Ei commitia, pushia, stashia, checkoutia tai resetiä.

Suunnitelman ristiriitaiset nykytilalauseet on korjattu: A3:n tuetut kohtausoperaatiot ovat toteutettuja, A4 on seuraava ominaisuuserä. Historialliset raportit ja ensimmäisten yritysten epäonnistumiset säilyvät. Rakennetarkistuksen vihreä tulos koskee alkuperäistä diff-porttia, ei perittyjen repo-ongelmien täydellistä poistamista.
