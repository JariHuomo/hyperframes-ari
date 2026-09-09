# Ari Studio: tarkat liikekäyrät ja kohtauksen aika

Päiväys: 9.9.2026. Tila: toteutussuunnitelma, ei toteutettu. Jatkoa tiedostoille `ARI-SPRINT-EASY-MOTION.md` ja `plans/2026-09-09-ari-studio-easy-motion-sprint.md`.

## 1. Tavoite ja käyttäjä

Agentti on studion ainoa käyttäjä. Sen pitää pystyä valitsemaan kohde kuvasta tai tasolistasta, säätämään liikettä hiirellä tai tarkalla skriptikutsulla, katsomaan lopputulos ja jatkamaan samasta valinnasta. Onnistuminen tarkoittaa sujuvaa omaa työskentelyä, ei kaikkien After Effectsin ominaisuuksien kopiointia.

Sprintin lopussa pystyn tekemään tämän: valitsen mainoksen sisällä olevan tuotekortin, siirrän sen sisääntulon päävideon aikaan 5,20 s, säädän hidastumisen käyrästä, perun yhden muutoksen, jatkan skriptillä ja varmistan päävideosta renderöidyt ruudut sekä MP4:n. Kohtausta ei tarvitse avata erikseen ajan laskemista varten.

Toimitetaan kaksi kokonaisuutta yhteisen varmennuksen päällä:

- **A: Tarkka tuntuma.** Olemassa oleva Bézier-käyrä, neljä erillistä numerokenttää, esiasetukset ja rajattu avainruutuvälin muokkaus Arin työtilaan.
- **B: Kohtaus päävideossa.** Yksiselitteinen esiintymävalinta, pääajan ja kohtausajan muunnos, näkyvä aikakonteksti sekä paluu samaan kohtaan.

Ensimmäinen toimitus tukee tavallisia GSAP-kohtauksia ilman toistoa, käänteistä aikaa, lähdeajan siirtoa tai nopeuden muutosta. Vakionopeudella venytetyt ja trimmatut kohtaukset ovat erillinen seuraava toimitus, jolle määritellään tässä oma hyväksymisportti.

## 2. Projektikonteksti

Toteutus kuuluu itsenäiseen `hyperframes-ari`-forkkiin. Se on Bun-monorepo, ei AdForgen Next.js-sovellus. Studio on React/Vite-käyttöliittymä; mainos elää iframe-kehyksessä. HTML-lähde ja GSAP-aikajana säilyvät tuotannon totuutena. UI:n valintakehykset ja käyrät pysyvät studion dokumentissa, jotta ne eivät päädy videoon.

| Kerros                           | Luettavat ja suoraan liittyvät tiedostot                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arin käyttöliittymä              | `packages/studio/src/ari/AriMotion.tsx`, `AriTimeline.tsx`, `AriLayers.tsx`, `AriNumber.tsx`, `AriFrameEvidence.tsx`; `packages/studio/src/components/EditorShell.tsx`                                                          |
| Valmis käyräeditori              | `packages/studio/src/components/editor/EaseCurveSection.tsx`, `EaseParamFields.tsx`, `EaseModeControls.tsx`, `easeCurveSvg.tsx`, `easePresetLibrary.ts`, `gsapAnimationConstants.ts`, `KeyframeEaseList.tsx`                    |
| Yhteinen luku- ja kirjoituspinta | `packages/studio/src/webmcp/tools/animationTools.ts`, `animationReadback.ts`, `inspectTools.ts`, `frameTools.ts`; `packages/studio/src/webmcp/handles.ts`, `writeCoordinator.ts`, `StudioAgentTools.tsx`                        |
| Muokkaus ja peruminen            | `packages/studio/src/hooks/useGsapAnimationOps.ts`, `useGsapSelectionHandlers.ts`, `useGsapKeyframeOps.ts`, `useGsapTweenCache.ts`; `packages/studio/src/components/editor/gsapAnimationCallbacks.ts`                           |
| Lähteen tulkinta ja kirjoitus    | `packages/parsers/src/gsapParserAcorn.ts`, `gsapWriterAcorn.ts`, `gsapParser.ts`; `packages/studio-server/src/routes/gsapMutationCapabilities.ts`                                                                               |
| Kohtausaika ja renderöinti       | `packages/core/src/runtime/startResolver.ts`, `init.ts`, `playbackRate.ts`, `timeline.ts`, `customEase.ts`; `packages/core/src/compiler/compositionAssembly.ts`; `packages/studio/src/player/store/timelineElement.ts`          |
| Todisteet ja regressiot          | `packages/studio-server/src/routes/thumbnail.ts`, `packages/studio-server/src/helpers/projectSignature.ts`; `packages/studio/tests/e2e/ari-edit-loop.mjs`, `ari-motion-sprint.mjs`; `packages/studio/vite.ariRenderSnapshot.ts` |

