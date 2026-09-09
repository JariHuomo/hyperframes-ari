# Ari Studio: tarkat käyrät ja sisäkkäisten kohtausten aika — seuraava sprintti

Päiväys: 9.9.2026. Tila: **toteutettu 9.9.2026** — K1–K5, S1–S5, U1, U2 ja D1 ovat valmiit ja
verifioidut; toteutusraportti ja UAT-todisteet: [`ARI-SPRINT-SCENES-CURVES.md`](../ARI-SPRINT-SCENES-CURVES.md).
Alkuperäinen tila oli "suunnitelma, sovelluskoodia ei muutettu". Jatkaa
[easy-motion-sprintin](2026-09-09-ari-studio-easy-motion-sprint.md) kahta avointa kohtaa:
"Tarkemmat käyrät ja sisäkkäisten kohtausten aikamuunnokset jäivät jatkotyöksi."

Käyttäjä on edelleen agentti itse: computer use + `window.ariStudio.call` -skriptit.
Kaikki uusi kulkee saman suljetun työkaluluettelon läpi, ja jokainen kirjoitus palauttaa
lähteestä uudelleen luetun kuitin.

## Lähtötila (tarkistettu koodista 9.9.2026)

### Käyrät

- Upstreamilla on jo täysi käyräeditori: `components/editor/EaseCurveSection.tsx`
  (Figma-tyylinen bezier-raahaus, ylitysvara), `EaseModeControls.tsx` (curve / spring /
  wiggle), `EaseParamFields.tsx`, `easePresetLibrary.ts` (33 esiasetusta),
  `gsapAnimationConstants.ts` (`EASE_CURVES`, `resolveEaseCurveTuple`), `easeCurveSvg.tsx`
  (`MiniCurveSvg`-glyyfi). Runtime `core/src/runtime/customEase.ts` tulkitsee
  `custom(M0,0 C x1,y1 x2,y2 1,1)`, `spring(b)`, `wiggle(...)` ja `hold`. Serialisoija
  kirjoittaa `ease`-merkkijonon sellaisenaan lähteeseen (`gsapSerialize.ts:248`).
- Ari-paneeli `ari/AriMotion.tsx` tarjoaa vain kolme tuntumaa (`none`, `power2.out`,
  `power3.out`) ja näyttää muun "Mukautettu (…)"-tekstinä ilman kuvaa.
- `studio_add_animation` hylkää muut kuin nuo kolme. `studio_update_animation` hyväksyy
  minkä tahansa merkkijonon (paitsi `__raw:`) **tarkistamatta**, että GSAP tuntee sen.
  Kuitti vertaa vain merkkijonon yhtäsuuruutta (`animationReadback.ts:95`), joten
  kirjoitusvirhe kuten `power2.uot` menee läpi "verified"-tilassa ja GSAP putoaa hiljaa
  oletuskäyrään.
- Avainruutuliikkeellä käyrän avain on `easeEach`, ei `ease` (`AnimationCard.tsx:331`).
  Ari-lomake lähettää aina `ease` → avainruutuliikkeen tuntuma ei muutu.
- `studio_inspect` palauttaa käyrän vain nimenä. Skripti ei saa ohjauspisteitä eikä
  voi tarkistaa, mitä käyrä oikeasti tekee.
- Aikajanan liikepalkissa ei ole käyräkuvaa.

### Sisäkkäiset kohtaukset

- Runtime muuntaa pääajan kohtauksen paikalliseksi ajaksi yhdellä kaavalla
  (`core/src/runtime/init.ts:2846–2865`):
  `local = clamp(playbackStart + max(0, master − hostStart) × playbackRate, 0, sceneDuration)`.
  `hostStart` tulee `resolveStartForElement`-funktiosta (tukee lausekkeita kuten
  `intro + 2`), `playbackStart` attribuuteista `data-playback-start`/`data-media-start`,
  `playbackRate` attribuutista `data-playback-rate` (0,1–5). Toistoa (loop) ei ole.
