# Ari Studio: ElevenLabs-puhe ja ajoitettu teksti

Ari Studion **Puhe ja ajoitettu teksti** -toiminto tekee yhdestä hyväksytystä suomenkielisestä
tekstistä projektipaikallisen puheraidan ja HyperFrames-alikoosteen. Alikoosteen jokainen
tekstiryhmä käyttää ElevenLabsin alkuperäisen tekstin merkkiajoituksesta johdettuja alku- ja
loppuaikoja. Renderöinti ei lue kelloa tai verkkoa, joten sama aikapiste tuottaa saman ruudun.

## Käyttöpolku

1. Kirjoita hyväksytty puheteksti ja valitse palvelimen tarjoama, nimetty puheääni. Raakaa
   palveluntarjoajan tunnistetta ei kirjoiteta käyttöliittymässä. Jos valikoimaa tai yhteyttä ei
   ole määritetty, äänen luonti on pois käytöstä ja näkymä kertoo, mitä palvelinasetusta puuttuu.
2. Valitse ensimmäistä luontia varten **Tekstitys** tai **Lyriikkatyyli**, yksi kolmesta
   luettavasta tyylistä, sijainti, tasaus, turva-alue, ryhmäkoko ja puheen aloitusaika.
3. **Näytä hinta** jäädyttää puhetekstin, äänen, palvelun, mallin ja projektin lähdeversion
   kymmeneksi minuutiksi. Se ei vielä lähetä tekstiä.
4. **Hyväksy ja luo** käynnistää täsmälleen hintakorttiin sidotun pyynnön. Muuttunut lähde tai
   tarjous estää ajon ennen palvelukutsua.
5. Kun ääni on olemassa, **Päivitä tekstin esitys maksutta** esikatselee Tekstitys- tai
   Lyriikkatyyli-valinnan ja muut esitystavan asetukset maksuttomalla
   `POST /api/ari/projects/:id/voice/presentation` -toiminnolla. Se ryhmittelee tallennetun
   ajoituksen uudelleen ja päivittää alikoosteen lähettämättä mitään ElevenLabsille.

Uusi hintakortti ottaa lähtökohdaksi projektin tallennetut ryhmittely-, tyyli-, sijainti- ja
turva-aluevalinnat. Pelkkä tekstin tai äänen vaihtaminen ei nollaa niitä.
Esitystavan muuttaminen ei mitätöi avointa hintakorttia: hinta ja hyväksyntä koskevat vain uutta
puhetekstiä tai puheääntä. Palvelin jättää äänikerroksen, sen paikalliset äänitiedostot ja
esitystavan pois maksullisen pyynnön lähdesidonnasta, mutta sitoo edelleen mainoksen muut
lähdetiedostot. Jos esitystapaa muutetaan hintakortin jälkeen, uusi puhe julkaistaan uusimmilla
tallennetuilla esitysvalinnoilla. Kun olemassa oleva puhe päivitetään, käyttöliittymä näyttää,
ettei ääntä luotu uudelleen.

## Projektin tiedostot

- `assets/voice/ari-<sidonta>.mp3` — paikallinen puheraita
- `assets/voice/ari-<sidonta>.alignment.json` — hyväksytty teksti ja sanakohtaiset ajat
- `compositions/ari-voice-layer.html` — läpinäkyvä, seekattava teksti- ja äänikooste
- `.ari-notebook/voice/state.json` — valinnat, SHA-256-tiivisteet ja palvelun kuitti

Pääkoosteeseen lisätään yksi `ari-voice-layer-host`. Maksuton esitystavan päivitys säilyttää
ääni- ja ajoitustiedoston tavut ja tarkistussummat, tallentaa kaikki valinnat projektin tilaan ja
päivittää samaa alikoostetta. Se ei kerää päällekkäisiä ääni- tai tekstiraitoja.

Palvelin ottaa kaikkien julkaistavien tiedostojen versiot talteen ennen mahdollista
palveluntarjoajakutsua. Jos Studio muuttaa pääkoostetta, tekstikerrosta tai äänitilaa kutsun
aikana, palveluntarjoajan vastaus ei ylikirjoita muutosta. Uudelleen lähetetty hyväksyntä
palauttaa aiemman tuloksen vain, kun nykyiset julkaistut tiedostot vastaavat tuloksen omaa
versioluetteloa ja äänen sekä ajoituksen tarkistussummia.

