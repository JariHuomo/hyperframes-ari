# Ari Studio: helppo liike-editori — seuraava sprintti

Päiväys: 9.9.2026. Tila: **agentin oman yhdistelmätyön ydin toteutettu ja UAT ajettu**. Alla säilyy alkuperäinen laajempi suunnitelma, ei väite kaikkien kohtien valmistumisesta.

## Toteutunut rajaus 9.9.2026

Omistaja täsmensi suunnitelman jälkeen: agentti on ohjelmiston ainoa käyttäjä ja käyttää computer usea sekä skriptejä yhdessä. Toteutus ja näyttö: [ARI-SPRINT-EASY-MOTION.md](../ARI-SPRINT-EASY-MOTION.md).

- S1: lähteestä tarkistetut liikekuitit, vaihtuvan id:n käsittely ja kirjoitusvirheen selainkoe toteutettu.
- S2–S3: yhtenäinen valinta, tasot, oikea paneeli, jatkuva kevyt aikajana, ruutuaskel, raahaukset ja numerokentät toteutettu.
- S4: teksti, koko, väri, x/y-siirto, kolme liikevalintaa ja olemassa olevan liikkeen ajoitus/tuntuma toteutettu. Täydelliset alku/loppuarvot ja mittakaavasäätimet jäivät nykyisiin tarkkoihin työkaluihin ja skripteihin.
- S5: **Avaa kohtaus** ja tieto jaetusta lähteestä toteutettu; automaattinen pääajan muunnos siirtyi seuraavaan sprinttiin suunnitelman varauksen mukaisesti.
- S6: vanhentuva ruutukuvatodiste, odottava vienti, eristetyt syötetavut, projektikohtainen historia ja uusin MP4-lataus toteutettu. Live-esikatselun erillinen revisiokuittaus jäi avoimeksi.
- S7: oma näkyvä muokkauskoe, toistettava skripti + UI -ajo, aiempi samannimisten kohteiden regressio sekä koko lopullisen videon 20 fps + alkuperäisten rajakohtien katselu tehty. 200 % zoomia, kaikkia ulkoisen muokkaajan kilpailutilanteita tai viiden minuutin käyttöaikaa ei todennettu. Ruutuaskel on tässä 30 fps, ei vielä projektikohtainen.

UAT:n viat korjattiin ja yhdistelmäajo toistettiin onnistuneesti. Tämä toimittaa nykyisen käyttäjän oman työympäristön, ei kaikkia alla olevan yleiskäyttöisen editorin hyväksymisehtoja.

## Tavoite

Käyttäjä avaa mainoksen, valitsee tekstin tai kuvan, muuttaa sen ulkoasua ja liikettä, tarkistaa lopputuloksen ja vie MP4:n ilman JSONia tai lähdekoodin avaamista. Agentti voi tehdä saman yhteisen komentorajapinnan kautta ja luovuttaa työn ihmiselle missä tahansa vaiheessa.

Tulkinta omistajan toiveesta: **After Effects -henkinen, helposti opittava työtila Ari Studion sisällä.** Tämä sprintti ei rakenna Adobe After Effects -integraatiota. HyperFrames ja paikallinen renderöinti säilyvät pohjana; AdForgea, kirjautumista tai mallipalvelua ei tarvita tämän työn tekemiseen.

Sprintin hyväksymislause: **“Pystyn muokkaamaan RajaMarket-mainoksen tekstiä, sommittelua ja liikettä sekä viemään sen videoksi tavallisilla säätimillä. Skripti jatkaa täsmälleen samasta tilanteesta.”**

## Suunnitteluvaiheen lähtötilasta tarkistettu

Lähteet: `ARI.md`, `ARI-UAT-RAJAMARKET.md`, edellisen UAT:n `05-final-studio.png` sekä nykyinen editorikoodi. Tässä suunnittelutyössä ei ajettu uutta selain-UAT:ta.