- Studio näkee tarvittavat luvut valmiiksi ratkaistuina `clipManifest`-riveiltä:
  `start`, `duration`, `compositionSrc`, `compositionId`, `parentCompositionId`,
  `compositionAncestors`, `playbackStart`, `playbackRate`
  (`player/lib/playbackTypes.ts:37`, `core/src/runtime/types.ts:53–78`).
- Valinta tietää `sourceFile`, `compositionPath`, `compositionSrc`, `isCompositionHost`
  (`components/editor/domEditingTypes.ts:78`).
- Nykyinen Ari-käytös: `AriMotion` näyttää sisäkkäiselle valinnalle vain **Avaa kohtaus**;
  `AriTimeline` piilottaa sen liikepalkit; `useGsapAnimationOps.addGsapAnimation`
  kieltäytyy, kun pääajan toistokohta annettaisiin toisen tiedoston kohtaukselle
  (`useGsapAnimationOps.ts:121–128`). Tämä on oikea turvaraja, ei muunnos.
- Sama kohtauslähde voi esiintyä monta kertaa (fixture
  `tests/e2e/fixtures/composition-reliability`: `title-card.html` kohdissa 0 s ja 4 s sekä
  kahden tason syvyydessä `nested-shell.html` → `title-card.html`). Silloin yksi
  paikallinen aika vastaa useaa pääaikaa.

## Tavoite ja hyväksymislause

**"Näen ja säädän liikkeen käyrän kuvana ja numeroina, ja sisäkkäisen kohtauksen liike näkyy
ja säätyy pääajassa ilman kohtauksen avaamista, kun esiintymä on yksiselitteinen.
Skripti saa saman käyrän ja saman aikamuunnoksen kuittina."**

Ei tässä sprintissä: uusi käyrämoottori, aikajanan venytys/loop-attribuutit runtimeen,
per-avainruutu-käyrät Ari-paneelissa (ne jäävät tarkkoihin työkaluihin), äänen aika,
mallikutsut.

## Työjonot toteutusjärjestyksessä

