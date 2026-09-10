# Ari Studio: B1–B2, ensimmäinen toteutuserä

Toteutettu paikallisesti 9.9.2026 branchissa `ari/agent-studio`, repossa `/Users/jarihuomo/Documents/GitHub/hyperframes-ari`. Ei commitia, pushia, palvelimia, ulkoisia palvelukutsuja tai maksuja (0 USD). Alussa olemassa ollut untracked-speksi säilytetty. [Toteutussuunnitelma](plans/2026-09-09-ari-studio-next-implementation.md) kattaa A1–D7:n, riippuvuudet, yhteiset UI/agenttipolut, mitoituksen ja myöhemmät testausvaiheet. Koko speksi ei ole valmis.

## Toteutus ja näyttö

- **B1, tunniste ja ensimmäinen liike:** [atomicGsapAdd.ts](packages/studio/src/utils/atomicGsapAdd.ts) rakentaa oikeassa irrallisessa SDK-dokumentissa sekä tunnisteen että liikkeen. Vain valmis dokumentti tallentuu nykyisen `persistSdkSerialize`-jonon, ehdollisen projektikirjoittajan ja yhden ennen/jälkeen-historiamerkinnän kautta. Toimii myös sisäkkäisen kohtauksen lähdetiedostoon. [useGsapAnimationOps.ts](packages/studio/src/hooks/useGsapAnimationOps.ts) on sekä UI:n että agentin yhteinen lisäyskäsittelijä. Erillinen tunnisteen POST poistui. [gsapScriptCommitHelpers.ts](packages/studio/src/hooks/gsapScriptCommitHelpers.ts) valmistelee osoitteen muuttamatta esikatselun DOMia.
- **B1, undo/redo:** [usePersistentEditHistory.ts](packages/studio/src/hooks/usePersistentEditHistory.ts) vertaa nyt myös kokonaisia lähdetavuja eikä luota vain lyhyeen hash-arvoon. [useAppHotkeys.ts](packages/studio/src/hooks/useAppHotkeys.ts) välittää historian lukeman sisällön kirjoittajan `expectedContent`-ennakkoehdoksi. Sama toiminto palvelee työkalujen ja UI:n perumista. Latautumaton historia ei enää kuittaa kirjausta onnistuneeksi.
- **B2, epäonnistuminen ja ristiriidat:** SDK-ehdokkaan epäonnistunut liike ei kirjoita edes tunnistetta. Historian kirjausvirhe palauttaa SDK-kirjoituksen lähtötavut. Poistettu kohde, jonossa vanhentunut lähde ja kirjoitushetken ristiriita torjutaan. [conditionalFileTransaction.ts](packages/studio/src/utils/conditionalFileTransaction.ts) hoitaa nyt sekä yhteisen tallennuspalvelun että undo/redo-polun monitiedostopalautuksen ehdollisesti, yrittää palauttaa kaikki jo kirjoitetut tiedostot ja ilmoittaa myös palautuksen epäonnistumisen. Ulkoisen kirjoittajan tavuja ei korvata palautuksella.

[atomicGsapAdd.test.ts](packages/studio/src/utils/atomicGsapAdd.test.ts): 7 testiä oikealla SDK:lla — yksi kirjoitus/merkintä, tunniste + ensimmäinen nested-liike, tavuntarkka undo, redo, liikkeen rakennusvirhe, historiavirhe, poistettu kohde, jonon ristiriita ja kirjoitus-/undo-kilpailutilanteet. Osa näistä on saman testin peräkkäisiä väitteitä.

[conditionalFileTransaction.test.ts](packages/studio/src/utils/conditionalFileTransaction.test.ts): 4 testiä oikeassa väliaikaisessa tiedostohakemistossa — toisen tiedoston kirjoitusvirhe, yhteisen tallennuspalvelun historiavirhe sekä palautuksen ristiriita apurin ja yhteisen tallennuspalvelun kautta. Tavujen vertailu sisältää CRLF/LF-rivinvaihdot ja ääkköset. Hakemistot poistetaan testin jälkeen.

