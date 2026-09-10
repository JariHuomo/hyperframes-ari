# A3: kohtausoperaatiot — 10.9.2026

A3:n kohtauksen lisääminen, nimeäminen, kopiointi, poistaminen ja aikajärjestys on toteutettu tuetulle peräkkäisten kohtausten rakenteelle. A4:n itsenäinen esiintymäkopio, A5:n oikea vientivertailu, B3–B5, C ja D eivät valmistu tässä erässä. Ei ihmistestausta. Paikallinen työ, 0 USD, ei commitia tai pushia.

## Käyttö ja säännöt

Näkyvä **Kohtaukset** avaa erillisen aikajärjestyksen hallinnan. Elementtien päällekkäisyysjärjestys pysyy Elementit-dialogissa. Lisää/nimeä/kopioi/poista/siirrä tekee ensin ehdotuksen: vanha ja uusi kokonaiskesto, aloitussisältö, kohtausten aikavälit, nopeudet ja yhteiset lähteet näkyvät ennen **Tallenna kohtausmuutos** -painiketta. Syötteen muuttaminen vanhentaa ehdotuksen.

- Alkuperäinen juurisisältö säilyy muuttumattomana aloituksena. Seitsemän sekunnin pohjaan lisätyt kahden ja kolmen sekunnin kohtaukset tuottavat 12 sekuntia. Aloitusta ei poisteta hiljaisesti.
- Uusi kohtaus luo paikallisen HTML-lähteen ja lisää isäntäesiintymän jonon loppuun. Tunnisteet ovat yksilölliset myös numerolla alkavalla tiedostonimellä.
- Kopiointi lisää heti alkuperäisen jälkeen uuden esiintymän **samasta** kohtauslähteestä. Media ja liikkeet säilyvät samassa lähteessä; oma lähdekopio kuuluu A4:ään.
- Järjestäminen siirtää aloitusaikoja, säilyttää kestot, vakionopeuden ja playback-startin. Poisto sulkee aukon ja säilyttää lähdetiedoston, jota toinen esiintymä voi tarvita.
- Tuettu rakenne on aktiivisen koosteen suora ulkoisten kohtausisäntien yhtenäinen jono. Aukot, päällekkäisyydet, ryhmitellyt isännät, ristiriitainen juuren ajoitettu sisältö sekä isäntään kohdistuva tai dynaaminen GSAP-rakenne torjutaan ennen kirjoitusta. Nopeusrampit eivät kuulu tähän.

## Yhteinen toteutus

[sceneStructure.ts](packages/studio/src/ari/sceneStructure.ts) omistaa suljetut operaatiot ja ajoituksen; [sceneOperations.ts](packages/studio/src/ari/sceneOperations.ts) lukemisen, ehdotuksen ja tallennuksen. [AriScenes.tsx](packages/studio/src/ari/AriScenes.tsx) käyttää samaa palvelua kuin [sceneStructureTools.ts](packages/studio/src/webmcp/tools/sceneStructureTools.ts): `studio_scenes`, `studio_prepare_scene`, `studio_edit_scene`. Löydettäviä työkaluja on nyt 23.

`reviewVersion` sitoo operaation sekä isännän ja luetut kohtauslähteet tavuihin. Tallennus valmistelee ehdotuksen uudelleen; vanhentunut lähde tai jo olemassa oleva uusi tiedosto estää kirjoituksen. Nullable `saveProjectFilesWithHistory` tallentaa uuden lähteen ja isännän yhtenä peruttavana muutoksena. Lähteet tarkistetaan myös ennen historian kirjausta. Ehdollinen palautus säilyttää ulkoiset muutokset ja ilmoittaa keskeneräisen palautuksen. Tämä on kompensoiva monitiedostotapahtuma, ei sähkökatkon kestävä transaktio.

Kuitti erottaa tallennetun kohtausisännän `target`/`sourceFile`-kentät fyysisen lapsivalinnan `selectionTarget`/`selectionSourceFile`/`instance`-kentistä. Mukana ovat lähdeversiot, `affectsInstances` ja esikatselun tila. Tallennettu muutos ei muutu epäonnistuneeksi kuitiksi, jos esikatselu ei valmistu.