- Tekstikenttä, sivuohjaamo, käynnistimen Bun-haku, ruutukuvan versiosidonta ja avoimen kohtauksen toistokohdasta alkava liike on jo tehty. Niitä ei tilata uudelleen.
- `EditorShell.tsx` piilottaa aikajanan suuren kuvan tilassa. Kuva ja ajallinen rakenne eivät ole samalla kertaa käytettävissä kevyessä työtilassa.
- Ohjaamo näyttää kuvavalinnan ja aikajanan kohteen erikseen. Käyttäjän pitää vielä tulkita, kumpaan muutos kohdistuu.
- Upstreamin `AnimationCard.tsx` sisältää jo ajoituksen, alku- ja loppuominaisuuksia sekä liikekäyrän. Toteutus voi käyttää olemassa olevia muokkauspolkuja.
- `animationTools.ts` palauttaa liikkeistä edelleen `dispatched`-tuloksia. Käskyjen valmistuminen ja todennettu tallennus tarvitsevat yhtenäisen sopimuksen.
- `useGsapAnimationOps.ts` kieltäytyy pääaikajanalta sisäiseen kohtaukseen lisättävästä liikkeestä. Tämä on nykyinen turvallinen raja, ei valmis aikamuunnos.
- UAT varmisti paikallisen MP4-tiedoston, mutta selaimen latauksen valmistuminen jäi todentamatta. Myös peruspolun kieli on sekoitus suomea ja englantia.

## Työtila ja käyttäjän kulku

Ylhäällä ovat projektin nimi, tallennuksen tila, Peru / Tee uudelleen ja **Vie video**. Vasemmalla ovat **Tasot / Aineisto**, keskellä suuri kuva, oikealla valitun kohteen **Teksti / Ulkoasu / Liike** ja alhaalla jatkuvasti näkyvä matala aikajana. Tarkempi aikajana ja koodityökalut saa avattua erikseen.

Tasoluettelo, kuvan valintakehys, ominaisuudet ja aikajanan korostus viittaavat samaan kohteeseen. Käyttäjälle näytetään esimerkiksi “Otsikko” ja “Tuotekuva 1”; tiedostopolut ja tekniset tunnisteet ovat lisätiedoissa. Nimi tulee projektin metatiedoista tai käyttäjän nimeämisestä, ei tekstin merkitystä arvaavasta sanalistasta.

Liikkeen peruslomake näyttää esimerkiksi: **Liike: Liu’u sisään · Suunta: Alhaalta · Alkaa: 2,60 s · Kesto: 0,45 s · Tuntuma: Pehmeä**. Sen alla ovat **Toista liike**, **Muokkaa alku- ja loppuasentoa** ja **Poista liike**. Nykyisen liikkeen säätäminen ei lisää toista liikettä vahingossa.

Tarkka muokkaus näyttää sijainnin, koon, kierron ja peittävyyden alku- ja loppuarvot sekä olemassa olevan käyräsäätimen. Perusasetukset ovat Tasainen, Pehmeä ja Napakka. Liikevalinnat ovat Häivytys, Liu’u sisään ja Kasva paikalleen. Arvot ovat versionoituja asetuksia yhteisen muokkauspolun päällä.

## Sprintin työjonot toteutusjärjestyksessä