[useGsapAnimationOps.test.tsx](packages/studio/src/hooks/useGsapAnimationOps.test.tsx) todistaa myös käsittelijän kytkennän atomiseen kirjoittajaan ilman erillistä legacy-mutaatiota. Osoitteen valmistelun aiempi testi odotti välitöntä DOM-muutosta; se päivitettiin vaatimaan muuttumatonta esikatselua ennen tallennusta ja yhä yksiselitteistä kohdetta tallennetun tunnisteen jälkeen. SDK kirjoittaa liikkeen `data-hf-id`-valitsimella; testissä tarkistetaan tämä todellinen kohde eikä oleteta `#id`-valitsinta.

## Tarkat tarkistukset

Kaikki komennot fork-repon juuresta. Ensimmäisen erän tulokset (ennen alla kuvattua auditointikorjausta): [testiloki](screenshots/2026-09-09-next-b1-b2/tests.log), [build-loki](screenshots/2026-09-09-next-b1-b2/build.log), [rakennetarkistus](screenshots/2026-09-09-next-b1-b2/fallow.json). Kuvakaappaushakemisto on gitignored; toteutus ja testit eivät tarvitse sitä.

```sh
npx --yes bun run --cwd packages/studio test src/utils/atomicGsapAdd.test.ts src/utils/conditionalFileTransaction.test.ts src/utils/studioFileHistory.test.ts src/hooks/newTweenTarget.test.ts src/hooks/useGsapAnimationOps.test.tsx src/hooks/usePersistentEditHistory.test.ts src/hooks/usePersistentEditHistory.projectOwnership.test.tsx src/utils/editHistory.test.ts src/utils/sdkCutover.test.ts src/hooks/useAppHotkeys.test.ts
npx --yes bun run ari:test
npx --yes bun run --cwd packages/studio typecheck
npx --yes bun run ari:build
npx --yes bun x fallow audit --base origin/main --format json
```

| Tarkistus                              | Tulos                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Kohdennettu komento yllä               | 10 tiedostoa, **151 passed / 2 todo**, exit 0                                                                              |
| ari:test                               | 26 tiedostoa, **383 passed**, exit 0                                                                                       |
| Studio typecheck                       | exit 0                                                                                                                     |
| ari:build                              | exit 0; olemassa olevat bundle-kokohuomautukset                                                                            |
| Fallow                                 | **pass**, 0 uutta dead-code-, kompleksisuus- tai toistolöydöstä; 1 peritty kompleksisuuslöydös ja 18 perittyä toistoryhmää |
| oxfmt / oxlint                         | 13 lähde- ja dokumenttitiedoston muotoilu kunnossa; 11 kooditiedostoa, 0 varoitusta / 0 virhettä                           |
| Dokumenttien linkit / git diff --check | kaikki linkitetyt polut löytyvät; diff tarkistus puhdas                                                                    |
| Muuttuneet tuotantotiedostot           | alle 600 riviä                                                                                                             |

Vitest ilmoitti osassa ajoista onnistuneen tuloksen jälkeen aiemman teardown-viiveen; prosessit poistuivat exit 0. Ensimmäisessä rakennetarkistuksessa oli yksi uusi testin toistolöydös; yhteinen tavujen vertailu erotettiin apufunktioksi ja tarkistus ajettiin uudelleen ilman ohituksia.

## Auditointikorjaus: yhteinen palautuspolku

Auditoinnissa alkuperäinen 151 passed / 2 todo -tulos varmistui, mutta ristiriitatesti koski vain apuria: `saveProjectFilesWithHistory` käytti vielä erillistä, ensimmäiseen palautusvirheeseen pysähtyvää silmukkaa. [studioFileHistory.ts](packages/studio/src/utils/studioFileHistory.ts) käyttää nyt samaa `writeConditionalFiles`-apuria kuin undo/redo. Palautus yrittää jokaisen jo kirjoitetun tiedoston ja kokoaa alkuperäisen virheen sekä palautusvirheet `AggregateError`-virheeseen.

Apurin viides argumentti `expectedContent` erottaa kirjoitushetken levysisällön palautuksen lähtötavuista. Yhteinen tallennus välittää siihen `diskContent`-arvon: puuttuva polku käyttää edelleen `before`-arvoa. Palautus odottaa omia `after`-tavuja ja palauttaa historian `before`-tavut; ulkoista muutosta ei ylikirjoiteta.

