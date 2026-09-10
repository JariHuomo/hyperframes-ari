# Ari Studio: toteutussuunnitelma A–D

Tila: A3:n elementtipalvelu tukee nyt myös vanhan paikallisen pohjan tekstejä, kuvia ja taustoja sekä erillisiä liikkuvia kopioita. Lähde-, tiedosto- ja UI-integraatiotestit tehty: neljä näkyvää ajoa (UI-only/yhdistelmä × kaksi näkymäkokoa), 14 tarkistusta kussakin. Yhteinen valinta, toisen esiintymän fyysinen kohde, kopion liikkeet, sisäkkäinen kuva, undo/redo ja ristiriidasta jatkaminen on todennettu. Ks. [A3-elementtieräraportti](../ARI-NEXT-A3-ELEMENTS.md). A3:n nullable-historiaperusta toteutettu ja testattu; ks. [eräraportti](../ARI-NEXT-NULLABLE-HISTORY.md). B1–B2 ja A1–A2 toteutettu ja kohdennetusti testattu; ks. [B1–B2-eräraportti](../ARI-NEXT-B1-B2.md) ja [A1–A2-eräraportti](../ARI-NEXT-A1-A2.md). A3:n kohtausoperaatiot on nyt toteutettu tuetulle peräkkäiselle rakenteelle; ks. [kohtausraportti](../ARI-NEXT-A3-SCENES.md). A4 on toteutettu itsenäisille kohtauslähteille; ks. [A4-eräraportti](../ARI-NEXT-A4.md). A5:n vientivastaavuus on toteutettu ja todennettu; ks. [A5-eräraportti](../ARI-NEXT-A5.md). B3–B5:n projektikohtainen versiosäilö ja näkyvä vertailu on toteutettu ja testattu; C1–C4 ja C5:n automaatiopolku on toteutettu; ihmistesti odottaa; D1:n muistikirjaosuus ja D3:n havaintokirjaus on toteutettu, ja rajattujen lähdetoimintojen kuitit sekä D2:n tuloksen selvitys on nyt toteutettu; D4:n palvelinpaketti sisältää muuttuneiden liikerajojen ruudut, ja sen näkyvä Tarkistus-polku, viisi rajattua agenttityökalua sekä pakettiin ja versioon sidotut erilliset arviot (viesti/ulkoasu/liike/ääni) on nyt toteutettu ja hyväksyntätestattu molemmissa näkymäkoissa; D4:n tekninen laajuus on valmis, mutta katselua, laatuhyväksyntää tai ihmistestiä ei väitetä. D5:n tehtäväkohtainen korjauskierrosraja ja hyväksytyn tekstin suoja on nyt toteutettu yhteiseen kirjoituspolkuun ja hyväksyntätestattu molemmissa näkymäkoissa; ks. [D5-eräraportti](../ARI-NEXT-D5-D7.md). D6:n Pysäytä työ ja D7:n versiosidottu paikallinen hyväksyntä sekä luonnosviennin merkintä on nyt toteutettu samaan yhteiseen kirjoituspolkuun ja hyväksyntätestattu molemmissa näkymäkoissa; ks. [D6–D7-osuus](../ARI-NEXT-D5-D7.md#d6--pysäytä-työ). Ihmistestiä ei ole tehty. Koko toimituksen loppuregressio A1–D7 on nyt ajettu yhdestä työpuusta neljällä näkyvällä polulla; ks. [loppuraportti](../ARI-NEXT-FINAL.md). C-erän laajemman regression kahden istunnon historiaongelma on nyt korjattu ja neljän näkyvän polun hyväksyntänäytöllä todennettu, ks. [C-raportti](../ARI-NEXT-C-PANEL.md). Ks. [näkyvän vertailun eräraportti](../ARI-NEXT-B-COMPARISON.md). Ks. [versiosäilön eräraportti](../ARI-NEXT-B-VERSION-STORE.md). A–C ja D:n paikallinen vähimmäisversio hyväksytty; E, malliajo ja julkaisu rajattu pois. Työhakemisto on `/Users/jarihuomo/Documents/GitHub/hyperframes-ari` (olemassa oleva fork), ei AdForge.

## Lähtötilanne ja yhteinen kirjoituspolku

Lähteet: [speksi](2026-09-09-ari-studio-next-features-spec.md), [UX-raportti](../ARI-SPRINT-FINAL-UX.md), `packages/studio/src/hooks/useGsapAnimationOps.ts`, `utils/sdkEditTransaction.ts`, `utils/studioFileHistory.ts` ja `hooks/usePersistentEditHistory.ts` Studio-src:n alla. UI:n AriMotion käyttää agenttisiltaa; agenttityökalu ja paneeli päätyvät samaan addGsapAnimation-käsittelijään. Ennen B1–B2-erää tunnisteen POST ja liikkeen POST olivat erillisiä: historia ei sisältänyt tunnisteettomia lähtötavuja. Tämä lähtötilan puute on korjattu yhteisellä atomisella lisäyksellä; undo/redo välittää nyt odotetut tavut kirjoituksen ennakkoehdoksi.

Ratkaisu: rakenna tunniste ja liike irrallisessa SDK-dokumentissa; tarkista kohde, kirjoita vain valmis dokumentti ehdollisesti ja kirjaa yksi ennen/jälkeen-merkintä. Käytä nykyistä projektikohtaiseen kirjoittajaan sidottua tiedostojonoa, itse kirjoitetun tiedoston tokenia ja samaa esikatselun päivitystä. Virhe ei saa pudota vanhaan kahden POSTin polkuun. Undo/redo välittää odotetut tavut myös palvelimen kilpailutilanteiden torjuntaan. Monitiedostotallennus palauttaa jo kirjoitetut tiedostot ehdollisesti; palautusvirhe raportoidaan, ei peitetä. Tämä on prosessin sisäinen kompensoiva transaktio, ei sähkökatkon kestävä levytapahtuma.

## Erät ja hyväksymiskriteerien kattavuus

| Erä | Kriteerit | Toteutus ja tiedostot                                                                                                                                                                      | Näyttö                                                                                                                                                                                |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | B1–B2     | Yhteinen atominen lisäys `hooks/useGsapAnimationOps.ts`, uusi `utils/atomicGsapAdd.ts`; `sdkEditTransaction.ts`, `studioFileHistory.ts`, `usePersistentEditHistory.ts`, `useAppHotkeys.ts` | Oikea SDK, lähtötavujen palautus, redo, osittainen kirjoitusvirhe, historian virhe, poistettu kohde ja kilpailutilanne. Ei koko speksin valmistumisväitettä.                          |
| 2   | A1–A2     | Toteutettu: `packages/studio-server/src/ari/`, `routes/ariAuthoring.ts`, `ari/AriProjects.tsx`, `ari/AriProjectStart.tsx` ja `webmcp/tools/projectTools.ts`                                | 33 palvelutestiä, näkyvä UI-only/yhdistelmäajo, kuvatyyppien kopiointi, rajat ja uudelleenavaus; ks. eräraportti                                                                      |
| 3   | A3–A5     | SDK-rakenneoperaatiot saman transaktion kautta; uusi Ari-rakennepaneeli ja webmcp-vastineet                                                                                                | Lisää/nimeä/kopioi/poista/järjestä kaikki neljä tyyppiä; yhden esiintymän oma kopio; uudelleenavaus; UI-only ja yhdistelmäpolku                                                       |
| 4   | B3–B5     | Uusi projektin sisäinen versiosäilö ja erillinen vain luku -esikatselu; `ari/AriEase.tsx` nykyisen näennäisvertailun korvaus                                                               | Edellinen/nykyinen oikeasti eri ruuduissa, yhteinen seek, aktiivinen lähde ennallaan, palautus peruttava, puuttuvat tavut estävät vertailun                                           |
| 5   | C1–C5     | `ari/AriControlPanel.tsx`, `AriProperties.tsx`, `AriMotion.tsx`, `AriEase.tsx`, `AriLayers.tsx`, `AriNumber.tsx`                                                                           | Molemmat 1280×800 ja 1440×900; pääsäädöt ilman vieritystä, valinta/undo/poisto, desimaalipilkku, näppäimistö ja nimet. Ihmistesti erikseen.                                           |
| 6   | D1–D3     | Uusi projektin muistikirjapalvelu, UI ja webmcp-toiminnot; vaiheiden toiminto-ID ja lähdeversio                                                                                            | Jatkaminen ei toista valmista työtä; epäselvä keskeneräinen kirjoitus sovitetaan lähteeseen; käyttäjän muutos huomioidaan; havainnon tekijä näkyy                                     |
| 7   | D4–D7     | Muistikirjaan sidottu tarkistus/korjaus ja `ari/AriFrameEvidence.tsx`, `ari/AriExport.tsx`                                                                                                 | Alku/loppu/liikerajat/koko video ja kattavuus; viesti/ulkoasu/liike/ääni erikseen; enintään kaksi korjauskierrosta, pysäytys, versiomuutoksen vanhennus, luonnosvienti ei hyväksyntää |

Polut ilman packages-etuliitettä tarkoittavat `packages/studio/src/`-hakemistoa. Erien 1–2 sekä erän 3 A3-elementti- ja kohtauspalvelut ovat nyt olemassa. Erän 3 A4 on toimitettu tuetuille itsenäisille kohtauslähteille. A5:n oikea vientivertailu on toimitettu. Erän 4 versiosäilö on toteutettu. Sen näkyvä versiovertailu on toteutettu; erä 5 on teknisesti toteutettu ihmistestiä lukuun ottamatta; erät 6–7 ovat edelleen suunniteltuja. Riippuvuudet: 1 → 2 → 3; 1 ja 2 → 4; 3 ja 4 → 5; versiosäilö → 6 → 7. Jokainen kirjoittava agenttitoiminto käyttää samaa palvelua kuin näkyvä kontrolli; ei mielivaltaista koodityökalua eikä 12 työkalun ylärajaa.

## Paikalliset päätökset ja mitoitus

Mittaus 9.9.2026 Pythonin stat-luvuilla: repossa kulkevan ari-scenes-fixturen HTML:t 7162 + 4284 + 3369 = 14815 tavua. Nykyinen historia pitää enintään 100 merkintää; koko kolmikon ennen/jälkeen-kopiot sadalle muutokselle ovat 2963000 tavua ennen JSON-kuluja. Paikallisten examples-kuvien 69 PNG/JPEG/WebP-tiedoston mediaani 765193 ja maksimi 770479 tavua; aineisto on pieni eikä osoita suurten kuvien dekoodauksen suorituskykyä.

Versiosäilön aloitusbudjetti: automaattiset lähdesnapshotit enintään 100 merkintää ja 32 MiB serialisoitua UTF-8-dataa (noin 11 kertaa mitattu sadan merkinnän lähdemäärä). Media tallennetaan checksumilla kerran, ei sadan snapshotin mukana. Nimettyjä tarkistusversioita ei siivota automaattisesti; niiden tilankäyttö näytetään, poistaminen on käyttäjän toimi. Nykyistä IndexedDB-historiaa ei kuvata vielä projektin pysyväksi versiosäilöksi.

Kuvatuonnin alkuarvot: 8 MiB/tiedosto, 16 megapikseliä dekoodattuna ja yksi dekoodaus kerrallaan. 8 MiB antaa yli kymmenkertaisen tilan mitattuun maksimiin; 16 MP tarkoittaa 64 MB raakaa RGBA-kuvaa. A2-mittaus on tehty: 1/4/16 MP hyväksyttiin ja 16,81 MP hylättiin. Lisäksi 6 763 537 tavun kohina-PNG hyväksyttiin ja 12 023 329 tavun PNG hylättiin ennen dekoodausta. Rajat vahvistettiin 8 MiB / 16 MP:iin, yksi dekoodaus kerrallaan ja 10 sekunnin dekoodausraja. Tarkat viiden ajon luvut ja rajauksen perusteet ovat A1–A2-eräraportissa; ne eivät ole yleisiä vasteaikalupauksia. SVG:t jäävät tuonnin ulkopuolelle, vaikka aiempi fixture käyttää niitä. A2:n versionoitavat rasterifixturet ja generaattori ovat packages/studio/tests/e2e/fixtures/ari-authoring- ja packages/studio-server/scripts/-hakemistoissa; A5 voi käyttää niitä.

Mallipohja: äänetön seitsemän sekunnin 9:16, koko ajan peittävä tausta, tuotekuva, pääviesti ja CTA; ei hintaa tai keksittyä tarjousta. Yksi aktiivinen kirjoittaja, odotettu versio jokaisessa tallennuksessa. Ulkoisen agentin kaksi korjauskierrosta on tuotteen raja, ei laatuhyväksyntä.

## Testaus ja valmistumisen rajat

Jokaisessa erässä kohdennetut Vitest-testit, Studio typecheck, muuttuneiden tiedostojen oxfmt/oxlint ja alle 600 rivin tuotantotiedostot. B-erässä lisäksi Ari-regressiot. Lopuksi build, palvelimen typecheck ja rakennetarkistus; näkyvä UI-only ja yhdistelmäajo luovat saman synteettisen mainoksen ilman lähteen käsikorjauksia, vertaavat lähteet ja oikeat viennit, avaavat työn uudelleen ja todistavat ennen/jälkeen-kuvaeron. Virhepolut eivät saa käyttää korjaavaa reloadia onnistumisen peittämiseen.

Komennot ajetaan foregroundina `npx --yes bun run --cwd packages/studio test <testipolut>`, `npx --yes bun run ari:test`, `npx --yes bun run --cwd packages/studio typecheck`, myöhemmin `npx --yes bun run --cwd packages/studio-server typecheck` ja `npx --yes bun run ari:build`. Paikalliset binäärit `./node_modules/.bin/oxfmt` ja `oxlint`. Ei palvelukutsuja, pushia, stashia, checkoutia tai resetiä; 0 USD.

C5:n ihmistesti odottaa kolmea suomenkielistä kohderyhmän testaajaa. Automaation tuloksista ei johdeta alle viiden minuutin ihmistulosta. E, sisäinen malliajo ja asiakastuotannon julkaisu eivät kuulu tähän suunnitelmaan.

## A1–A2:n jälkeinen seuraava erä

A3–A5 käyttää A1–A2-eräraportin kuvaamaa `source` / `source-transaction`-sopimusta: puuttuva tiedosto on `content: null, version: null`, tyhjä tiedosto on `content: ""` ja sillä on oikea SHA-256-versio. Monitiedostokirjoitus ehdollistaa jokaisen tiedoston, ja palautus säilyttää rinnakkaiset muutokset. Nullable-snapshotit on nyt liitetty yhteiseen tallennukseen, historiatallennukseen ja undo/redo-polkuun. A3:n rakenneoperaatiot käyttävät tätä rajapintaa yhtenä peruttavana muutoksena; tarkka rajapinta ja 107 kohdennetun testin näyttö ovat nullable-historian eräraportissa. A3:n elementtipolku sijoittaa nyt hyllyn kopioidun kuvan myös sisäkkäiseen kohtaukseen polku- ja checksum-tarkistuksella.

Tyhjässä sisältöpohjassa on vain koko videon kattava tausta ja sen näkyvä 0,8 sekunnin sisääntulo. Molemmissa pohjissa on seitsemän sekunnin muokattava GSAP-aikajana sekä paikalliset fontit ja liikelisäosa. Staattisuuden tarkistusta ei ohiteta `data-no-timeline`-merkinnällä.

## A3-elementtierän rajattu tulos

Uusi Elementit-paneeli ja studio_elements/studio_edit_element käyttävät samaa nullable-tallennusta. Näkyvät UI-only- ja yhdistelmäajot läpäisivät kuusi tarkistusta kummassakin näkymäkoossa; lähteeseen perustuvat elementtilistat vastaavat toisiaan. Lähde-/liikejatko laajensi tuen vanhoihin paikallisiin pohjaelementteihin, erillisiin liikkuviin kopioihin ja yhteisen liikkeen kohdekohtaiseen poistoon. Uusi näyttö: 63 kohdennettua testiä ja 417 Ari-testiä. UI-integraatiojatko täydentää näyttöä: 191 kohdennettua testiä, 423 Ari-testiä ja neljä 14 tarkistuksen näkyvää selainajoa. Toistuvan kohtauksen testi käyttää valmista synteettistä fixtureä, ei UI:lla luotua kohtausrakennetta. Tämä aiempi elementtierä ei yksin kattanut A3:a. Kohtausoperaatiot on sittemmin toteutettu ja testattu alla kuvatussa kohtaus-erässä; A4 ja A5 on sittemmin toimitettu omissa erissään. Tarkat kuitit, testit ja ensimmäisen kokeilun verkkopoikkeama ovat eräraportissa.

## A3:n elementtipolun UI-hyväksyntä 10.9.2026

[Eräraportin UI-integraatio](../ARI-NEXT-A3-ELEMENTS.md) ja [koneluettava näyttö](../screenshots/2026-09-10-a3-ui-integration/report.json) todentavat 1280×800- ja 1440×900-koot molemmilla poluilla. Ei sivuvirheitä, korjaavia työtilan uudelleenlatauksia tai ulkoisia pyyntöjä. Valinnaisen paikallisen FFmpeg-kyvykkyyskyselyn 40 tunnettua 404-vastausta säilyvät raportissa; niitä ei väitetä toimivaksi vienniksi.

Lähteen ja esiintymän identiteetti on nyt sama dialogissa, kuvassa ja tasoluettelossa. Poistetun tunnisteen haku ei saa pudota toiseen saman luokan elementtiin, ja vanhentunut asynkroninen valinnan palautus ei syrjäytä uutta valintaa. Molemmat kirjoituspolut palauttavat tallennetun version ja `previewReady`-tiedon. Palvelimen `--offline` ja ennen avausta asetettu selainesto täydentävät paikallista aineistoa.

Kohtausoperaatiot, oman esiintymäkopion teko ja A5:n oikea vientivertailu on toteutettu. Seuraavaksi pysyvät versiot, C-paneeli ja D-muistikirja. Ihmistesti ja lopullinen A–D-hyväksyntä ovat edelleen avoimia. Ei commitia tai pushia.

## A3-valinnan ja vaikutusmäärän auditointikorjaus 10.9.2026

[Uusi näyttö ja korjauksen rajaus](../ARI-NEXT-A3-ELEMENTS.md): tallennuskuitin palautus sekä automaattinen esikatselun valintapäivitys käyttävät yhteistä valinnan revisiota. Uusi valinta, esiintymän vaihto, tyhjennys ja aluevalinta vanhentavat odottavan palautuksen. Automaattinen uudelleensidonta säilyttää revision ja esiintymän; se ei saa syrjäyttää uutta käyttäjävalintaa. Tallennettu lähdemuutos pysyy onnistuneena, vaikka sen valinnan palautus peruuntuu (`previewReady: false`). Juuren vaikutusmäärä on yksi; ratkeamaton sisäkkäinen kohtaus torjutaan ennen kirjoitusta.

Näyttö: 52 kohdennettua testiä, 433 Ari-testiä ja näkyvä kolmen tarkistuksen viivästetty valintakoe. Kokeen kuvat tarkistettu; ei ihmistestiä. Edellinen neljän 14 tarkistuksen näyttö säilyy omassa hakemistossaan. Uusi näyttöhakemisto on `screenshots/2026-09-10-a3-audit-fixes/`. Tämän korjauksen jälkeen toimitettiin kohtausoperaatiot; A4 ja A5 on sittemmin toimitettu, B3–B5 ja C–D ovat avoimia.

Lopullinen regressio korjausten jälkeen: [neljä näkyvää ajoa](../screenshots/2026-09-10-a3-audit-fixes/regression/report.json), 14 tarkistusta jokaisessa, molemmat näkymäkoot ja polut. Sisäkkäiset lähdeversiot vastaavat toisiaan; ei sivuvirheitä, korjaavia uudelleenlatauksia tai ulkoisia pyyntöjä. Typecheck, build ja tämän erän lint/muotoilu läpäisty; suurin kosketettu tuotantotiedosto 594 riviä. Omat palvelinprosessit pysäytetty, 0 USD, ei commitia tai pushia. Koko työpuun aiemmin punainen rakennetarkistus on korjattu erillisessä rakenteen korjauserässä; ks. [raportti](../ARI-NEXT-STRUCTURE-REPAIR.md).

## A3-kohtausoperaatioiden tila 10.9.2026

| Kriteeri                                                  | Tila ja näyttö                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A3: kohtauksen lisäys, nimi, kopio, poisto, aikajärjestys | Toteutettu yhteisellä ehdollisella UI/agenttipolulla; kopio jakaa lähteen, ajoitusehdotus ennen tallennusta.                            |
| A3: historia, ristiriidat, valinta, uudelleenavaus        | 93 kohdennettua testiä; neljä näkyvää 10 tarkistuksen ajoa molemmissa näkymäkoissa.                                                     |
| A4                                                        | Toteutettu itsenäiselle HTML-kohtaukselle: UI/agentti, yksi undo, eristetty muutos ja neljä näkyvää hyväksyntäajoa; ks. A4-eräraportti. |
| A5                                                        | Toteutettu: neljä näkyvää polkua, oikeat MP4:t ja kaikkien 420 ruudun vastaavuus; ks. A5-eräraportti.                                   |
| B3–B5, C1–C5, D1–D7                                       | Avoimet myöhemmät erät.                                                                                                                 |
| Kokonaisuuden rakennetarkistus / ihmistestaus             | Rakennetarkistus korjattu ilman uusia ohituksia; ks. rakenteen korjausraportti. Ihmistestausta ei tehty.                                |

[Eräraportti, tarkat säännöt, komennot ja uudet näyttöpolut](../ARI-NEXT-A3-SCENES.md). Aiempi elementti- ja nullable-näyttö säilyy omissa raporteissaan.

## Rakenteen korjauserä ennen A4:ää

Koko diffiin kohdistuva rakennetarkistus läpäisee alkuperäisillä asetuksilla; uusia dead-code-, monimutkaisuus- tai toistolöydöksiä ei jää. Ei uusia ohituksia tai baseline-muutosta. Erä jakaa yhteisen UI-/agenttikontekstin, valinnan palautuksen ja selainajurit pieniin osiin sekä korjaa hyväksyntäajossa löytyneen vanhan esikatselu-ETagin ehdollisen kirjoituksen yhteydessä. [Tarkat testit, epäonnistuneet yritykset ja lopullinen näyttö](../ARI-NEXT-STRUCTURE-REPAIR.md). A3:n kohtausoperaatiot sekä myöhemmät A4- ja A5-erät ovat toteutettuja. B3–B5, C1–C5, D1–D7 ja ihmistestaus ovat edelleen avoimet.

## A4 — oma kohtauskopio

Toimitettu yhteisen prepare/save-polun `detach`-operaationa: valittu esiintymä saa oman rinnakkaisen HTML-lähteen, ajoitus ja suhteelliset riippuvuudet säilyvät. Muita kohtauslähteitä sisältävä kopio torjutaan ennen kirjoitusta. Kopion ja isännän muutos on yksi nullable-historian merkintä. Saman aikajanavalinnan automaattinen päivitys ei enää syrjäytä kuitin valintaa; uudempi käyttäjävalinta säilyy.

Näyttö: 65 kohdennettua testiä, 466 Ari-testiä, neljä näkyvää UI-only/yhdistelmäajoa × 13 tarkistusta ja viivästetyn valinnan regressio. Molemmat näkymäkoot, uudelleenavaus, tavuntarkat lähteet, todellinen runtime ja kuvavertailu; ei ihmistestausta. Koko diffiin kohdistuva rakennetarkistus säilyy vihreänä ilman uusia ohituksia. [Rajaukset, tarkat mittarit ja näyttöpolut](../ARI-NEXT-A4.md). A5 on sittemmin täydentänyt näyttöä oikealla viennillä, playback-startilla, vakionopeudella ja kopion erillisellä liikemuokkauksella. B3–B5, C1–C5 ja D1–D7 ovat edelleen avoimet.

## A5 — tallennetun sisällön ja oikean viennin vastaavuus

Sama synteettinen 14 sekunnin pystymainos rakennetaan nykyisillä toiminnoilla näkyvällä UI-only- ja yhdistelmäpolulla molemmissa näkymäkoissa. Lähteet avataan uudelleen ja niiden sisältöä, mediaa, järjestystä ja liikkeitä verrataan. MP4-vienti käyttää jäädytettyä aineistoa, odottaa yhteistä tallennusjonoa ja näyttää lähdeversion. Kaikkien neljän viennin kaikki 420 ruutua verrataan; erillinen kuuden sekunnin fixture todentaa playback-startin, vakionopeuden sekä oman kopion liikemuokkauksen. Vientivirhe ja uusinta sekä viennin aikana tehty lähdemuutos testataan erikseen.

[Eräraportti, mitatut tulokset ja hyväksyntänäyttö](../ARI-NEXT-A5.md). Tämä on tekninen paikallinen hyväksyntä, ei ihmistesti eikä asiakkaalle hyväksytty mainos. B3–B5:n pysyvä versiosäilö ja vertailukäyttöliittymä eivät sisälly A5:n tilapäiseen vientijäädytykseen.

## B3–B5 — projektissa säilyvä versiosäilö

Tallennusperusta on toteutettu: yhteinen muokkaushistoria säilyy projektin `.ari-versions`-hakemistossa, lähteet ja paikalliset riippuvuudet jäädytetään SHA-256-objekteiksi, ja merkintä sitoo ennen/jälkeen-versiotunnisteet. Nullable-snapshotit, vanhan IndexedDB-historian siirto ja diskContent-ennakkoehto säilyvät. Binääripalautus on yksi peruttava muutos yhteisen kirjoitusjonon kautta. Automaattiversioita säilyy enintään 100 ja 32 MiB:n lähdebudjetti; nimetyt tarkistusversiot säilyvät erilliseen poistoon asti.

Näyttö: 44 historia-/integraatiotestiä, 30 palvelintestiä, 39 vienti-/esikatseluregressiota, 4 watcher-testiä ja 468 Ari-testiä. Erilliset palvelin- ja selainistunnot todentavat tallennuksen, uudelleenavauksen sekä tavuntarkan palautus/undo/redo-kierroksen. [Eräraportti](../ARI-NEXT-B-VERSION-STORE.md) sisältää mitatun tilankäytön, tuetut riippuvuudet, palvelurajapinnan, testilokit ja Bun-kehityspalvelimen käynnistysongelman; onnistuneet selainajot käyttivät Node-isäntää `npx --yes bun run` -komennolla.

B3:n näkyvä yhteinen toisto/seek ja nimetyt vertailuruudut sekä B5:n kuvallinen ero on nyt toteutettu ja todennettu erillisessä vertailuerässä. B4:n palautus on kytketty esikatseluun ja valinnan revisiosuojaan. C1–C5 ja D1–D7 eivät valmistuneet tässä erässä. Ihmistestausta ei tehty.

## B3–B5 — näkyvä jäädytettyjen versioiden vertailu

Toteutettu `AriVersions.tsx`-näkymä ja neljä löydettävää agenttitoimintoa yhteisen `versionComparison.ts`-palvelun kautta. Versiot toistetaan paikallisista tarkistetuista tavuista eristetyissä ruuduissa. Yhteinen aikaväli päättyy lyhyemmän version loppuun; eri kuvasuhteet torjutaan. Avaus, ajan siirto, toisto ja sulkeminen eivät kirjoita aktiiviseen lähteeseen. Erillinen palautus on yksi peruttava muutos; vanhentunut lähde ja vaihtunut projekti torjutaan. Esikatseluvirhe ilmoitetaan erikseen onnistuneesta lähdetallennuksesta.

[Eräraportti ja uudet näyttöartefaktit](../ARI-NEXT-B-COMPARISON.md): neljä näkyvää polkua molemmissa näkymäkoissa, todellinen väri-/tekstiero, yhteinen aika, lähdehashit, palautus/undo/redo ja uusi palvelin-/selainistunto. Kriteerit B3–B5 ovat tämän paikallisen teknisen näytön osalta toteutettuja. C1–C5, D1–D7 ja ihmistestaus pysyvät avoimina; koko A–D-toimitusta ei merkitä valmiiksi. Aiemmat yllä olevat B-avoimuuslauseet kuvaavat niiden erien silloista tilaa.

## C1–C5 — selkeä muokkauspaneeli

| Kriteeri | Tila ja näyttö                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1       | Peruskentät, nimi, kohtaus ja esiintymä näkyvät molemmissa koissa. Rect-mittaus käyttää paneelin rajoja ja scrollTop=0.                                                               |
| C2       | Teksti, Ulkoasu, Liike ja Tarkistus; tarkat käyrät ja tekniset tiedot erikseen. Tallennuspainikkeen paikka ei muutu.                                                                  |
| C3       | Tallennus ja undo/redo säilyttävät toisen esiintymän; poisto tyhjentää valinnan. Keskeneräisen esikatselun valinnan tyhjennys ja attribuuttikohdistetun liikkeen katoaminen korjattu. |
| C4       | Kohtauksessa / Koko videossa, yhteisen lähteen vaikutus ja desimaalipilkut.                                                                                                           |
| C5       | Neljä näkyvää UI-only/yhdistelmäajoa, 10 tarkistusta kussakin. Aito versiovertailu samassa ajanhetkessä. Ihmistesti ja viiden minuutin tavoite eivät ole todennettuja.                |

[C-eräraportti](../ARI-NEXT-C-PANEL.md) erottaa hyväksyntänäytön ja avoimen laajemman regression: toisen selainistunnon muutos vanhentaa paikallisen versiohistorian eikä pelkkä aineistolistan päivitys mahdollista jatkotallennusta. Tämä B-integraation puute korjataan ennen koko A–D-toimituksen hyväksyntää. D:n muistikirja ja korjauskierros odottavat edelleen. Aiemmat C-avoimuuslauseet kuvaavat aikaisempien erien tilannetta.

### D1–D3 foundation checkpoint — incomplete

The prerequisite B/C two-session history recovery now uses a checked source/history refresh through both **Päivitä tilanne** and `studio_refresh_project`. Real-file tests and one visible two-context 1280×800 journey prove draft retention, conflict recovery and subsequent save/undo/redo without reopening. The wider B/C matrix now passes: four two-context history journeys, 4×10 comparison checks including playing agent seek, 4×14 element checks and 4×10 panel checks. D1–D7 are still unimplemented. See [interface and new evidence](../ARI-NEXT-D-FOUNDATION.md).

### B/C-korjausten hyväksyntänäyttö

[Uusi näyttö ja rajaukset](../ARI-NEXT-D-FOUNDATION.md#bc-acceptance-follow-up--verified): 148 tarkistusta, näkyvät UI-only-/yhdistelmäpolut molemmissa näkymäkoissa. Luonnos, lähteet ja historia säilyvät ristiriidasta jatkettaessa; vertailun agentti-seek pysyy molemmissa runtimeissa ja jatkettu toisto alkaa uudesta kohdasta. C-paneelin pääkentät näkyvät vierittämättä, painikesijainnit säilyvät. 486 Ari-testiä ja 37 kohdennettua testiä sekä alkuperäinen koko diffiin kohdistuva rakennetarkistus läpi (0 uutta, 26 perittyä löydöstä). Aiempi punainen raportti säilytetty. D1–D7 sekä ihmistestaus ovat avoinna; tämä ei ole koko A–D-toimituksen valmistuminen.

## D1/D3 — paikallinen muistikirja

| Kriteeri                                    | Nykytila                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1: tavoite, sovitut tekstit ja aineistot   | Projektissa säilyvä, ehdollisesti tallennettu muistikirja; aineistopolut ja tarkistussummat tarkistetaan.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D1: tehtävät ja havainnot                   | Tehty–Kesken–Seuraavaksi sekä nimetyt, lähdeversioon sidotut havainnot UI:ssa ja samoilla agenttitoiminnoilla.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D1: valmistuneet lähdetoiminnot ja tulokset | Avoin. Varattu tyhjä kuittiluettelo ja seuraavan erän rajapinta dokumentoitu; käsin merkitty tehtävä ei todista lähdekirjoitusta.                                                                                                                                                                                                                                                                                                                                                                                                         |
| D2                                          | Avoin. Ei turvallista uusintaa tai keskeneräisen lähdetoiminnon sovitusta tässä erässä.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D3                                          | Paikallinen ihmisen / ulkoisen agentin / teknisen tarkistuksen havaintokirjaus toteutettu. Tekijä, ilmoitettu kattavuus ja katsottu lähdeversio näkyvät; muuttuneen version havainto merkitään vanhaksi seuraavassa luvussa. Ei mallikutsuja.                                                                                                                                                                                                                                                                                             |
| D4                                          | Palvelinpaketti (koko video, alku- ja loppuruutu, muuttuneiden liikerajojen ruudut), näkyvä valmistelu/katselu, agenttitoiminnot **ja** pakettiin sekä jäädytettyyn versioon sidotut erilliset arviot toteutettu ja todennettu. Puuttuva osa-alue näkyy puuttuvana, tekninen mittaus ei täytä arviota, ja lähdemuutos vanhentaa arviot niitä menettämättä. Katselua tai laatuhyväksyntää ei väitetä.                                                                                                                                      |
| D5                                          | Tehtävään sidottu korjauskierrosraja (oletus 2, projektikohtaisesti muutettavissa) ja hyväksytyn tekstin mekaaninen suoja toteutettu `prepareSourceOperation`-polkuun: sama torjunta koskee näkyviä kontrolleja ja agenttityökaluja. Torjunta ei muuta lähteitä, versioindeksiä tai perumishistoriaa ja jättää kuitin. Suoja ulottuu vain seurattuihin kirjoituksiin; kuvatuonnit, binäärinen palautus, muotoiltu teksti ja liikkeeseen sidottu paikan siirto jäävät ulkopuolelle.                                                        |
| D6                                          | Pysäytä työ on pysyvä muistikirjan tila (kuka, milloin, miksi). `assertOperationAllowed` torjuu seuraavan seuratun lähdekirjoituksen ennen kirjoitusta — sekä näkyvistä kontrolleista että agenttityökaluista — ja jättää kuitin. Jo julkaistun intentin kirjoitus viedään loppuun, joten tallennus ei jää puolitiehen; lähteet ovat tavuntarkasti joko ennen- tai jälkeen-tilassa. Muistikirja, havainnot, arviot ja hyväksynnät ovat käytettävissä pysäytettynä. Lähdemuutos vanhentaa hyväksynnän ja havainnot historiaa menettämättä. |
| D7                                          | Paikallinen hyväksyntä sidotaan `versionId`:hen, tarkistuspaketin tunnisteeseen ja lähderevisioon, ja se vaatii luettavan paketin sekä kannanoton kaikkiin neljään osa-alueeseen (arvio tai perusteltu "ei sovellu"). Tekninen mittaus ei riitä. Hylättyä versiota ei voi hyväksyä. Luonnosvienti onnistuu aina; kuitti kertoo "Hyväksytty versio" tai "Luonnos, ei hyväksytty" ja aina, ettei kyse ole asiakastuotannon julkaisusta.                                                                                                     |

[Muistikirjan eräraportti ja uusi näyttö](../ARI-NEXT-D-NOTEBOOK.md): neljä näkyvää muistikirjapolkua × neljä tarkistusta sekä neljä uuden palvelin-/selainistunnon uudelleenavausta. C-paneelin 4 × 10 regressiotarkistusta läpi. 489 Ari-testiä, 27 palvelin-/versio-/signature-testiä, kolme työkalutestiä ja neljä watcher-testiä läpi. Rakennetarkistus säilyy alkuperäisellä portilla vihreänä ilman uusia ohituksia. Muistikirjan tallennus ei muuta lähdeversiota, versiosäilöä tai undo-pinoa.

Aiemmat D:n kokonaan avoimeksi merkitsevät kappaleet kuvaavat niiden erien lähtötilaa. Koko D1:tä, D2:ta tai A–D-toimitusta ei merkitä valmiiksi. Ihmistestaus, sisäinen malliajo ja julkaisu eivät kuulu tähän näyttöön.

## D1/D2 — lähdetoimintojen kuitit ja jatkaminen

Rajattujen elementti-, kohtaus-, tavallisten teksti-/tyyli- ja liikemuokkausten pysyvä toiminto-ID, kirjoitustodiste ja historiaan atomisesti sidottu tulos toteutettu. Jatka työtä lukee vahvistetut tulokset uudessa istunnossa eikä toista kirjoituksia. Epäselvä tulos estää saman toiminnon uusinnan. Vanhan batch-polun animoitu paikan siirto, rich text, tuonti ja binääripalautus eivät kuulu seurannan rajaan. Ei automaattista kesken jääneen kirjoituksen viimeistelyä.

[Eräraportti](../ARI-NEXT-D-OPERATIONS.md): 489 Ari-testiä, 103 kohdennettua Studio-testiä, 29 palvelintestiä ja 72 näkyvää selaintarkistusta. Uuden palvelin-/selainistunnon jatkaminen ja kahden asiakkaan työ on todennettu. Aiemmat D2-avoimuuslauseet kuvaavat aiempien erien tilannetta. D4–D7, koko toimituksen loppuauditointi ja ihmistesti pysyvät avoimina.

## D4 — jäädytetyn työskentelykopion perusta, keskeneräinen

Versiosäilön tarkistetuista tavuista muodostuva yhteinen väliaikaiskopio on toteutettu ja sen 7 lähde-/esikatselutestiä läpäisty. Varsinainen tarkistuspaketti, video, rajakuvat, UI-/agenttitoiminnot ja selainhyväksyntä ovat toteuttamatta. D4 ei ole valmis. Ks. [rajattu eräraportti](../ARI-NEXT-D-REVIEW-PACKAGE.md).

## D4-arvioerän riippuvuusauditointi

Arvioiden toteutusta varten tarkistettu työpuu: edellisen erän rajapinta tuottaa vain väliaikaisen lähdekopion. Pysyvän video-/ruutupaketin valmistaja, lukija ja manifesti puuttuvat. Muistikirjan nykyinen vapaan tekstin havainto ei täytä erillisiä pakettiin sidottuja arvioita. Arvioerää, näkyvää Tarkistus-polkua tai sen hyväksyntänäyttöä ei ole toteutettu. [Täsmällinen jatkojärjestys ja rajaus](../ARI-NEXT-D-REVIEW-PACKAGE.md). D4 pysyy keskeneräisenä, D5–D7 avoimina.

## D4 — pysyvä palvelinpaketti

Pysyvä jäädytetty MP4 sekä alku- ja loppuruudut on nyt toteutettu yhteiseen palveluun. Atominen julkaisu ja tarkistettu lukeminen, lähde-/historiariippumattomuus sekä oikea 1080 × 1920 / 30 fps / 6 s renderöinti on todennettu. 25 testiä läpäisi; alkuperäinen koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia. Aiemmat D4-riippuvuusauditoinnit yllä kuvaavat silloista keskeneräistä tilaa. Liikerajat, UI-/agenttipolut, arviot ja D5–D7 olivat tuolloin avoimia. [Palvelurajapinta ja näyttö](../ARI-NEXT-D-REVIEW-PACKAGE.md).

## D4 — muuttuneiden liikerajojen näyttö

Nykyisen ja valitun edellisen jäädytetyn version liikerakenteet vertaillaan nyt staattisesti, ja paketti sisältää rajan edeltä, kohdalta ja jälkeen poimitut ruudut. Lisätty ja muutettu liike näytteistetään nykyisen version videosta, poistunut edellisen version videosta, joka renderöidään vain tarvittaessa. Toistuvan kohtauksen jokainen esiintymä, tuettu playback-start ja vakionopeus muunnetaan master-aikaan; videon ulkopuolinen raja, esiintymän ulkopuolelle jäävä raja ja päällekkäinen näyte merkitään näkyvästi. Kattavuus on `first-version`, `changed-motion-boundaries` tai `changed-motion-boundaries-partial` täsmällisine syineen; tukematonta rakennetta ei koskaan esitetä kattavana.

Näyttö: 56 kohdennettua palvelintestiä, 489 Ari-testiä, oikea kahden version renderöinti (1080 × 1920 / 30 fps / 6 s), kahdeksan rajaa, kahdeksantoista ruutua ja kaksikymmentä tavuntarkkaa riippumatonta FFmpeg-poimintaa. Alkuperäinen koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia. D4 on edelleen kesken: näkyvä valmistelu-/katselupolku, agenttitoiminnot, arviot ja hyväksyntä puuttuvat, eikä paketin valmistuminen tarkoita katselua. D5–D7 avoimia. [Rajaraportti ja näyttö](../ARI-NEXT-D-REVIEW-PACKAGE.md).

## D4 — näkyvä valmistelu ja katselu sekä agenttitoiminnot

Neljä palvelinreittiä (listaus, valmistelu, luku, aineiston tarjoilu), yhteinen selainpalvelu, kolme rajattua agenttityökalua ja **Tarkistus**-osion **Tarkistuspaketti** käyttävät samaa palvelua. Aineistoa tarjoillaan vain manifestin listaamista poluista. Valmistelu ei muuta lähderevisiota, versioindeksiä eikä undo-pinoa, ja epäonnistunut valmistelu ei julkaise mitään.

Näyttö: neljä näkyvää ajoa (UI-only/yhdistelmä × 1280 × 800 ja 1440 × 900), yhdeksän tarkistusta kussakin, nolla sivuvirhettä, ulkoista pyyntöä ja korjaavaa uudelleenlatausta; oikea MP4 1080 × 1920 / 30 fps / 210 ruutua; jokainen näytetty kuva ja video tavuntarkasti manifestin mukainen; poistetun riippuvuuden valmistelu epäonnistuu julkaisematta mitään; uudessa palvelin- ja selainistunnossa sama paketti luetaan uudelleen. 496 Ari-testiä, 47 kohdennettua palvelintestiä; alkuperäinen koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia.

D4 on edelleen osittainen: arvioita, katselumerkintää tai laatuhyväksyntää ei ole. Paketin valmistuminen tai näyttäminen ei tarkoita, että kukaan olisi katsonut videon. D5–D7 avoimia. [Rajapinta, rajaukset ja näyttö](../ARI-NEXT-D-REVIEW-PACKAGE.md).

## D4 — pakettiin sidotut arviot

Viesti, ulkoasu, liike ja ääni arvioidaan erikseen. Jokainen arvio kantaa nimetyn tekijän, tekijätyypin (`human`, `external_agent`, `test_data` — `technical` puuttuu tarkoituksella), ajankohdan, katsotun paketin ja jäädytetyn version sekä ilmoitetun kattavuuden. Sidonta kopioidaan tarkistetusta manifestista, ei kutsujalta. Arviot tallennetaan olemassa olevaan projektimuistikirjaan sen ehdollisella tallennuksella, joten rinnakkainen arvio ei häviä eikä lähderevisio, versioindeksi tai undo-pino muutu. Puuttuva osa-alue näkyy sanana **puuttuu**; `measured.audio: false` on mittaus, joka jättää ääniarvion puuttumaan. Lähdemuutos merkitsee arvion vanhentuneeksi säilyttäen sen historiassa.

Näyttö: neljä näkyvää ajoa (UI-only/yhdistelmä × 1280 × 800 ja 1440 × 900), 12 tarkistusta kussakin, sekä neljä uudelleenavausajoa tuoreessa palvelimessa, 5 tarkistusta kussakin; nolla sivuvirhettä, ulkoista pyyntöä ja korjaavaa uudelleenlatausta. 500 Ari-testiä ja 369 palvelintestiä. Alkuperäinen koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia. Testien kirjaamat arviot on merkitty `test_data`-aineistoksi; **ihmistestiä ei tehty**. [Rajapinta ja näyttö](../ARI-NEXT-D-REVIEW-PACKAGE.md). D5–D7 avoimia.

## D5 — korjauskierrosraja ja hyväksytyn sisällön suoja

Raja ja lukitukset asetetaan muistikirjasta ja ne torjutaan `prepareSourceOperation`-polulla ennen
kuin sidottu toiminto julkaistaan, joten torjuttu muutos ei jää uusittavaksi eikä kirjoita mitään.
Laskuri on yksi tiedosto käytettyä kierrosta kohti `.ari-notebook/repairs/`-hakemistossa, joten se
säilyy uudessa palvelinprosessissa ilman välimuistia. Vertailu on mekaaninen: täsmällinen
normalisoitu merkkijono, ei semantiikkaa eikä mallikutsua.

Näyttö: neljä näkyvää ajoa (UI-only/yhdistelmä × 1280 × 800 ja 1440 × 900), 5 tarkistusta kussakin,
sekä neljä uudelleenavausajoa tuoreessa palvelimessa. 503 Ari-testiä ja 378 palvelintestiä. Alkuperäinen
koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia. Muistikirjan
aiempi D1-ajo ajettiin regressiona jaetun harnessin refaktoroinnin jälkeen. Ihmistestiä ei tehty.
[Rajapinta, rajaukset ja näyttö](../ARI-NEXT-D5-D7.md).

## D6–D7 — työn pysäytys ja versiosidottu paikallinen hyväksyntä

Pysäytys torjuu seuraavan seuratun lähdekirjoituksen yhteisessä kirjoituspolussa, ei painikkeessa; jo aloitettu tallennus kirjoitetaan loppuun. Paikallinen hyväksyntä vaatii luettavan tarkistuspaketin ja kannanoton neljään osa-alueeseen, vanhenee lähdemuutoksesta rivi säilyttäen, eikä hylättyä versiota voi hyväksyä. Luonnosvienti onnistuu aina ja merkitään luonnokseksi, ellei viety sisältöversio ole voimassa olevasti hyväksytty.

Näyttö: 389 palvelintestiä ja 505 Ari-testiä, neljä näkyvää ajoa (UI-only/yhdistelmä × 1280 × 800 ja 1440 × 900) × 9 tarkistusta, neljä uudelleenavausajoa tuoreessa palvelimessa × 2 tarkistusta, kahdeksan oikeaa MP4-vientiä (1080 × 1920 / 30 fps / 210 ruutua) sekä `ari:test:repair`- ja `ari:test:review`-regressiot yhteisen ajurirefaktoroinnin jälkeen. Nolla sivuvirhettä, ulkoista pyyntöä ja korjaavaa uudelleenlatausta; 12 tahallista torjuntaa asserttoitu. Työkalurekisteri pysyy 36 nimessä. Alkuperäinen koko diffiin kohdistuva rakennetarkistus läpäisee ilman uusia löydöksiä tai ohituksia. **Ihmistestiä ei tehty**; kaikki arviot ja hyväksynnät on merkitty `test_data`-aineistoksi. [Rajapinta, rajaukset ja näyttö](../ARI-NEXT-D5-D7.md#d6--pysäytä-työ).

## Koko toimituksen loppuregressio ja auditointi 10.9.2026

Yksi synteettinen mainos rakennettiin neljä kertaa nykyisillä luontitoiminnoilla — `ui-only` ja
yhdistelmä × 1280×800 ja 1440×900 — ilman lähdetiedostojen käsikorjauksia. Kaikki neljä polkua
päätyivät samoihin tavuihin ja neljä oikeaa vientiä olivat 1080×1920 / 30 fps / 330 ruutua, joiden
kaikki ruudut vastasivat toisiaan nollatoleranssilla. Uudelleenavaus tuoreessa palvelin- ja
selainistunnossa säilytti muistikirjan, versiot, tarkistuspaketin, hyväksynnän ja
pysäytyshistorian, eikä `studio_resume_work` kirjoittanut tavuakaan uudelleen.

| Kohta                                  | Tila                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| A1–A5, B1–B5, C1–C4, D1–D7             | toteutettu ja hyväksyntätestattu, ks. [ARI-NEXT-FINAL.md](../ARI-NEXT-FINAL.md)          |
| C5:n ihmistesti                        | tekemättä; automaatio ei mittaa alle viiden minuutin tavoitetta                          |
| `ari:test:scenes`                      | **punainen** — vanha erä ei ole päivitetty välilehtipaneeliin; 7 tarkistusta saavutetaan |
| Rakennetarkistus (koko diff, new-only) | läpi, 0 uutta löydöstä, `.fallowrc.jsonc` muuttumaton                                    |
| 600 rivin raja                         | läpi, suurin muutettu tuotantotiedosto 598 riviä                                         |
| Työkalurekisteri                       | 36 nimeä ajossa                                                                          |

Uusi ajettava komento: `npm run ari:test:final`
([`ari-final-delivery.mjs`](../packages/studio/tests/e2e/ari-final-delivery.mjs)).