Integraatiossa korjattiin vanhentuneen poistetun esiintymän muistaminen, valinnan ratkaisu suoraan oikeaan esiintymään, poistetun lähteen valinnan tyhjennys ennen undo-esikatselupäivitystä sekä päällekkäisen dialogitoiminnon käynnistyminen. [useHistoryFileIO.ts](packages/studio/src/hooks/useHistoryFileIO.ts) erottaa historian tiedosto-I/O:n; [historySelection.ts](packages/studio/src/utils/historySelection.ts) käsittelee poistetun lähteen.

## Todellinen näyttö

| Tarkistus                                                            | Tulos                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Kohdennettu lähde-, tiedosto-, historia-, valinta- ja UI-integraatio | 10 tiedostoa, 93 testiä läpi                                                      |
| `ari:test`                                                           | 36 tiedostoa, 456 testiä läpi                                                     |
| Studion ja studio-serverin typecheck                                 | Läpi                                                                              |
| `ari:build`                                                          | Läpi; aiemmat bundle-kokovaroitukset                                              |
| Näkyvä UI-only ja yhdistelmä, 1280×800 ja 1440×900                   | Neljä ajoa, 10 tarkistusta kussakin, `ok: true`                                   |
| Paikallinen koosteen check                                           | `ok: true`, 12 s, 9 näytettä; lint/runtime/layout/motion/contrast ilman löydöksiä |
| Muutettujen tuotantotiedostojen riviraja                             | Kaikki alle 600; suurin koko diffissä 598                                         |
| Koko diffiin kohdistuva rakennetarkistus                             | **Punainen**, katso avoimet asiat                                                 |

[Testiloki](screenshots/2026-09-10-a3-scenes/targeted.log), [Ari-testit](screenshots/2026-09-10-a3-scenes/ari-tests.log), [typecheck](screenshots/2026-09-10-a3-scenes/typecheck.log), [server-typecheck](screenshots/2026-09-10-a3-scenes/server-typecheck.log), [build](screenshots/2026-09-10-a3-scenes/build.log), [selainraportti](screenshots/2026-09-10-a3-scenes/report.json), [koosteen tarkistus](screenshots/2026-09-10-a3-scenes/composition-check.json), [riviraja](screenshots/2026-09-10-a3-scenes/line-gate.json).

[sceneOperations.test.ts](packages/studio/src/ari/sceneOperations.test.ts) käyttää oikeita tiedostoja ja ehdollista palvelinkirjoittajaa: luonti/undo/redo tavuntarkasti, lähteen uudelleenavaus, yhteinen kopio ja median säilyminen, järjestys, poisto, stale-isäntä/lähde, tyhjän olemassa olevan tiedoston ristiriita, toinen kirjoitusvirhe, historiavirhe ja ulkoisen muutoksen säilyttävä osittainen palautus. Nopeus ja playback-start säilyvät testeissä.

[Selainajo](packages/studio/tests/e2e/ari-scene-structure.mjs) luo paikallisen projektin ja kohtaukset osoitetulla UI- tai agenttipolulla, tuo [synteettisen kuvan](packages/studio/tests/e2e/fixtures/ari-authoring/one.png), tarkistaa fyysisen toisen esiintymän, järjestyksen, konfliktista jatkamisen, poistovalinnan, undo/redon ja uudelleenavauksen. Hyväksyntälähteitä ei käsikorjata. Kohtauslähteet ovat tavuntarkasti samat kaikissa ajoissa; juurikoosteet vastaavat projektin yksilöllisen nimen normalisoinnin jälkeen. Ei sivuvirheitä tai korjaavia reload-kutsuja. Raportti erottaa 16 valinnaisen FFmpeg-kyselyn 404-vastausta; MP4-vientiä ei tässä väitetä testatuksi.