Polut viittaavat nykyiseen paikalliseen työpuuhun, jossa edellisen sprintin muutoksia on edelleen commitoimatta. Niitä ei palauteta eikä korvata. `packages/core/src/parsers/gsapParserAcorn.ts` ja `gsapWriterAcorn.ts` ovat vanhojen tuontien uudelleenohjauksia: parserin varsinainen muutos tehdään `packages/parsers`-paketissa.

## 3. Analyysi ja löydökset

### Käyrät

1. `AriMotion` tarjoaa vain `none`, `power2.out` ja `power3.out`. Muu nykyinen käyrä näkyy mukautettuna arvona. Uuden liikkeen työkalun skeema sallii samat kolme arvoa, mutta päivitystyökalu hyväksyy lähes minkä tahansa ei-tyhjän ease-merkkijonon, paitsi `__raw:`-lausekkeen. Luku, lisäys ja päivitys tarvitsevat saman tukisopimuksen.
2. `EaseCurveSection` sisältää jo raahattavat kahvat, näppäimistösäädöt, esiasetukset, jousen ja värähtelyn. Uutta käyrän piirto- tai interpolointimoottoria ei tarvita.
3. Sen tallennuscallback palauttaa `void`. Optimistinen käyrä odottaa prop-arvon päivittymistä ja palautuu kahden sekunnin ajastimella. Tämä ei riitä agentin onnistumiskuitiksi. Lisäksi `onPointerCancel` kutsuu nykyisin samaa toimintoa kuin raahauksen valmistuminen.
4. `EaseParamFields` syöttää Bézier-pisteet yhtenä pilkuilla eroteltuna kenttänä ja pyöristää sadasosiin. Neljä erillistä kenttää sopivat paremmin tarkkaan skriptaamiseen ja suomalaiseen desimaalipilkkuun. Pelkkä paneelin avaaminen ei saa pyöristää olemassa olevaa käyrää.
5. Runtime tukee jo `custom(M0,0 Cx1,y1 x2,y2 1,1)`-esitystä sekä `spring`, `wiggle` ja `hold`. Virheellinen mukautettu käyrä voi pudota fallback-tulkintaan. Siksi lähteestä löytyvä merkkijono ei yksin todista oikeaa liikettä: uuden arvon pitää läpäistä tulkinta ennen tallennusta ja renderin näyttää sama käyrä.
6. `KeyframeEaseList` tarjoaa jo välikohtaisen käyrän. `studio_inspect` palauttaa nykyisin vain `hasKeyframes`-tiedon, ei muokattavien välien listaa. Pelkkä koko tweenin `ease`-päivitys ei korvaa välin käyräsopimusta; parserissa myös `easeEach` ja yksittäiset ohitukset vaikuttavat.

### Kohtausaika