| Työ                                     | Konkreettinen muutos                                                                                                                                                                                                                                                               | Hyväksymisehto                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 · Yhteinen muokkauksen valmistuminen | Liikkeen lisäys, päivitys, poisto ja tuetut avainruutumuutokset odottavat tallennusta. Palautetaan todellinen kohde, liikkeen tunniste, tallennettu ajoitus ja lähdeversio. UI ja skripti käyttävät samaa toteutusta.                                                              | Onnistunut vastaus vastaa uudelleen luettua lähdettä; virhe ei näytä tallennettua tilaa. Vanhentunut kohde tai versio hylätään. Hidas tallennus ja kirjoitusvirhe eivät tuota kaksoisliikettä.                                                                |
| S2 · Yksi valinta ja vakaa työtila      | Yhdistetään kuva, tasot, ominaisuudet ja aikajana yhden lähdetiedoston ja esiintymän huomioivan valinnan alle. Painikkeiden paikat pysyvät vakaina; peruspolun tekstit ovat suomeksi.                                                                                              | Kuvasta tai tasolistasta valitseminen korostaa saman kohteen kaikkialla. Kaksi samannimistä kohdetta eri kohtauksissa eivät sekoitu. Skriptin valinta näkyy heti käyttöliittymässä.                                                                           |
| S3 · Kevyt aikajana                     | Suuren kuvan tilaan aikaviivain, toistokohta, valitun kohteen näkyvyys ja liikkeen alku/loppu. Siirtyminen napsauttamalla ja ruutu kerrallaan; liikkeen siirto ja reunasta keston säätö sekä vastaavat numerokentät.                                                               | Sama 2,60–3,05 s liike näkyy oikein lomakkeessa, aikajanalla ja lähteessä. Yksi raahaus on yksi peruttava muutos. 1440×900-näkymässä 9:16-kuva on vähintään 500 px korkea aikajanan ja ominaisuuksien ollessa näkyvissä.                                      |
| S4 · Teksti, ulkoasu ja helppo liike    | Tuodaan teksti, fonttikoko, väri, sijainti, mittakaava ja kolme liikevalintaa oikeaan sivupaneeliin. Säilytetään tarkat alku/loppuarvot lisäsäätöinä. Näytetään olemassa olevat liikkeet.                                                                                          | Otsikon muokkaus, tuotekuvan siirto, liikkeen lisäys, keston ja tuntuman vaihto sekä poisto onnistuvat ilman JSONia. Lisääminen valitun kohteen jälkeen vaatii enintään kolme painallusta ilman arvojen syöttöä.                                              |
| S5 · Kohtauksen aika ymmärrettäväksi    | Tuetaan ensin tavallista sisäkkäistä kohtausta ilman toistoa tai ajan venytystä. Muunnetaan pääaika paikalliseksi esiintymän aloituksesta; näytetään murupolku ja Avaa kohtaus -toiminto.                                                                                          | Kohdan 4 s sisällä ajassa 1 s alkava liike näkyy pääaikajanalla kohdassa 5 s. Moniselitteinen, toistuva tai venytetty rakenne ohjaa avaamaan kohtauksen eikä arvaa aikaa. Jaetun kohtauslähteen muutos kertoo vaikutuksen kaikkiin esiintymiin.               |
| S6 · Tallennus, tarkistus ja vienti     | Näkyvät tilat “Tallennetaan…”, “Tallennettu”, “Esikatselu päivittyy…” ja “Tallennus epäonnistui”. Vienti odottaa keskeneräiset muutokset ja sitoo työn sen käyttämiin lähteisiin ja aineistoon. Suomenkielinen vienti näyttää etenemisen, lopputuloksen ja virheestä palautumisen. | Muutos → välitön vienti käyttää uutta muutosta. Renderin aikainen lähteen tai median muutos ei sekoita versioita: käytetään eristettyä syötekopiota tai vienti keskeytetään. Selaimen latauksesta saadaan valmistunut tapahtuma, tiedosto ja toistettava MP4. |
| S7 · Todellinen hyväksymisajo           | RajaMarketin jäädytetyllä prototyypillä kaksi erillistä matkaa: pelkkä näkyvä UI sekä skripti → UI → skripti. Lisäksi pieni sisäkkäisten kohtausten regressioprojekti.                                                                                                             | Kaikki alla olevan UAT:n portit läpäisty. Korjattu tuote testataan uudelleen samoilla tehtävillä; pelkkä yksikkötestien määrä ei riitä.                                                                                                                       |

## Tekniset rajat

