# A3:n luonti- ja poistohistorian perusta

Toteutettu paikallisesti hyperframes-ari-repossa. Tämä erä valmistelee A3:n rakenneoperaatiot. A3:n käyttöliittymä, B3–B5:n versiovertailu ja koko A–D-speksi eivät ole valmiita. Ei commitia, pushia tai maksullisia kutsuja; 0 USD.

## Toteutus

- [editHistory.ts](packages/studio/src/utils/editHistory.ts): snapshotin ennen/jälkeen-arvo on string tai null. Null tarkoittaa puuttuvaa tiedostoa, tyhjä merkkijono olemassa olevaa tyhjää tiedostoa. Version 1 tietomuoto ja vanhojen merkkijonojen hashit säilyvät. Null käyttää erillistä absent-tunnistetta.
- [studioFileHistory.ts](packages/studio/src/utils/studioFileHistory.ts): yhteinen saveProjectFilesWithHistory hyväksyy nullable-snapshotit ja kirjaa yhden monitiedostomuutoksen. Vanhat string-kutsujat säilyvät tyyppiturvallisina. diskContent on erillinen kirjoitusennakkoehto: myös eksplisiittinen null välitetään sellaisenaan; se ei korvaa historian ennen-arvoa eikä palautuksen lähtötilaa.
- [usePersistentEditHistory.ts](packages/studio/src/hooks/usePersistentEditHistory.ts): undo ja redo tarkistavat sekä sisällön että puuttumisen ja käyttävät samaa [kompensoivaa transaktiota](packages/studio/src/utils/conditionalFileTransaction.ts). Historian tallennus kuuluu transaktion loppuvaiheeseen. Tallennusvirhe yrittää kaikki tiedostopalautukset ja jättää molemmat historiapinot ennalleen. Ulkopuolinen muutos säilytetään ja keskeneräinen palautus ilmoitetaan.
- [editHistoryStorage.ts](packages/studio/src/utils/editHistoryStorage.ts): IndexedDB-kuittaus odottaa transaktion valmistumista, ei pelkkää put-pyynnön onnistumista. Abortti hylätään. Aiempi muistihistoriaan hiljaa putoava tallennusfallback poistettiin: onnistumista ei kuitata, jos historia ei tallentunut.
- [nullableProjectFiles.ts](packages/studio/src/utils/nullableProjectFiles.ts): projektikohtainen lukija ja ehdollinen kirjoittaja käyttävät A1–A2:n source- ja source-transaction-palveluja. SHA-256-ennakkoehto erottaa puuttuvan ja tyhjän tiedoston. Puuttuva ennakkoehto ja virheellinen lukuvastaus torjutaan.
- [useAppHotkeys.ts](packages/studio/src/hooks/useAppHotkeys.ts) ja [App.tsx](packages/studio/src/App.tsx): aktiivisen projektin undo/redo lukee nullable-lähdetilan; luonti/poisto käyttää ehdollista palvelua. Olemassa olevien tiedostojen string-kirjoitukset säilyttävät nykyisen kirjoittajan versionhallinnan ja editorisynkronoinnin. [gsapUndoRestore.ts](packages/studio/src/utils/gsapUndoRestore.ts) ohjaa luonti-/poistopalautuksen rakenteelliseen esikatselupäivitykseen; null ei muutu tyhjäksi HTML:ksi.
- [studioFileMutationCoordinator.ts](packages/studio/src/utils/studioFileMutationCoordinator.ts): jonon avain on kirjoittajan identiteetti ilman string-only-funktiotyypin rajoitetta. Jonotusalgoritmi ei muuttunut.

## Todellinen näyttö

[nullableHistory.test.ts](packages/studio/src/utils/nullableHistory.test.ts): **13 testiä** oikeissa väliaikaisissa hakemistoissa ja A1–A2:n [commitConditionalFiles-palvelulla](packages/studio-server/src/ari/conditionalFiles.ts). Näyttö kattaa tyhjän tiedoston luonnin, poiston, monitiedostoisen yhden merkinnän, CRLF/ääkköstavut, undo/redon ja historiatiedoston uudelleenlatauksen. Ulkoisesti luotu, muutettu ja uudelleen luotu tiedosto estää palautuksen. Tallennuksen, undon ja redon historiavirheet testaavat myös palautuksen ristiriidan: viimeksi kirjoitettu tiedosto jää ulkopuolisen kirjoittajan omistukseen, mutta muut palautukset tehdään. Erilliset testit kattavat onnistuvan kokonaispalautuksen, osittaisen kirjoitusvirheen, eksplisiittisen null-diskContentin ja vanhan version 1 historian.

[nullableProjectFiles.test.ts](packages/studio/src/utils/nullableProjectFiles.test.ts): **3 testiä** HTTP-sopimuksen puuttumisesta, tyhjästä tiedostosta, ehdollisesta luonnista/poistosta ja virhevastauksista. Nämä ovat mockattuja HTTP-sopimustestejä, eivät selainajoja.

[editHistoryStorage.nullable.test.ts](packages/studio/src/utils/editHistoryStorage.nullable.test.ts): **2 testiä** fake-indexeddb:llä. Uusi adapteri lukee nullable-snapshotit; keskeytetty transaktio hylätään ja aiemmin tallentunut historia säilyy. Oikean selaimen IndexedDB-ajoa ei tehty tässä erässä.