Uusi yhteisen tallennuspalvelun testi kirjoittaa kaksi tiedostoa käyttäen historiasta poikkeavia levyn ennakkoehtoja. Historiakutsu varmistaa molemmat kirjoitukset, muuttaa ensimmäisen palautettavan tiedoston ulkoisesti ja epäonnistuu. Testi tarkistaa alkuperäisen virheen ja ristiriidan raportoinnin, toisen tiedoston tavuntarkan palautuksen sekä ulkoisten tavujen säilymisen.

[usePersistentEditHistory.test.ts](packages/studio/src/hooks/usePersistentEditHistory.test.ts) lisää saman virhepolun erikseen undo- ja redo-toiminnoille: kaksi kirjoitusta onnistuu, kolmas epäonnistuu ja ensimmäinen palautus törmää ulkoiseen muutokseen. Kaikki palautusyritykset tehdään, muut tavut palautuvat ja sekä muistissa että tallennuksessa olevat historiapinot säilyvät ennallaan. Undo/redo käytti jo yhteistä apuria, joten sen tuotantokoodia ei tarvinnut muuttaa.

Korjauksen tarkistukset (9.9.2026):

- Yllä oleva kymmenen tiedoston kohdennettu testikomento: **154 passed / 2 todo**, exit 0. [Uusi testiloki](screenshots/2026-09-09-next-b1-b2/rollback-audit-tests.log).
- Neljän suoraan kosketetun testitiedoston ajo: **30 passed**, exit 0; Vitestin aiempi teardown-viive ilmoitettiin tämän ajon lopussa.
- `npx --yes bun run --cwd packages/studio typecheck`: exit 0.
- `npx --yes bun x oxlint` neljälle muutetulle kooditiedostolle: **0 warnings / 0 errors**.
- `npx --yes bun x oxfmt --check` samoille neljälle tiedostolle ja tälle raportille sekä `git diff --check`: puhtaat.
- Ari-kokonaisajoa, buildia tai Fallow-tarkistusta ei uusittu tässä rajatussa korjauksessa; yllä olevan taulukon niiden tulokset ovat ensimmäisestä erästä.

## Seuraavan erän rajapinta ja rajat

- `persistAtomicGsapAdd(selection, autoId, spec, path, deps)` käyttää olemassa olevaa projektisidonnaista `CutoverDeps`-kirjoittajaa/lukijaa ja `recordEdit({label, kind, files: {[path]: {before, after}}})`-rajapintaa. Tallennuksen jälkeen agentin nykyinen readback palauttaa lähteen SHA-256-version. Tuleva versiosäilö voi käyttää samoja ennen/jälkeen-tavuja, mutta saa oman pysyvän versiotunnisteen ja mediaviittaukset.
- `writeConditionalFiles(files, before, write, finish?, expectedContent?)` on perumisen kompensoiva monitiedostokirjoitus. `write`-toteutuksen on toteutettava odotettujen tavujen tarkistus. Uudet A-erän operaatiot eivät saa palata sarjaan irrallisia POST-kirjoituksia.
- Tämä ei vielä ole kaatumisesta tai sähkökatkosta palautuva levytapahtumaloki. Jatkoerässä historian tallennusvirhe muutettiin näkyväksi epäonnistumiseksi, joka palauttaa lähteet; **B3–B5** tarvitsee projektissa säilyvän versiosäilön ja palautumistestin. Luonti/poisto on sittemmin liitetty nullable-snapshotteihin; ks. [A3:n historiaperustan eräraportti](ARI-NEXT-NULLABLE-HISTORY.md). Tämän raportin alkuperäiset testiluvut kuvaavat B1–B2-erää, eivät jatkoerää.
- Atominen lisäys tarvitsee SDK:n tunnistaman kohteen ja tuetun GSAP-aikajanan. Ilman niitä se kieltäytyy ennen tunnisteen tallentamista. A-erän tyhjän ja mallipohjan pitää sisältää toimiva aikajana. Muiden vanhojen kirjoitusperheiden täydellistä migraatiota ei väitetä tehdyksi.
- Ei uutta browser-UX-ajoa, videovientiä tai ihmistestausta tässä rajatussa perustan erässä. A5/B5/C5:n näkyvät polut, vertailukuvat ja molemmat näkymäkoot ovat seuraavien erien hyväksyntänäyttöä. Ihmistestin tavoite odottaa oikeita testaajia.