| Työ                                    | Konkreettinen muutos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Hyväksymisehto                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1 · Suljettu käyräsopimus             | Uusi `packages/studio/src/webmcp/easeContract.ts`: `parseEase(input) → { ok, ease, kind: "named"\|"custom"\|"spring"\|"wiggle"\|"hold", points?, label }` tai `{ ok:false, reason }`. Hyväksyy vain `STUDIO_GSAP_EASE_OPTIONS`-nimet, `custom(...)`-kuution (X ∈ [0,1]), `spring(b)`, `wiggle(...)`, `hold`. Normalisoi (`back.out` → `back.out(1.7)` vain jos parseri tekee samoin; muuten säilyttää). Käyttää `resolveEaseCurveTuple`, `parseSpringBounce`, `parseWiggleEase`, `parseStudioCustomEaseData`.                                                                                                                                                                   | `studio_add_animation` ja `studio_update_animation` hylkäävät tuntemattoman käyrän ennen kirjoitusta (`invalid`, syy suomeksi). `power2.uot` ei koskaan päädy lähteeseen. Yksikkötestit: jokainen esiasetus, kuution X-rajat, ylitys Y:ssä sallittu, roskamerkkijonot.                           |
| K2 · Kuitti kertoo käyrän              | `settleAnimationWrite` vertaa käyrää `parseEase`-normalisoidussa muodossa ja liittää kuittiin `easeCurve: { kind, points \| bounce \| wiggle, label }`. `studio_inspect` saa saman `easeCurve`-kentän jokaiselle liikkeelle; avainruutuliikkeelle `easeEach`.                                                                                                                                                                                                                                                                                                                                                                                                                   | Skripti voi lukea ohjauspisteet numeroina ilman DOMia. Kuitti `verified` vain, jos lähteen käyrä on täsmälleen pyydetty.                                                                                                                                                                         |
| K3 · Avainruutuliikkeen tuntuma        | `studio_update_animation` ja `AriMotion` valitsevat avaimen `animation.keyframes ? "easeEach" : "ease"` samoin kuin `AnimationCard`. `updateGsapMeta` tukee jo `easeEach`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Avainruutuliikkeen tuntuman vaihto Ari-lomakkeesta näkyy lähteessä `easeEach`-arvona, kuitti `verified`.                                                                                                                                                                                         |
| K4 · Tuntuma kuvana                    | `AriMotion.tsx`: Tuntuma-valitsin näyttää `MiniCurveSvg`-glyyfin, suomenkielisen nimen ja upstreamin esiasetukset ryhmiteltynä (Tasainen / Pehmeä / Napakka / Palautuva / Jousi / Heilahdus). Uusi `AriEase.tsx` kietoo `EaseCurveSection`-komponentin: `onCustomEaseCommit` → `bridge.call("studio_update_animation", { handle, animationId, ease })`; odottava tila näkyy, kunnes kuitti palaa. Uuden liikkeen lomakkeessa sama valitsin. Aikajanan liikepalkkiin pieni glyyfi.                                                                                                                                                                                               | Käyrän raahaus paneelissa tallentuu yhtenä peruttavana muutoksena, `verified`-kuitilla. Näytön valinta ei vaihda kestoa. Nappien paikat eivät liiku raahauksen aikana.                                                                                                                           |
| K5 · Käyrän toisto ja vertailu         | **Toista liike** -painike toimii samoin; lisäksi **Vertaa edelliseen**: toistaa liikkeen kahdesti (edellinen käyrä muistissa vain paneelin tilassa, ei lähteessä) ja pysähtyy loppuun. Ruutukuvatodiste: `studio_frame` liikkeen 25 / 50 / 75 % kohdista yhdellä kutsulla `studio_frame({ animationId, samples: [0.25,0.5,0.75] })` → kolme revisioon sidottua PNG:tä.                                                                                                                                                                                                                                                                                                          | Agentti näkee käyrän vaikutuksen kuvina ilman videon vientiä. Todisteet vanhenevat muutoksessa kuten nykyiset.                                                                                                                                                                                   |
| S1 · Kohtauksen aikamuunnos moduuliksi | Uusi puhdas `packages/studio/src/ari/sceneTime.ts`: `resolveSceneInstances(clipManifest, sourceFile) → SceneInstance[]` (`hostId`, `hostLabel`, `start`, `duration`, `playbackStart`, `playbackRate`, `ancestors`), ketjuttaa muunnoksen jokaisen esivanhemman läpi `compositionAncestors`-listan avulla. `masterToLocal(instance, t)` ja `localToMaster(instance, t)` toistavat runtime-kaavan (`init.ts:2857`). `localToMaster` palauttaa `null`, jos paikallinen aika on hostin ikkunan ulkopuolella.                                                                                                                                                                        | Yksikkötestit runtime-kaavaa vasten: start 4, rate 1; start 1 + playbackStart 0,5; rate 1,5; kaksi tasoa (nested-shell → title-card: pääaika 5 s = nested 5 s = title-card 4 s ja hostin kesto rajaa). Sama luku kuin runtime `seekStandaloneRegisteredTimelines` tuottaa — testi ajaa molemmat. |
| S2 · Esiintymän valinta                | Kun valinnan `sourceFile` ≠ aktiivinen kokoonpano: `AriMotion` näyttää "Kohtaus `title-card.html` · esiintymä 2/2 · pääajassa 4,00–8,00 s". Yhden esiintymän tapaus valitaan automaattisesti. Usean tapaus: pakollinen valitsin (nimi + pääaika), ei oletusta. Esiintymä tallennetaan Ari-paneelin tilaan ja `studio_select` saa valinnaisen `instance`-kentän (host-`hfId`). `studio_look` listaa kohtauselementille sen esiintymät.                                                                                                                                                                                                                                           | Kahden esiintymän kohteella liikettä ei voi tallentaa ennen esiintymän valintaa; virhe kertoo esiintymät. Jaetun lähteen varoitus säilyy: "Muutos koskee kaikkia 2 esiintymää."                                                                                                                  |
| S3 · Liike pääajassa                   | `AriMotion`-lomake näyttää sisäkkäiselle liikkeelle kaksi aikaa: "Alkaa kohtauksessa 1,00 s · pääajassa 5,00 s". Kentän voi täyttää kumpaan tahansa; toinen lasketaan. `AriTimeline` piirtää sisäkkäisen liikkeen palkin pääajan kiskolle muunnoksella (ja `×1,5`-merkin, jos rate ≠ 1); raahaus muuntaa takaisin paikalliseksi ennen kirjoitusta. **Toista liike** hakee ja pysäyttää pääajassa.                                                                                                                                                                                                                                                                               | 4 s alkavan kohtauksen 1 s liike näkyy pääaikajanalla kohdassa 5 s ja pysähtyy `localToMaster(end)`-kohtaan. Raahaus 5 → 5,5 s kirjoittaa lähteeseen 1,5 s.                                                                                                                                      |
| S4 · Työkalut ymmärtävät molemmat ajat | `studio_add_animation`, `studio_update_animation`, `studio_seek`: valinnainen `timeBasis: "master" \| "scene"` (oletus `scene` sisäkkäiselle, `master` juurelle) ja `instance`. Työkalu muuntaa paikalliseksi ennen `deps.addAnimation`-kutsua ja liittää kuittiin `{ scene: { sourceFile, instance, localPosition, masterPosition } }`. `useGsapAnimationOps`-kieltäytyminen säilyy täsmälleen sille tapaukselle, jossa pääajan toistokohta annettaisiin ilman ratkaistua esiintymää. Pääajan toistokohdan käyttö sisäkkäiselle lisäykselle sallitaan vain, kun esiintymä on yksiselitteinen tai annettu.                                                                      | Sama kutsu `position: 5, timeBasis: "master", instance: "title-host-b"` tuottaa lähteeseen `1` ja kuitin molemmilla ajoilla. Ilman `instance`-kenttää kahden esiintymän kohde → `invalid` ennen kirjoitusta. `studio_seek({ time: 1, timeBasis: "scene", instance })` siirtää pääajan 5 s:iin.   |
| S5 · Mahtuuko liike kohtaukseen        | Validointi kohtauksen omaa kestoa **ja** hostin ikkunaa vasten: liike, joka päättyy kohtauksen sisällä mutta hostin `duration`-ikkunan ulkopuolella, hylätään syyllä "ei näy pääajassa (kohtaus loppuu 8,00 s)". `data-playback-start` > 0 → alku ennen `playbackStart`ia hylätään samoin.                                                                                                                                                                                                                                                                                                                                                                                      | Testit: liike 3,5–4,5 s kohtauksessa, jonka host näyttää 0–4 s → invalid. Rate 2 lyhentää ikkunan puoleen.                                                                                                                                                                                       |
| U1 · Oikea UAT-aineisto                | Uusi `examples/rajamarket-scenes/`: sama RajaMarket-prototyyppi, jossa otsikkokortti on `scenes/headline-card.html` ja esiintyy **kahdesti** (alku 0,12 s ja loppu 5,6 s, jälkimmäinen `data-playback-rate="1.5"`), tuotepakkausten ruudukko oma kohtaus `scenes/pack-grid.html` yhdellä esiintymällä. Provenance ja sha256-tiedostot kopioidaan nykyisestä.                                                                                                                                                                                                                                                                                                                    | CLI-tarkistus läpi. Fixture ei koske `rajamarket-uat`- eikä `rajamarket-sprint-mixed`-projekteihin.                                                                                                                                                                                              |
| U2 · Selain-UAT                        | Uusi `packages/studio/tests/e2e/ari-scenes-and-curves.mjs` + `bun run ari:test:scenes`. Kulku: valitse pack-gridin pakkaus pääajassa → lisää liike pääajan 1,2 s:iin (ilman avaamista) → kuitti kertoo paikallisen 1,2 − hostStart → käyrä raahataan paneelissa `custom(...)`-muotoon → `studio_inspect` palauttaa pisteet → valitse otsikko (kaksi esiintymää) → lisäys ilman esiintymää hylätään → esiintymä 2 valitaan, liike pääajan 5,8 s:iin → palkki oikeassa kohdassa rate-merkillä → Peru / Tee uudelleen / lataa sivu → kolme ruutukuvaa 25/50/75 % → MP4-vienti → ffprobe + ruutusarja rajakohdista. Näkyvä klikkailukoe samalle kululle erikseen, ilman DevToolsia. | Kaikki portit läpi kahdessa työtilakoossa. Skripti + UI -ajo päätyy samaan lähteeseen kuin pelkkä UI. Videosta tarkistetaan, että loppuotsikko liikkuu 1,5× nopeammin kuin alkuotsikko.                                                                                                          |
| D1 · Dokumentit                        | `ARI.md`: käyräsopimus, kaksi aikaa, esiintymän valinta, työkalujen uudet kentät. `ARI-SPRINT-SCENES-CURVES.md`: toteutusraportti ja UAT-todisteet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Skriptiesimerkki, joka lisää liikkeen pääajassa sisäkkäiseen kohtaukseen ja lukee käyrän.                                                                                                                                                                                                        |