- Käytetään nykyistä tallennuksen koordinointia, GSAP-muokkauspolkua, historiaa ja renderöijää. Kevyt aikajana on nykyisen aikatiedon rajattu näkymä; sillä ei ole omaa kelloa tai tallentajaa.
- S1 laajentaa tarvittaessa nykyistä suljettua komentoluetteloa niin, että uusi liikeasetusten käyttö tallentuu yhtenä peruttavana toimintona. Usean erillisen kirjoituksen ketju ei saa jäädä puolivalmiiksi onnistuneena.
- Liikkeen tyyppiä ei päätellä mielivaltaisesta JavaScriptistä. Tuetut rakenteet tunnistetaan parserin tiedoista. Muu liike näytetään muodossa “Mukautettu liike” ja avataan tarkempaan editoriin; helppo asetus ei saa korvata sitä huomaamatta.
- Automaattinen liikkeen tallennus pysyy oletuksena pois. Päälläolo näkyy sekä kuvassa että aikajanalla. Tavallinen sommittelumuutos ei luo avainruutua ilman näkyvää valintaa.
- Numerokentät hyväksyvät suomalaisen desimaalipilkun ja pisteen. Ruudun tarkkuus johdetaan projektin kuvataajuudesta. “Tuntuma” ei muuta kestoa.
- Käyttäjälle näkyvät tallennuksen ja tarkistuksen tilat erotetaan mainoksen laadun arviosta. Tarkistettu tiedosto ei tarkoita laadultaan hyväksyttyä mainosta.
- Vanha ruutukuva merkitään muutoksen jälkeen vanhentuneeksi. Esikatselun ajantasaisuutta ei päätellä ajastimesta vaan toteutuneesta lataus-/päivityskuittauksesta.
- Vientiin tarvittava syötteiden eristys tehdään paikallisesti. Pysyvä versioarkisto ja täydellinen projektihistoria kuuluvat myöhempään sprinttiin.

## Toteutuspaikat

| Alue                                              | Nykyinen liittymä                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Työtilan asettelu ja suomenkieliset perussäätimet | `packages/studio/src/components/EditorShell.tsx`, `packages/studio/src/ari/`                                       |
| Liikkeen muokkaus ja tallennuskuittaus            | `packages/studio/src/webmcp/tools/animationTools.ts`, `webmcp/writeCoordinator.ts`, `hooks/useGsapAnimationOps.ts` |
| Ominaisuudet ja käyrät                            | `packages/studio/src/components/editor/AnimationCard.tsx`, `GsapAnimationSection.tsx`, `EaseCurveSection.tsx`      |
| Valinta ja kevyt aikajana                         | `packages/studio/src/player/store/`, `player/components/`, `components/nle/TimelinePane.tsx`                       |
| Ruutukuvat ja versiot                             | `packages/studio/src/utils/frameCapture.ts`, `packages/studio-server/src/routes/thumbnail.ts`                      |
| Selainregressio                                   | `packages/studio/tests/e2e/ari-edit-loop.mjs` ja uusi erillinen käyttäjätehtävien UAT                              |

Vientipolun tarkka toteutuspaikka ja mahdollinen nykyinen syötteiden eristys kartoitetaan S6:n alussa ennen uuden mekanismin lisäämistä. Yllä oleva luettelo erottaa tarkistetut liittymät vielä kartoittamattomasta työstä.

## UAT ja sprintin valmistumiskriteerit

Testiaineisto on edellisen UAT:n RajaMarket-prototyyppi. Sen 9.9.2026 päättyvää tarjousta ei esitellä uutena ajantasaisena kampanjana. PROTOTYYPPI-merkintä säilyy. Ajo tehdään työkopiossa, alkuperäinen vertailulähde säilyttäen.

1. Avaa projekti käynnistimen kautta. Muuta otsikko ja sen fonttikoko. Valitse tuotekuva ja muuta sijaintia.
2. Lisää otsikolle liike kohtaan 2,60 s. Aseta kestoksi 0,45 s ja tuntumaksi Pehmeä. Toista liike näkyvästä painikkeesta.
3. Siirrä liikettä aikajanalla ja muuta kestoa reunasta. Tarkista sama aika numerokentistä. Peru ja tee uudelleen. Päivitä sivu; sisällön ja ajoituksen pitää säilyä.
4. Tarkista tallennettu ruutu. Muuta tekstiä ja varmista, että vanha tarkistus merkitään vanhentuneeksi. Tallenna uusi tarkistus.
5. Vie MP4 heti viimeisen muutoksen jälkeen. Varmista selaimen latauksen valmistuminen, tiedoston koko, kesto, resoluutio ja toistettavuus. Tarkista tekstimuutokset videosta.
6. Toista vastaava matka sekoittaen skriptikäskyjä ja näkyviä säätimiä. Vertaile kohdetta, ajoituksia ja renderöityjä rajakohtia samaan odotettuun tulokseen; pelkät HTML-tavuerot eivät merkitse kuvavirhettä.
7. Testaa erikseen sisäkkäinen kohtaus, saman lähteen kaksi esiintymää, tallennuksen viive/virhe sekä ulkoinen tiedostomuutos. Virheiden pitää olla ymmärrettäviä ja työn palautettavissa.