1. `AriMotion` näyttää sisäkkäiselle lähteelle **Avaa kohtaus**, `AriTimeline` piilottaa sen liikepalkit, ja `useGsapAnimationOps` estää lisäyksen päävideon kellosta. Tämä on nykyinen tarkoituksellinen turvaraja.
2. V2-kohdekahva sitoo projektin, avoimen koosteen, lähdetiedoston ja elementin osoitteen. Se ei sisällä erillistä esiintymäpolkua. Saman lähteen käyttäminen kahdesti tarvitsee esiintymän ajan erottamisen yhteisestä lähdemuutoksesta.
3. `startResolver` ratkaisee jo kohtausvanhempien aloituksia ja suhteellisia viittauksia. `init.ts` liittää lapsia pääaikajanaan ja sisältää erillisen rekisteröityjen lapsiaikajanojen seek-polun. Näiden todellinen käyttäytyminen pitää todentaa kahden sisäkkäisyystason fixturellä ennen kirjoituseston avaamista. DOM-attribuutteja ei summata uutena rinnakkaisena ajantulkintana.
4. Lapsen seek-polku huomioi jo playback-startin ja playback-raten. Tästä ei voi päätellä, että kaikkien sisäkkäisyystasojen venytys toimii editorissa ja renderissä identtisesti. Tuki pitää ilmaista eksplisiittisesti.
5. `globalTimeCompiler.ts` muuntaa tweenin ajan prosenteiksi ja takaisin; nimestään huolimatta se ei ole yleinen kohtausajan muunnin.
6. Arin aikajana ja liikkeen esikatselu käyttävät nyt useassa kohdassa kiinteää `1 / 30`-askelta. Uusi työ ei saa luvata muita kuvataajuuksia ilman yhteistä, todennettua aikaperustaa.

## 4. Ratkaisu ja rajaukset

### Yhteinen muokkaussopimus

UI ja `window.ariStudio.call` käyttävät samoja komentoja. Arin paneeli ei kutsu vanhaa fire-and-forget-käyrätallennusta omana ohituspolkunaan. Laajennetaan nykyisiä animation-työkaluja; erillistä käyrä-API:a tai tallentajaa ei rakenneta.

Luennasta palautetaan tuetut toiminnot, nykyinen käyrä ja tarvittaessa muokattavat avainruutuvälit. Käyrän kohde on yksiselitteisesti joko koko liike tai yksi olemassa oleva väli. Epäselvä esitys näytetään luettavana ja muokkaus estetään selityksellä. Koko liikkeen muutos ei hiljaisesti tyhjennä kaikkien välien käyriä.

Ehdotettu uusi käyräsyöte on rakenteinen: esiasetuksen tunnus tai neljä Bézier-lukua. Se sarjallistetaan nykyiseen ease-esitykseen yhdessä paikassa. Vanha `ease`-kenttä säilytetään tuetuille arvoille; ristiriitaiset vanha ja uusi syöte hylätään. Funktioita tai raakaa JavaScriptiä ei hyväksytä. X-arvot ovat välillä 0–1, Y-arvot voivat ylittää 0–1-välin. V1-muokkauksen Y-alueeksi valitaan nykyinen −1–2; tätä laajempi ladattu käyrä säilyy muuttumattomana ja näkyy tuen ulkopuolisena. X-kahvoille ei lisätä tarpeetonta `x1 ≤ x2`-ehtoa.

Yksi valmis raahaus tai numeromuutos on yksi peruttava kirjoitus. Raahaus muuttaa ensin luonnosta, keskeytys palauttaa sen, ja kuitti ratkaisee tallennuksen onnistumisen. Epäonnistunutta tai aikakatkaistua kutsua ei toisteta sokkona: luetaan lähde ja selvitetään, ehtikö kirjoitus valmistua.

### Aikakonteksti

Lisätään yksi tyypitetty kohtauskonteksti, jonka luku, muokkaus, esikatselu ja todisteet jakavat. Se sisältää avoimen koosteen, esiintymäpolun, lähdetiedoston, ratkaistun aikamuunnoksen ja näkyvyysikkunan, tuen tilan sekä lähde- ja ajoitusriippuvuuksien version. Kohteen vanha kahva saa säilyä; esiintymää varten annetaan erillinen läpinäkymätön kontekstitunniste.