## Tekniset rajat

- Käyrän tulkinta on **mekaaninen**: suljettu nimiluettelo, numeeriset ohjauspisteet ja
  jo olemassa olevat parserit. Ei uutta käyrämoottoria, ei vapaata JavaScriptiä.
- Aikamuunnos toistaa runtime-kaavan eikä keksi omaa. Jos manifest ei tarjoa hostin
  alkua numerona (esim. resolvoitumaton lauseke), muunnos kieltäytyy ja UI näyttää
  edelleen **Avaa kohtaus**. Kieltäytyminen on tila, ei virhe.
- Monta esiintymää = valinta pakollinen. Koskaan ei arvata ensimmäistä.
- Jaettu lähde: liike kirjoitetaan kohtaustiedostoon, joten se koskee kaikkia
  esiintymiä. Tämä sanotaan lomakkeessa ja kuitissa (`affectsInstances: 2`).
- Kaikki uudet kentät ovat lisäyksiä nykyisiin työkaluihin, ei uusia työkaluja, jotta
  `ariStudio.tools()`-luettelo pysyy 12 nimessä ja aiemmat skriptit toimivat.
- Kuitti pysyy tasoilla `dispatched < saved < verified`; käyrän numeerinen luku
  ei nosta tasoa, se vain rikastaa `verified`-kuittia.