Näkyvän UI:n hyväksymismatka tehdään ilman DevToolsia, JSON-lomaketta, testikoukkuja tai lähdekoodin kautta tehtyä pelastusta. Näppäimistö ja nimetyt näkyvät kontrollit ovat sallittuja. Testikoukut ovat regressioiden apuväline, eivät todiste klikkailun helppoudesta.

Mitataan onnistuminen, painallukset, väärät kohdevalinnat, korjausyritykset ja aktiivinen muokkausaika. Tavoite: harjoitellun yllä olevan perusmatkan editointi enintään viisi minuuttia; renderöintiaika raportoidaan erikseen. Tätä ei kutsuta uuden käyttäjän opittavuustulokseksi. Se vaatii erillisen ensikertalaisen kokeen.

UI tarkistetaan koossa 1440×900 ja 1280×800 sekä 200 % käyttöliittymäzoomilla: ydintoiminnot saavutettavissa, paneelit vieritettävissä, ei päällekkäisiä kontrolleja. Näkyvän valinnan ja tilojen ymmärtäminen ei saa riippua pelkästä väristä. Peruskontrollien osuma-alue vähintään 40 px; pienillä aikajanakahvoilla on vaihtoehtoinen numerokenttä.

Tekninen hyväksyntä: muutettujen osien kohdennetut Vitest-testit, Ari-selainregressio, uusi UAT, studio/server-tyyppitarkistus ja build sekä muotoilu/lint. Lopullinen seitsemän sekunnin video tarkistetaan kronologisesti 20 fps:n ruutusarjana ja muutettujen liikerajojen ympäriltä alkuperäisellä kuvataajuudella. Äänitöntä testivideota ei kirjata äänityön hyväksynnäksi.

## Kapasiteetti ja rajaus

Suunnitteluvaraus: yksi noin kahden viikon sprintti yhdelle toteuttajalle. Tämä on alustava kapasiteettiarvio, ei koodikatselmukseen perustuva toimituslupaus.

- Alku: S1 ja S2; ensimmäinen päästä päähän kulkeva muutos talteen.
- Keskiosa: S3 ja S4; koko perusmuokkaus tehdään jo näkyvillä säätimillä.
- Loppu: S6 ja S7; vienti ja todennettu UAT. S5 toteutetaan rajattuna, jos aikamuunnoksen selvitys mahtuu varaukseen.
- Noin kaksi päivää varataan UAT:ssa löytyviin korjauksiin. Jos kapasiteetti ylittyy, S5 siirtyy seuraavaan sprinttiin ja Avaa kohtaus -ohjaus säilyy. Tallennuksen luotettavuutta, yhteistä valintaa ja vienti-UAT:ta ei leikata.

Tähän sprinttiin eivät kuulu vapaa AE-tasoinen kompositointi, 3D, maskien/motion trackingin rakentaminen, oma uusi käyräeditori, äänimiksaus, kaikki kuvasuhteet, automaattinen briefistä mainokseksi -agentti tai asiakastuotannon julkaisu. Niillä on omat hyväksymiskriteerinsä.

Seuraavan sprintin ehdokas on **mallista uusi mainos**: projektin kopiointi, aineiston vaihto ja koon sovitus. Sen jälkeen pysyvä brief → toteutus → kuvatarkistus → korjaus -silmukka saa tämän sprintin testatun muokkauspinnan käyttöönsä. AdForge-tuotantoon liittyminen säilyttää oikeat hinta-, hyväksyntä- ja julkaisuportit.

Alkuperäinen suunnitteluvaihe ei muuttanut sovelluskoodia. Sen jälkeinen toteutus on kuvattu yllä ja toteutusraportissa. Kumpikaan vaihe ei kutsunut maksullisia palveluita.