V1:ssä tuettu muunnos on `kohtausaika = pääaika − ratkaistu alku`. Alku on resolverin osoittama absoluuttinen alku, ei uudelleen summattu arvo. Esimerkiksi päävideossa 4,00 s alkavan kohtauksen liike kohdassa 1,20 s näkyy pääajassa 5,20 s. Kesto ei muutu. Pääaikaan siirto 5,60 s kirjoittaa kohtauksen lähteeseen 1,60 s.

Skriptin aika-avaruus nimetään eksplisiittisesti uudella kentällä, esimerkiksi `timeSpace: "active" | "source"`. Vanhojen kutsujen semantiikka säilytetään; uusi sisäkkäinen kirjoitus vaatii tuetun esiintymäkontekstin. Kuitissa palautetaan sekä lähteen että avoimen koosteen aika. Muunnoksen tarkistus tehdään samassa kirjoituspolussa kuin kohteen ja lähteen tarkistus, ei vain käyttöliittymässä.

Saman lähteen kahdessa esiintymässä valinta määrää ajan ja katselukohdan. Kirjoitus muuttaa edelleen yhteistä lähdettä ja siten molempia esiintymiä. Paneeli näyttää vaikutuksen ennen tallennusta; skripti ilmoittaa yhteiseen lähteeseen kohdistuvan muutoksen eksplisiittisesti. Tämä ei vaadi chat-hyväksyntää. Esiintymäkohtaiset lähdekopiot ja override-mekanismi jäävät pois tästä sprintistä.

### Käyttöliittymä

- **Liike → Tarkka tuntuma** avaa riittävän suuren käyrän oikeaan paneeliin. Työkuva ja aikajana pysyvät näkyvissä. Kuvaajassa X tarkoittaa liikkeen aikaa ja Y etenemistä; sitä ei kutsuta nopeuskäyräksi.
- Kahvoilla on isot osuma-alueet ja vakaat nimet. Neljä kenttää toimivat näppäimistöllä ja desimaalipilkulla. Käyrän avaaminen ei siirrä toimintopainikkeita kesken eleen.
- Kohtauspolku sekä **Päävideo 5,20 s · Kohtaus 1,20 s** näkyvät valinnan lähellä. Aikajanalla liike sijoitetaan aktiivisen näkymän aikaan. Numerokentät kertovat, kummassa ajassa muokataan.
- **Avaa kohtaus** siirtyy samaan paikalliseen hetkeen; **Takaisin päävideoon** palauttaa esiintymän, valinnan ja muunnetun ajan. Uuden esikatselun valmiutta odotetaan kuittauksesta, ei kiinteästä viiveestä.
- **Toista liike** ja ruututarkistus käyttävät samaa kontekstia. Tuettoman ajan kohdalla näkyy konkreettinen syy, esimerkiksi “Tämän kohtauksen nopeutettua aikaa ei vielä voi muokata päävideossa.”

## 5. Riskit ja huomioitavat rajat