## Turvallisuus ja live-ajo

Oletus on `ARI_VOICE_EXECUTION_MODE=fixture`. Avain yksin ei avaa verkkopyyntöä. Live-ajo vaatii
samassa prosessissa kaikki seuraavat:

```sh
ARI_VOICE_EXECUTION_MODE=live
ELEVENLABS_VOICE_LIVE_APPROVED=1
ELEVENLABS_API_KEY=...
ARI_VOICE_COST_DIR=/absoluuttinen/eristetty/kulukansio
ARI_VOICE_BUDGET_USD=0.30
ARI_ELEVENLABS_VOICES_JSON='[{"id":"palvelun-aanitunniste","label":"Jukka"}]'
```

Äänivalikoima luetaan vain palvelimella. Selain saa jokaisesta sallitusta äänestä tunnisteen ja
suomenkielisen nimen valintaa varten, mutta asiakas ei syötä tunnistetta itse. Palvelin tarkistaa
valinnan uudelleen hintakorttia tehtäessä eikä hyväksy valikoiman ulkopuolista tunnistetta.
Jos JSON puuttuu tai siinä ei ole hyväksyttäviä rivejä, Studio näyttää toimintaohjeen ja estää
hintakortin luomisen. Yhdessä listassa voi olla vain eri tunnisteita; tunnisteessa sallitaan 5–80
kirjainta, numeroa, alaviivaa tai yhdysmerkkiä ja näkyvä nimi rajataan 80 merkkiin.

Tekstikerros käyttää lyriikkatyylissä tavallisesti 68 px:n ja tekstityksessä 56 px:n kokoa.
Pitkä suomalainen yhdyssana pienentää koon deterministisesti 56 tai 48 pikseliin, ja yksittäinen
erityisen pitkä merkkijono saa viimeisenä suojana rivittyä. Tämä ei muuta sanakohtaisia aikoja.

Palvelin käyttää vain `eleven_multilingual_v2`-mallia, yhtä
`/with-timestamps`-kutsua ja alkuperäisen tekstin `alignment`-kenttää. Puuttuva tai tekstiä
vastaamaton ajoitus, puuttuva `character-cost`-kuitti, vanhentunut tarjous tai yli 0,30 USD:n
hinta estää projektitiedostojen julkaisun. Asiakkaan avainta ei lähetetä selaimeen eikä tallenneta
projektiin. Fixture tuottaa deterministisen hiljaisen WAV-tiedoston ja painotetut testiajat; sitä
ei merkitä aidoksi puheeksi eikä palveluntarjoajan mittaukseksi.

Kun laskutettu vastaus on saatu ja sen merkkikulu tunnetaan, toteutunut kulu kirjataan heti ja
vain kerran. Myöhempi tiedostoristiriita tai julkaisuvirhe voi estää projektitiedostot, mutta ei
kadota jo syntynyttä palveluntarjoajan kulua.

Yksi rajattu live-todennus voidaan ajaa komennolla `bun run validate:ari-voice-live`; komento
vaatii lisäksi tekstin tiedoston, sen hyväksytyn SHA-256-tiivisteen, äänen tunnisteen, kaikki
esitystavan valinnat sekä enintään 0,30 USD:n kulurajan.

## Commit gate repairs — 2026-09-11

Voice parsing, replay checks, provider settlement and publication now have separate helpers;
feedback generation and the standalone feedback validator share the same reservation function.
The Finnish controls and paid/free workflow are unchanged. Comparison against the staged
pre-refactor implementation produced byte-identical timed-text HTML and identical cue windows
for 162 combinations of grouping, preset, position, alignment and word count.

The review-package evidence script no longer passes the removed `renderBodyScripts` render
configuration property. Its `ari-retimed` fixture contains authored source and no Studio edit
sidecars, so no injection is needed.

Previously failing Studio tests used stale fixtures: the capture URL omitted `evidence=1`,
the history stand-in implemented the obsolete load/save interface, and preview elements lacked
the stable IDs already present on their timeline rows. These fixtures now exercise the current
contracts; the selection-shell test isolates its unrelated agent-tools child.

Verification: server 718/718 tests; Studio 5,156 passing, 18 existing todo tests and one skipped
file; both package builds and typechecks; script typecheck; lint, formatting and the existing
Fallow new-issue gate. No live provider calls or additional vendor spend.