Visuaalisesti katsotut esimerkit: [1280:n sisäkkäinen kuva](screenshots/2026-09-10-a3-scenes/ui-only-1280-nested-image.png), [1440:n uudelleenavaus](screenshots/2026-09-10-a3-scenes/ui-only-1440-reopened.png), [yhdistelmän 1280 uudelleenavaus](screenshots/2026-09-10-a3-scenes/mixed-1280-reopened.png), [yhdistelmän 1440 kuva](screenshots/2026-09-10-a3-scenes/mixed-1440-nested-image.png). Kontrollit ja tasoluettelo mahtuvat molempiin kokoihin. Uudelleenavauskuva ei yksin todista ruututarkkaa toistoa; media todetaan lisäksi dekoodatusta sisäkkäisestä kuvasta ja tallennetuista lähteistä.

Offline-esto oli käytössä ennen ensimmäistä avausta sekä palvelimessa että selaimessa. Selainten ulkoisten pyyntöjen listat ovat tyhjät. [Palvelinloki](screenshots/2026-09-10-a3-scenes/server-network.jsonl) sisältää 442 **estettyä** fonttihakuyritystä kehityksen ja hyväksyntäajojen aikana; [check-loki](screenshots/2026-09-10-a3-scenes/check-network.jsonl) kaksi estettyä yritystä. Näitä ei pidä kuvata nollaksi hakuyritykseksi. Esto tapahtuu ennen ulkoista verkkokutsua.

## Toistaminen

Repon juuressa, käyttäen kahta foreground-terminaalia selainkokeelle:

```sh
npx --yes bun run --cwd packages/studio test src/ari/sceneOperations.test.ts src/ari/AriScenes.test.tsx src/ari/AriElements.test.tsx src/ari/useElementReceiptSelection.test.tsx src/webmcp/tools/sceneStructureTools.test.ts src/webmcp/tools/selectionTools.test.ts src/utils/historySelection.test.ts src/utils/nullableHistory.test.ts src/hooks/useAppHotkeys.test.ts src/hooks/usePersistentEditHistory.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run --cwd packages/studio-server typecheck
npx --yes bun run ari:build
ARI_OFFLINE_LOG="$PWD/screenshots/2026-09-10-a3-scenes/server-network.jsonl" npx --yes bun run ari:studio --port 3084 --offline --project packages/studio/tests/e2e/fixtures/ari-scenes
```

Toisessa terminaalissa: `npx --yes bun run ari:test:scene-structure`. Lopuksi pysäytä ensimmäisen terminaalin oma palvelin. Koosteen lisätarkistus: `npx --yes bun packages/studio/tests/e2e/ari-check-offline.ts check <luodun-projektin-hakemisto> --json`; tarkka projektitunnus löytyy selainraportista. Paikallinen runner kytkee offline-eston sekä poistaa telemetry/update-haut käytöstä ennen CLI:n lataamista.

## Avoimet asiat

[Erän alkuperäinen rakennetarkistus](screenshots/2026-09-10-a3-scenes/structure.log) ei läpäissyt: kolme dead-code-löydöstä, 14 monimutkaisuuslöydöstä ja 45 toistoryhmää. Mukana on myös tämän erän scene-työkalun execute, valinnan palautus sekä UI-/testitoistoa; kaikkea ei voi selittää aiemmilla erillä. Ei ohituksia. Tämä portti on sittemmin korjattu erillisessä rakenteen korjauserässä; uusi näyttö on alla.

A4:n oma lähdekopio, A5:n oikeat vientivertailut, pysyvä versiovertailu, koko paneelin uudistus ja muistikirja jäävät seuraaviin eriin. Ihmistestiä ei tehty. Fonttihakuyritysten poistaminen compilerista kokonaan on erillinen parannus; offline-esto pitää paikallisen työn suljettuna.

## Rakennetarkistuksen korjaus

Aiempi punainen rakennetarkistus on korjattu muuttamatta asetuksia, baselinea tai tarkistuksen kattavuutta. Yhteisen valinnan revision-suoja, juuren vaikutusmäärä ja nullable-historian ehdollinen palautus säilyvät. Uusi erillinen näyttö ja ajurien regressiot ovat [rakenteen korjausraportissa](ARI-NEXT-STRUCTURE-REPAIR.md). Edellisten erien lokit jäävät historialliseksi näytöksi; niiden punainen tulos ei kuvaa nykyistä porttia.