| Riski                                                                             | Toteutuksen vaatimus                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kahdesti laskettu kohtausoffset tai runtimeen leimattu data tulkitaan lähdeajaksi | Vertaa resolveria, lähdettä ja oikeaa renderiä ennen kirjoitusten avaamista. Erota ajastettu DOM ja kirjoitettava lähde.                                                                  |
| Vain lapsen hash tarkistetaan, mutta vanhemman aloitus muuttuu                    | Sido konteksti koko vaikuttavaan kohtausketjuun. Vanhentunut konteksti hylätään ennen kirjoitusta. Hyödynnä projektisignatuuria, jos se kattaa riippuvuudet; varmista kattavuus testillä. |
| Sama lähde kahdessa paikassa                                                      | Erota esiintymän valinta lähdemuutoksen laajuudesta. Älä ratkaise ensimmäistä DOM-osumaa automaattisesti.                                                                                 |
| Liike-id muuttuu ajoituksen mukana                                                | Käytä kuittiin palautettua id:tä. Nykyinen readback käyttää lähdejärjestystä; ulkoinen uudelleenjärjestely ei saa näyttää onnistuneelta.                                                  |
| Tweenin ease, easeEach ja välikohtainen ease sekoittuvat                          | Testaa parseri → kirjoittaja → runtime. Säilytä muiden välien käyrät ja ominaisuusarvot.                                                                                                  |
| Käyräkuva on approksimaatio tai virheellinen merkkijono putoaa oletukseen         | Käyrän näyttö ja render käyttävät samaa hyväksyttyä tulkintaa. Varmista myös väliruudut, ei vain alku ja loppu.                                                                           |
| Aikajana on pidempi kuin kohtauksen näkyvyysikkuna                                | Älä leikkaa lähdearvoja hiljaisesti. Näytä leikkautuva olemassa oleva liike ja estä tuen vastainen uusi sijoitus. Tarkista kaikkien vanhempien ikkunat.                                   |
| Sekä SDK että vanha muokkauspolku ovat käytössä                                   | Lue nykyiset haarat hookeista. Sama kuitti, virhetulos ja peruminen molemmissa; ei uutta kolmatta kirjoituspolkua.                                                                        |
| Muutettu suuri tiedosto rikkoo CI:n                                               | Studio vaatii alle 600-riviset muutetut tuotantotiedostot sekä fallow-/oxlint-/oxfmt-tarkistukset. Erota uudet vastuut pieniksi moduuleiksi.                                              |

## 6. Toteutettava TODO-järjestys

### T0 — Lukitse regressiot ja nykyinen käyttäytyminen

- [ ] Lue tämän suunnitelman tiedostot ja työpuun diffi; tallenna käytetty lähtöversio sekä paikallisen diffipaketin tunniste UAT-raporttiin.
- [ ] Lisää uusi `packages/studio/tests/e2e/fixtures/ari-scene-time/`: päävideo, 4 s kohdalla alkava kohtaus, kaksi sisäkkäisyystasoa sekä saman lähteen kaksi esiintymää eri ajoissa. Mukaan selvästi tunnistettavat koordinaatit ja kuviot ilman ulkoisia aineistoja.
- [ ] Lisää tunnettu Bézier-liike ja kolme avainruutua eri välikäyrillä. Kirjaa nykyinen seek/render-tulos sekä tuettomat nopeus-/toistotapaukset ennen korjauksia.
- [ ] Lue `ari-edit-loop.mjs`, `ari-motion-sprint.mjs`, `startResolver.test.ts`, `customEase.test.ts` ja `EaseCurveSection.test.tsx`; jatka niiden fixture- ja virhesyöttötapoja.

**Valmis kun:** testidata paljastaa väärän esiintymän, kahdesti lisätyn offsetin ja väärään väliin tallennetun käyrän. RajaMarketin alkuperäinen testityö säilyy.

### T1 — Käyräsopimus ja todennettava tallennus

- [ ] Lisää yhteinen käyrän validointi/sarjallistus olemassa olevaan riippuvuussuuntaan; valitse paikka `packages/parsers`-paketista, jos runtime ja Studio tarvitsevat sitä. Lue `customEase.ts`, `gsapAnimationConstants.ts` ja `gsapWriterAcorn.ts` ennen erottelua.
- [ ] Muuta `animationTools.ts`, `animationReadback.ts`, `inspectTools.ts` ja `StudioAgentTools.tsx`: sama tuettu käyräjoukko lisäykseen ja päivitykseen, rakenteinen luku, lähteen readback ja todellinen virhekuitti. Päivitä tyypit, työkaluskeemat ja testit yhdessä.
- [ ] Muuta `EaseCurveSection.tsx` hallittavaksi tai erottele sen piirto- ja luonnososa niin, että Ari voi odottaa Promise-kuittia. Säilytä vanhan editorin yhteensopivuus ilman kahden sekunnin ajastinta onnistumisen ehtona.
- [ ] Toteuta keskeytys, virhepalautuminen ja yksi undo per ele. Valinnan vaihtuessa keskeneräinen luonnos ei saa kohdistua uuteen elementtiin.