- Ruutuaskel on edelleen 30 fps; projektin fps ei kuulu tähän sprinttiin.

## Toteutuspaikat

| Alue                   | Tiedostot                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Käyräsopimus ja kuitit | `packages/studio/src/webmcp/easeContract.ts` (uusi), `webmcp/tools/animationTools.ts`, `webmcp/tools/animationReadback.ts`, `webmcp/tools/inspectTools.ts`                                                                                           |
| Käyrä-UI               | `packages/studio/src/ari/AriMotion.tsx`, `ari/AriEase.tsx` (uusi), `ari/AriTimeline.tsx`; uudelleenkäyttö: `components/editor/EaseCurveSection.tsx`, `EaseModeControls.tsx`, `easePresetLibrary.ts`, `easeCurveSvg.tsx`, `gsapAnimationConstants.ts` |
| Ruutukuvasarja         | `packages/studio/src/webmcp/tools/frameTools.ts`, `utils/frameCapture.ts`, `packages/studio-server/src/routes/thumbnail.ts`                                                                                                                          |
| Aikamuunnos            | `packages/studio/src/ari/sceneTime.ts` (uusi) + testi; luku `player/store/playerStore.ts` (`clipManifest`), vertailu `core/src/runtime/init.ts:2846`                                                                                                 |
| Esiintymä ja työkalut  | `webmcp/tools/selectionTools.ts`, `lookTools.ts`, `animationTools.ts`, `frameTools.ts` (`studio_seek`), `hooks/useGsapAnimationOps.ts` (kieltäytymisehto), `webmcp/StudioAgentTools.tsx`                                                             |
| Fixture ja UAT         | `examples/rajamarket-scenes/` (uusi), `packages/studio/tests/e2e/ari-scenes-and-curves.mjs` (uusi), `package.json` (`ari:test:scenes`)                                                                                                               |
| Dokumentit             | `ARI.md`, `ARI-SPRINT-SCENES-CURVES.md` (uusi)                                                                                                                                                                                                       |