| Tarkistus                                         | Tulos                                              | Näyttö                                                                 |
| ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Historia-, tiedosto-, SDK- ja hotkey-regressio    | 14 tiedostoa, 105 passed, 2 aiempaa todo-testiä    | [tests.log](screenshots/2026-09-09-nullable-history/tests.log)         |
| IndexedDB-tallennus                               | 1 tiedosto, 2 passed                               | [indexeddb.log](screenshots/2026-09-09-nullable-history/indexeddb.log) |
| ari:test                                          | 27 tiedostoa, 389 passed                           | [ari-tests.log](screenshots/2026-09-09-nullable-history/ari-tests.log) |
| Studio typecheck ilman incremental-välimuistia    | exit 0                                             | [typecheck.log](screenshots/2026-09-09-nullable-history/typecheck.log) |
| Tämän erän muutettujen tiedostojen oxfmt / oxlint | läpi; 0 varoitusta, 0 virhettä                     | Paikallinen komento                                                    |
| git diff --check                                  | läpi                                               | Paikallinen komento                                                    |
| Tämän erän tuotantotiedostojen riviraja           | kaikki alle 600; App.tsx 598, useAppHotkeys.ts 597 | wc -l                                                                  |

Onnistuneet testiajot palauttivat exit 0, mutta Vitest tulosti sulkemisen yhteydessä close timed out after 10000ms -varoituksen. Varoitusta ei piilotettu. Source map -varoitukset johtuvat alla kuvatusta generoitujen karttojen siivouksesta.

## Seuraavan rakenne-erän rajapinta

Luo projektikohtainen vakaa I/O-instanssi nullableProjectFiles(projectId). Kutsu saveProjectFilesWithHistory kerran koko operaatiolle, tyyppiparametrilla string | null. files sisältää luotavien tiedostojen sisällön ja poistettaville null-arvon; readFile, writeFile ja recordEdit tulevat samasta projektista. Älä anna erillisille rakenneoperaatioille yhteistä coalesceKeytä. Säilytä kirjoittajan tai jonotusavaimen identiteetti, jotta saman projektin rinnakkaiset kirjoitukset käyttävät yhteistä jonoa.

Undo/redo-kontrollerin callbacks hyväksyy samat nullable-lukijan ja ehdollisen kirjoittajan. Palautuksen files[path] sisältää nullable-arvot previous ja restored. Rakenteellinen esikatselu ja tiedostopuun päivitys kuuluvat A3:n operaatioon; tämän erän palvelutestit eivät todista uuden A3-paneelin käytettävyyttä.

Tämä on kompensoiva prosessitason transaktio, ei sähkökatkon kestävä levyloki. IndexedDB on edelleen selainkohtainen historia, ei projektissa kulkeva B3–B5-versiosäilö. Vanha historia ei voi päätellä jälkikäteen, tarkoittiko aiempi tyhjä merkkijono puuttuvaa tiedostoa: ristiriidassa palautus pysähtyy turvallisesti.

## Komennot ja ympäristö

Levy täyttyi työn aikana. Poistettiin vain generoituja packages/\*/dist-source mappeja, Studion TypeScript/Vite-välimuistia ja käyttäjän pnpm-välimuisti; lähteitä, aineistoja, aiempia raportteja tai videoita ei poistettu. Tavallinen npx yritti aluksi bunin npm-rekisterihakua ja epäonnistui ENOSPC-virheeseen. Loput ajot käytettiin jo asennetulla bun 1.4.2:lla npx:n offline-komentotilassa, jotta uusia verkkohakuja ei tarvita. Tuotepalveluita tai maksullisia tarjoajia ei kutsuttu. Palvelimia ei käynnistetty.

Komennot repon juuresta. PATHiin lisättiin tämän koneen olemassa oleva /Users/jarihuomo/.npm/\_npx/5c4f1b4a21be27f7/node_modules/.bin ja npm_config_offline=true. Jokainen bun-komento suoritettiin npx --yes -c -kutsun sisällä; esimerkiksi npx --yes -c 'bun run ari:test'.

- bun run --cwd packages/studio test src/utils/nullableHistory.test.ts src/utils/nullableProjectFiles.test.ts src/utils/editHistory.test.ts src/utils/editHistoryStorage.test.ts src/utils/studioFileHistory.test.ts src/utils/conditionalFileTransaction.test.ts src/utils/atomicGsapAdd.test.ts src/utils/gsapUndoRestore.test.ts src/hooks/usePersistentEditHistory.test.ts src/hooks/usePersistentEditHistory.projectOwnership.test.tsx src/hooks/useRazorSplit.history.test.tsx src/hooks/useAppHotkeys.test.ts src/hooks/useAppHotkeys.textEditing.test.tsx src/hooks/useAppHotkeys.previewForwarding.test.tsx
- bun run --cwd packages/studio test src/utils/editHistoryStorage.nullable.test.ts
- bun run ari:test
- bun run --cwd packages/studio typecheck --incremental false
- ./node_modules/.bin/oxfmt --check ja ./node_modules/.bin/oxlint tämän erän 14 TS/TSX-tiedostolle; Markdownit lisäksi oxfmtillä.
- git diff --check

Lokit ovat gitignored screenshots-hakemistossa. Repossa kulkevat testit luovat oman synteettisen aineistonsa. Ei selain-UX-, vienti- tai ihmistestausta tässä erässä; seuraavan erän hyväksyntää ei päätellä näistä testeistä.