**Valmis kun:** sama mukautettu käyrä lisätään tai päivitetään yhdellä toiminnolla; virheellinen käyrä ei kirjoita lähdettä; 503, hidas tallennus ja ulkoinen muutos eivät tuota väärää onnistumista.

### T2 — Tarkka käyrä Arin työtilaan

- [ ] Muuta `AriMotion.tsx`; lisää tarvittaessa pieni `AriCurveEditor.tsx` nykyisten käyräkomponenttien päälle. Lisää neljä erillistä kenttää `AriNumber`-käytännöllä sekä vakaat kahvojen nimet, näppäimistösäädöt ja reset valittuun esiasetukseen.
- [ ] Pidä yhteinen liikevalinta, näkyvä tallennustila ja rajattu toisto. Älä muuta käyrän tarkkuutta pelkän luennan tai paneelin avaamisen vuoksi.
- [ ] Tuo olemassa olevien avainruutujen yhden välin käyrä samaan polkuun: lue `KeyframeEaseList.tsx`, `gsapAnimationCallbacks.ts` ja nykyiset hookit, palauta inspectissä välit, lisää yksiselitteinen välikohde ja varmista readbackissa juuri sen ease. Tässä ei lisätä uutta avainruutujen luontityönkulkua tai massamuokkausta.

**Valmis kun:** skriptillä asetettu käyrä näkyy täsmälleen UI:ssa; kahvaraahaus päivittyy inspectiin; reload ja undo/redo säilyttävät arvot; yhden välin muutos jättää muut välit ennalleen.

### T3 — Kohtauskonteksti ja turvallinen aikamuunnos

- [ ] Lisää `packages/studio/src/utils/compositionTimeContext.ts` ja sen puhtaat testit. Hyödynnä resolverin/runtime-payloadin todettua tietoa; tarvittava jaettu laskenta kuuluu coreen, ei UI-komponenttiin.
- [ ] Laajenna inspect-/valintapolkua esiintymätunnisteella, pää- ja lähdeajalla, vaikutusalueella ja tukisyillä. Lue ja muuta tarvittaessa `handles.ts`, `timelineElement.ts` ja valinnan tyypit; säilytä V2-kahvojen yhteensopivuus.
- [ ] Sido konteksti lähde- ja vanhempiversioihin. Valinnan uudelleenratkaisu ja revision tarkistus tapahtuvat ennen kirjoitusta yhteisessä koordinaattorissa; tarvittaessa lisää palvelinpuolinen ehdollinen kirjoitus. Pelkkä UI:n ennakkotarkistus ei sulje ulkoisen muokkaajan kilpailutilannetta.
- [ ] Lisää eksplisiittinen aika-avaruus animation-työkaluihin. Muunna sekä lisäys että siirto ja keston validointi; kuitti sisältää pyydetyn ja tallennetun ajan. Avaa `useGsapAnimationOps`-esto vain resolverin tukemille tapauksille, myös muissa kutsupoluissa.

**Valmis kun:** 4 + 1,2 = 5,2 toimii molempiin suuntiin; kaksitasoinen rakenne ja toinen saman lähteen esiintymä toimivat; vanhemman siirtyminen estää vanhan pyynnön; tuntematon ajoitus ei käytä nollaa fallbackina kirjoituksessa.

### T4 — Aikakonteksti klikkailuun, esikatseluun ja todisteisiin

