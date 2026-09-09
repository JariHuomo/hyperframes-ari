# Ari Studio — oma liike-editori, 9.9.2026

Toteutettu paikalliseen forkkiin omistajan täsmennyksellä: **agentti on työkalun ainoa käyttäjä ja vaihtaa klikkailun, skriptien ja kuvan katsomisen välillä.** Perusmuokkaus ja todennettu vienti ovat käytössä. Tämä ei ole koko After Effects eikä automaattinen briefistä mainokseksi -järjestelmä.

Avaa [valmis RajaMarket-työ](http://127.0.0.1:3080/#project/rajamarket-sprint-mixed). Paikallinen palvelin käynnistettiin taustalle. Tarvittaessa:

```sh
bun run ari:studio --project "$PWD/examples/rajamarket-sprint-mixed" --port 3080 --background
```

## Oma käytännöllinen työtapa

1. Katso kuvaa. Valitse tasolistasta tai kuvasta oikea kohde. Skripti voi hakea lähdetiedoston sisältävän tarkan kahvan `studio_look`-kutsulla ja valita sen `studio_select`-kutsulla.
2. Tee tavallinen tekstin, tekstikoon, värin tai sijoittelun muutos oikeasta paneelista. Tarkat tai toistuvat muutokset kulkevat samojen 12 työkalun kautta `window.ariStudio.call`-kutsuina.
3. Lisää liike erillisestä **Lisää uusi liike** -kohdasta. Häivytys, liuku alhaalta ja kasvu tallentavat kerralla myös alun, keston ja tuntuman. Muokkaa olemassa olevaa liikettä sen omasta lomakkeesta tai raahaa aikajanan palkkia/reunaa.
4. Odota kuitti. Liikkeen `verified` tarkoittaa uudelleen luetusta lähteestä tarkistettuja asetuksia. Se ei todista kuvan laatua. Ajoituksen muuttaminen voi vaihtaa parserin liike-id:n: käytä palautettua uutta id:tä tai lue kohde uudelleen.
5. Paina **Toista liike**; toisto pysähtyy liikkeen loppuun. Tarkista lisäksi **Tarkista ruutukuva**. Muutoksen jälkeen vanha todiste merkitään vanhentuneeksi; sen URL ei palauta uuden version kuvaa vanhana todisteena.
6. Paina **Vie video · MP4**, odota valmistuminen ja lataa tiedosto. Katso lopullinen video ja sen muuttuneet rajakohdat. Korjaa löydetty virhe samoilla säätimillä ja vie uudelleen.

Esimerkki, kun `handle` on valittu kuvan ja `studio_look`-tuloksen perusteella:

```js
const receipt = await window.ariStudio.call("studio_add_animation", {
  handle,
  method: "from",
  preset: "slide",
  position: 2.6,
  duration: 0.45,
  ease: "power2.out",
});
if (!receipt.ok || receipt.stage !== "verified") throw new Error(JSON.stringify(receipt));
const frame = await window.ariStudio.call("studio_frame", { time: 2.9 });
// Avaa frame.url ja arvioi kuva. Älä tee rinnakkaisia muokkauskutsuja.
```

## Mitä muuttui

- Tasot vasemmalla, kuva keskellä, ominaisuudet oikealla ja kevyt aikajana jatkuvasti alhaalla. Sama lähteen huomioiva valinta kulkee kaikkien välillä. 1440×900-testissä kuvan alue oli 888×623 px, myös aikajanan ja ominaisuuksien ollessa näkyvissä.
- Liikkeen alku ja kesto säätyvät numeroin tai palkista raahaamalla. Yksi raahaus on yksi peruttava muutos. Desimaalipilkku toimii aika- ja ominaisuuskentissä. Ruutuaskel ja tämän viennin kuvataajuus ovat 30 fps.
- Liikekuitti lukee lähteen uudelleen ja varmistaa kohteen, pyydetyt ajoitukset ja annetut liikeasetukset. Tallennusvirhe ei muutu onnistuneeksi kuitiksi. Lisäys ei käynnistä toista odottamatonta sijoittelun nollauskirjoitusta.
- MP4-vienti odottaa keskeneräisiä DOM-tallennuksia ja renderöi erillisestä paikallisesta lähde- ja aineistokopiosta. Kopion tiedostojen SHA-256:t ja yhteinen tunniste tallentuvat vientimetatietoihin. Sisäiset symlinkit hylätään; projektin rekisteröintilinkki sallitaan. Tämä ei jäädytä ulkoisten URL-osoitteiden sisältöä.
- Vientihistoria eriytettiin projekteittain. Uusimman viennin lataus toimii myös sivun uudelleenlatauksen jälkeen. Renderin väliaikainen HTML ei enää käynnistä editorin uudelleenlatausta.
- Aiempi täydellinen editori ja koodityökalut ovat yhä avattavissa. Teknisiä kohdetunnuksia ja upstreamin englanninkielisiä työkaluja säilytettiin tarkoituksella agentin käyttöä varten.

## Todellinen UAT

Aineisto: edellisen sprintin jäädytetty RajaMarket-prototyyppi. Alkuperäistä `examples/rajamarket-uat`-projektia ei muutettu. Oma näkyvä klikkailukoe tehtiin kopiossa `rajamarket-sprint-uat`; toistettava skripti + UI -ajo kopiossa `rajamarket-sprint-mixed`.

Näkyvässä kokeessa muutin otsikkoa ja kokoa, lisäsin liu'un aikaan 2,60 s, siirsin palkkia noin 2,905 sekuntiin ja pidensin sitä reunasta 0,638 sekuntiin. Peru palautti vain keston 0,45 sekuntiin, uudelleen tekeminen palautti pidennyksen ja sivun lataus säilytti sen. Lopuksi siirsin liikkeen mainoksen alkuun. Erillinen lopputarkistus varmisti **Toista liike** -painikkeen pysähtyvän aikaan 0,67 s.

Toistettava hyväksymisajo varmisti:

- skriptillä tehty teksti → näkyvä tekstikoon muutos → näkyvä tuotekuvan siirto;
- yksi liikelisäys → näkyvä ajoituksen muutos → uusi liike-id ja lähdeversio;
- Peru / Tee uudelleen / sivun lataus säilyttävät oikean sisällön ja ajoituksen;
- vanhentunut ruutukuva merkitään vanhentuneeksi ja sen pyyntö palauttaa 409;
- tarkoituksella aiheutettu kirjoituksen 503-virhe palauttaa epäonnistumisen eikä lisää toista liikettä;
- työtilat 1440×900 ja 1280×800 sekä vieritettävät ominaisuudet;
- oikea MP4-lataus selaimen valmistuneella lataustapahtumalla ja FFproben tarkistamalla tiedostolla;
- sivun lataus viennin jälkeen tarjoaa edelleen uusimman MP4:n; selaimen JavaScript-virheitä 0.

Kokeet paljastivat ja korjasivat parserin vaihtuvan liike-id:n, väärän fonttikoon CSS-avaimen, perumisten yhdistymisen, vienti-HTML:n laukaiseman sivun latauksen ja vientihistorian väärän järjestyksen. Kuvan katsominen löysi lisäksi liian suuren kaksirivisen otsikon: muutin sen 90 → 76 px näkyvällä säätimellä. Lopullinen otsikko on “Kuusi herkkua mukaan.”, sisääntulo 0,12–0,67 s.

Testi toistetaan komennolla `bun run ari:test:motion`. Se luo testikopion uudelleen alkuperäisestä ja korvaa aiemmat **testikopion** muokkaukset; älä tee säilytettävää työtä siinä hakemistossa. Kuvallinen manuaalikoe täydentää testiä, ei korvaudu sen DOM-väitteillä. Painalluksia tai aktiivista muokkausaikaa ei kirjattu luotettavasti, joten viiden minuutin tavoitetta ei väitetä mitatuksi.

## Tulos ja todisteet

- [Valmis työtilan kuvakaappaus](screenshots/2026-09-09-easy-motion/03-final-studio.png)
- [Ladattu MP4](screenshots/2026-09-09-easy-motion/downloads/rajamarket-sprint-mixed_2026-09-09_14-22-10.mp4): H.264, 1080×1920, 30 fps, 210 ruutua, 7 s, äänetön. Vienti ja lataus noin 7,25 s tässä ajossa.
- MP4 SHA-256: `35f07a36d07368f0a70a9f8651ade9879aa4374ba3b82078959c6b4f95387d65`.
- [Koneellinen UAT-raportti](screenshots/2026-09-09-easy-motion/report.json), [viennin jäädytetyt syötteet](screenshots/2026-09-09-easy-motion/final-render-meta.json), [kuva-arvio](screenshots/2026-09-09-easy-motion/visual-review.md).
- Mallipalvelukuluja **0 USD**, asiakaskrediittejä **0**. Mainos pysyy **PROTOTYYPPI**-materiaalina aiemmasta 9.9.2026 päättyvästä tarjouksesta. Aineiston alkuperä ja lisenssit: `examples/rajamarket-uat/README.md` sekä molempien projektien `assets/provenance.json` ja `assets/sha256.json`.

Kohdennetut studio-, liike-, WebMCP- ja vientijonotestit: **217 läpi**. Vientikopion testit: **2 läpi**. Palvelimen ruutukuvatestit: **21 läpi**, palvelimen tyyppitarkistus läpi. Lopullisen koosteen CLI-tarkistus läpi, myös 48/48 tekstikontrastinäytettä; kuusi samaa tuotepakkausta tuottaa yhden tarkoituksellisen saman kuvalähteen varoituksen. Studion tyyppitarkistus, build ja muutettujen kooditiedostojen oxlint/oxfmt läpi. Myös aiempi kahden saman tunnuksen sisältävän kohtauksen selainregressio meni läpi. Vitest palautti koodin 0 mutta ilmoitti prosessin sulkemisviiveestä testien jälkeen; tätä ei kirjata testivirheeksi eikä piiloteta.

## Jäljellä alkuperäisestä laajemmasta suunnitelmasta

Sisäkkäisen kohtauksen aika ei muunnu automaattisesti pääajasta: **Avaa kohtaus** kertoo turvallisen toimintatavan ja jaetun lähteen vaikutuksen. Tarkka käyräeditori, kaikkien ominaisuuksien alku/loppuarvot ja mittakaava ovat edelleen täydellisen editorin / skriptin puolella. Kevyen paneelin x/y-kentät ovat asetettavia siirtoarvoja, eivät täydellinen GSAP-transformin tulkinta; muuttumaton vanhan geometriatoiminnon kirjoitus voidaan varovaisesti hylätä.

200 % käyttöliittymäzoomia, kaikkia projektin kuvataajuuksia, rinnakkaisen ulkoisen muokkaajan koko kilpailutilannematriisia tai kaikkia GSAP-avainruutumuunnoksia ei sertifioitu. Esikatselun omaa revisiokuittausta ei vielä näytetä: varsinainen todiste on tallennetusta lähteestä tehty ruutu ja lopullinen vienti. Autonomisen agentin pysyvä tehtävämuisti, mallien kutsuminen ja mainoksen laadun automaattinen hyväksyntä kuuluvat seuraavaan työhön.