## Riskit

- **Parserin liike-id vaihtuu**, kun ajoitus muuttuu (edellinen sprintti). Käyrän muutos ei
  muuta id:tä, mutta pääajassa raahattu siirto muuttaa. `AriEase` lukee id:n aina kuitista.
- **Kahden tason kohtaus:** manifest antaa `compositionAncestors`-listan, mutta jokaisen
  tason `playbackRate` pitää kertoa ketjussa. Testataan `nested-shell`-fixturella ennen UI:ta.
- **`EaseCurveSection` odottaa `ease`-propin kiertävän takaisin** (in-flight-jono). Ari-silta
  on sarjallinen (`busy`), joten yksi raahaus = yksi kutsu; ei saa lähettää pointer-move-
  tapahtumia bridgeen, vain pointer-up.
- **`custom(...)`-käyrän serialisointi** kulkee `updateGsapMeta` → `sdkGsapTweenPersist`
  tai `commitMutationSafely`. Kumpikin polku testataan; SDK-polku voi normalisoida
  desimaaleja (roundToCenti), jolloin merkkijonovertailu kuitissa epäonnistuu →
  K2:n normalisoitu vertailu on pakollinen ennen K4:ää.
- **Esikatselun aika kohtauksen avaamisen jälkeen** on kohtauksen oma kello. S3:n
  kaksoisnäyttö koskee vain pääajan näkymää; avatussa kohtauksessa näytetään vain
  paikallinen aika ja murupolku takaisin.
- **`studio_seek` sisäkkäiselle ajalle** rate ≠ 1 -tapauksessa pyöristyy ruutuaskeleeseen
  pääajassa, ei kohtauksessa. Kuitti näyttää molemmat, jotta ero on näkyvä.

## Verifiointi

1. `bun run ari:test` (lisätään `src/ari/sceneTime.test.ts`, `src/webmcp/easeContract.test.ts`).
2. `bun run --cwd packages/studio test src/components/editor/EaseCurveSection.test.tsx src/webmcp/tools`.
3. `bun run ari:test:motion` (edellisen sprintin regressio pysyy vihreänä).
4. `bun run ari:test:scenes` (uusi) 1440×900 ja 1280×800.
5. Studio- ja server-typecheck, `bun run ari:build`, oxlint/oxfmt muutetuille tiedostoille.
6. Manuaalinen klikkailukoe samalla kululla; kuvakaappaukset `screenshots/2026-09-xx-scenes-curves/`.
7. Lopullinen MP4: ffprobe (1080×1920, 30 fps, 7 s) ja ruutusarja molempien otsikko-
   esiintymien rajakohdista; verrataan, että loppuotsikon liike on 1,5× nopeampi.
8. Mallipalvelukuluja 0 USD; ei asiakaskrediittejä.

## Kapasiteetti

Noin 1,5 viikkoa yhdelle toteuttajalle: K1–K3 (1,5 pv), K4–K5 (2 pv), S1–S2 (1,5 pv),
S3–S5 (2 pv), U1–U2 + korjaukset (2 pv), D1 (0,5 pv). Jos aika loppuu, K5 ja S3:n
raahaus pääajassa siirtyvät; K1–K2 ja S1–S2 eivät leikkaudu, koska ne tekevät nykyisestä
`studio_update_animation`-työkalusta turvallisen ja antavat esiintymän valinnan.