- [ ] Muuta `AriMotion.tsx`, `AriTimeline.tsx`, `AriLayers.tsx` ja tarvittaessa `EditorShell.tsx`: kohtauspolku, molemmat kellot, liikepalkit pääajassa, avaa/palaa-toiminnot ja yhteisen lähteen vaikutusilmoitus.
- [ ] Yhdistä raahaus, numerokenttä, skriptikutsu ja **Toista liike** T3:n muunnokseen. Poista niiden omat oletukset paikallisesta ajasta.
- [ ] Erota näkyvyysikkunan loppuraja viimeisestä renderöitävästä ruudusta. Keskitä ruutuaskel ja kuvataajuus; jos projektin FPS ei ole luotettavasti saatavilla, V1 ilmoittaa ja rajaa tuen 30 fps:ään.
- [ ] Lue `frameTools.ts`, `thumbnail.ts`, `projectSignature.ts` ja vientikopiointi. Lisää todisteeseen katsottu koostetiedosto, esiintymäkonteksti ja molemmat ajat; varmista, että vanhemman tai lapsen muutos vanhentaa päävideon todisteen.

**Valmis kun:** päävideon 5,2 s ruutu todistaa valitun kohtauksen 1,2 s tilanteen; paluu säilyttää kohdan; väärän kontekstin ruutua ei esitetä uutena todisteena.

### T5 — Oma UAT ja luovutus

- [ ] Lisää `packages/studio/tests/e2e/ari-curves-scene-time.mjs` ja `package.json`-komento `ari:test:curves-scenes` (uusi, ei vielä käytössä). Testi omistaa omat työkopionsa ja renderihakemistonsa.
- [ ] Tee RajaMarket-prototyypistä erillinen paikallinen kopio, jossa tuotekortti on sisäkkäinen kohtaus. Käytä vain jo jäädytettyä aineistoa, pidä PROTOTYYPPI-merkintä ja lähdetiedot. Ei mallikutsuja tai asiakasjulkaisua.
- [ ] Aja alla oleva näkyvä käyttökokeilu, korjaa löydökset ja toista epäonnistunut kohta. Kirjaa myös tilanteet, joissa jouduit avaamaan lähdekoodin.
- [ ] Päivitä `ARI.md`, `ARI-SPRINT-EASY-MOTION.md` ja uusi `ARI-SPRINT-CURVES-SCENES.md`: komennot, tukirajat, todistetut tulokset, aineiston ja vientien hashit sekä jäljellä olevat puutteet. Vanhat testimäärät eivät ole tämän sprintin näyttö.

## 7. Varmennus ja hyväksymiskokeet

**Yksikkö- ja sopimustestit:** käyrän finite-/raja-arvot, kanoninen serialisointi, x1 > x2 -tapaus, overshoot, virheellinen custom, segmentin oikea kohdistus, round-trip-ajanmuunnos, kahden tason ikkunat, toistetun lähteen vaikutus, vanhentunut vanhempi/lapsi, keskeytetty raahaus ja tallennusvirhe. Tarkista tuetun runtime-interpoloinnin arvot myös liikkeen sisältä.

**Selainkoe:** 1440×900 ja 1280×800. Valitse taso näkyvästi, säädä käyrä numeroin ja raahaamalla, siirrä liike pääaikaan 5,20 s, avaa kohtaus ja palaa, peru/tee uudelleen ja lataa sivu. Testaa samat muutokset skripti → UI → skripti -järjestyksessä. Vähintään yksi kahvaraahaus tehdään oikealla computer use -eleellä. Dev-hookki ei korvaa sen UX-todistetta.

**Mitattava oma käytettävyys:** kirjaa aktiivinen muokkausaika, väärät kohdistukset ja koodin kautta tehdyt pelastukset. Tavoite on koko valinta → käyrä → pääajan muutos → tarkistus alle viidessä minuutissa harjoituskierroksen jälkeen, renderöinnin odotusaika erikseen. Vaaditaan nolla väärään esiintymään kirjoitettua muutosta ja nolla pakollista lähdekoodipelastusta tuetussa matkassa. Aikaa ei julisteta saavutetuksi ilman mittausta.

**Kuvallinen näyttö:** tallenna studiosta screenshotit ja lähteestä rajaruudut: liikkeen alkua edeltävä ruutu, alku, 25/50/75 %, loppu sekä kohtauksen päättymistä ympäröivät ruudut. Tarkista päävideo ja erikseen avattu kohtaus vastaavissa ajoissa. H.264-videon vertailu ei vaadi byte-identtisiä pikseleitä, mutta liikkuvan kohteen paikka, näkyvyys ja rajat täsmäävät. Tarkista ladattu MP4 kokonaan kronologisesti; kirjaa käytetty näytetiheys ja tarkista kriittiset rajat lisäksi ruutu kerrallaan.

**Komennot:** aja forkin Bun-työkaluilla, ei AdForgen npm-komentoja. Studion testit ovat Vitest-testejä, eivät bare `bun test` -testejä.

```sh
bun run ari:test
bun run --cwd packages/studio test src/components/editor/EaseCurveSection.test.tsx src/components/editor/EaseParamFields.test.tsx
bun run --cwd packages/studio typecheck
bun run --cwd packages/parsers test
bun run --cwd packages/parsers typecheck
bun run --cwd packages/core test
bun run --cwd packages/core typecheck
bun run ari:test:browser
bun run ari:test:motion
# Lisätään T5:ssä:
bun run ari:test:curves-scenes
bun run ari:build
```

Aja lisäksi uuden aikamuunnosmoduulin ja muuttuneiden palvelinpolkujen kohdennetut testit. Tarkista muuttuneet tiedostot oxlintillä ja oxfmtillä sekä repon vaatimalla `bunx fallow audit --base origin/main --fail-on-issues`-komennolla. Jos runtime muuttuu, aja coren `test:hyperframe-runtime-parity` ja tarvittavat runtime-seek-testit rakennetulla paikallisella versiolla. UAT-koosteille käytetään saman forkin CLI:n `lint`- ja `check`-komentoja ennen vientiä.

Todisteet: `screenshots/<toteutuspäivä>-ari-curves-scenes/`, sisältäen kuvat, kuitit, valmiin selaimen latauksen, ffprobe-tiedot, lähde-/aineistomanifestin sekä lyhyen havaintoraportin. Ohjelmallinen readback, runtime-varmennus ja visuaalinen arvio raportoidaan erikseen.

## 8. Seuraava toimitus: venytetty kohtausaika

Tämä aloitetaan vasta, kun T0–T5 ovat hyväksyttyjä. Tutkitaan ensin runtime-pariteetti vakionopeuksilla 0,5× ja 2× sekä playback-startilla. Yhden todistetun host-muunnoksen malli on `paikallinen = lähdealku + (vanhemman aika − sijoitusalku) × nopeus`; käänteismuunnos jakaa nopeudella, ja paikallinen kesto muunnetaan vastaavasti. Ketjujen muunnoksia yhdistetään vain sen mukaan, mitä runtime todella tekee — erikseen seekattuja aikajanoja ei automaattisesti käsitellä GSAP-vanhemmuuksina.

Tarvittavat tiedostot ovat T3:n kontekstiratkaisin, runtime `init.ts`/`playbackRate.ts`, työkaluskeemat, readback sekä T4:n käyttöliittymä. Hyväksyminen vaatii UI:n, skriptin, previewn ja MP4:n yhtenevät rajaruudut, myös kahdessa sisäkkäisyystasossa ja trimmatussa ikkunassa. Nolla-/negatiivinen nopeus, repeat/yoyo, nopeusrampit ja epäselvä GSAP-aikaremap pysyvät estettyinä. Niille ei rakenneta arvaavaa tukea tämän työn sivussa.

AE:n oma JSX-siirto, vapaa nopeusgraafi, motion path -editori, massamuokkaus, 3D ja autonominen briefistä mainokseksi -silmukka ovat erillisiä tehtäviä. Tämä suunnitelma parantaa nykyistä omaa työkalua nimenomaan tarkassa liikkeessä ja kohtauksen ajassa.
