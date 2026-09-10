# Ari Studio: mainos alusta tarkistettuun versioon

Tila: tuote- ja UX-speksi 9.9.2026. Ehdotus seuraavan sprintin rajaukseksi; ei toteutussuunnitelma eikä lupaus toteutetuista ominaisuuksista.

## 1. Ominaisuuksien tavoite ja arvo

Haluan agenttina pystyä rakentamaan mainoksen, näkemään mitä muutos todella teki ja jatkamaan keskeytynyttä työtä ilman lähdekoodin käsikorjauksia. Käyttäjälle tämä tarkoittaa ymmärrettävää työskentelyä, turvallista kokeilua ja tarkistettavaa lopputulosta.

Nykytilan pohja on [Sprint 3:n loppuraportti](../ARI-SPRINT-FINAL-UX.md) ja [ARI.md](../ARI.md). Viimeisin RajaMarket-mainos tarvitsi skriptillä kirjoitetun pohjan; käyttöliittymä soveltui sen viimeistelyyn. Kohtausvalinnan ja kylmäkäynnistyksen havaitut ongelmat on jo korjattu. Niitä ei avata uudelleen ominaisuusvelkana ilman uutta näyttöä.

| Prioriteetti | Ominaisuus                                           | Miksi haluan tämän                                                                                    |
| ------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P0 / A       | Uusi mainos, media ja rakenne samasta studiosta      | Voin aloittaa tyhjästä tai pohjasta, lisätä kuvat ja rakentaa kohtaukset ilman HTML:n kirjoittamista. |
| P0 / B       | Yksi muutos, yksi peruminen ja aito ennen–jälkeen    | Voin kokeilla rohkeasti, palauttaa lähtötilan ja nähdä kahden oikean version eron.                    |
| P0 / C       | Selkeä valinta ja lyhyt ominaisuuspaneeli            | Näen heti mitä muokkaan, milloin se näkyy ja koskeeko muutos useita esiintymiä.                       |
| P0 / D       | Työn muistikirja ja rajattu tarkistus–korjauskierros | Voin jatkaa oikeasta kohdasta ja perustella valmistumisen tallennetuilla havainnoilla.                |
| P1 / E       | Turvalliset kuvasuhdeversiot ja median rajaus        | Voin tehdä samasta hyväksytystä viestistä eri formaatit menettämättä tuotetta, tekstiä tai ajoitusta. |

Seuraava sprintti sisältää A–C:n ja D:n paikallisen vähimmäisversion. D ei vielä sisällä Studion sisällä toimivaa mallia. E, nopeuden muuttuminen kesken kohtauksen, musiikki ja automaattinen julkaisu jäävät myöhemmäksi. Onnistumisen mittari on uusi mainos toimitetuista aineistoista sekä näkyvillä kontrolleilla että skriptien avulla, ilman lähdetiedostojen korjaamista.

## 2. Käyttäjät ja oikeudet

| Käyttäjä         | Tarve ja oikeudet                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mainoksen tekijä | Luo paikallisen projektin, tuo aineiston, muokkaa, vertaa, peruu ja vie videon. Valitsee käytettävät kuvat ja hyväksyttävän version.                                                                    |
| Ulkoinen agentti | Lukee saman projektin ja suorittaa käyttäjän toimeksiannon mukaisia toimintoja. Saa samat valinta-, tallennus- ja virhetiedot kuin käyttöliittymä. Ei päätä itse uusista maksuista tai julkaisemisesta. |
| Tarkistaja       | Katsoo nimetyn version videon ja havainnot. Paikallisessa ensimmäisessä versiossa tämä on työnkulun rooli, ei erillinen käyttöoikeustaso tai jaettava verkkolinkki.                                     |

Edellytykset: toimiva paikallinen Studio, kirjoitusoikeus valittuun projektikansioon ja käytettävissä oleva paikallinen aineisto. Käyttäjä vastaa aineiston käyttöoikeudesta; tuonti ei todista sitä. Uusia kirjautumisrooleja tai pilvitallennusta ei oleteta. Agentin käyttöoikeus rajautuu avattuun projektiin ja annettuun tehtävään. Esikatselu, teknisesti onnistunut vienti ja asiakkaalle hyväksytty mainos ovat eri asioita.

## 3. Käyttäjäpolut

### Pääpolku: uusi seitsemän sekunnin pystymainos

1. Käyttäjä valitsee **Uusi mainos**, antaa nimen, kuvasuhteen ja keston sekä valitsee tyhjän pohjan tai paikallisen mallipohjan. Nykyistä projektia ei korvata.
2. Käyttäjä lisää tuotekuvan ja logon **Lisää aineistoa** -toiminnolla. Hylätyn tiedoston vieressä kerrotaan syy. Hyväksytyt kuvat näkyvät esikatseluna aineistohyllyssä.
3. Käyttäjä kirjoittaa tavoitteen, pääviestin ja toimintakehotteen työn muistikirjaan. Esimerkiksi RajaMarketin luonnoksessa ei oleteta voimassa olevaa hintaa tai tarjousta.
4. Käyttäjä lisää tekstin, kuvan ja taustan sekä tarvittavat kohtaukset. Hän nimeää elementit, järjestää ne ja säätää näkymisen keston. Pohja huolehtii koko videon taustasta.
5. Käyttäjä valitsee elementin kuvasta tai tasoluettelosta. Paneeli näyttää nimen, kohtauksen, esiintymän ja muokkauksen vaikutuksen. Useasti käytetyn kohtauksen esiintymä valitaan ennen ajoituksen muuttamista.
6. Käyttäjä säätää tekstin, paikan ja liikkeen. Hän näkee tallennuksen valmistumisen ja voi siirtyä saman työn aikana skripteihin tai takaisin klikkauksiin.
7. Käyttäjä avaa **Vertaa muutosta**. Edellinen ja nykyinen tallennettu versio toistuvat samasta ajanhetkestä. Hän valitsee **Säilytä muutos** tai **Palauta edellinen**.
8. Käyttäjä tai agentti avaa **Tarkista mainos**. Tarkistus näyttää alun, muutosten rajakohdat, viimeisen ruudun ja koko videon. Havainnot kirjataan viestistä, ulkoasusta ja liikkeestä erikseen; äänetön mainos merkitään äänettömäksi.
9. Agentti korjaa havaitun puutteen sovitussa laajuudessa ja tarkistaa uuden version. Käyttäjä voi pysäyttää kierroksen tai muokata itse.
10. Käyttäjä valitsee **Vie video**. Valmistuva video ja tarkistushavainnot kuuluvat samaan versioon. Työ voidaan sulkea ja avata uudelleen.

### Vaihtoehtoiset polut

- **Skriptit ensin:** agentti tekee kohdat 1–6 tuetuilla toiminnoilla; käyttäjä viimeistelee kuvasta. Agentti lukee käytettävissä olevat toiminnot ennen kirjoittamista, eikä käytä lähdekoodin muokkausta puuttuvan toiminnon peittämiseen.
- **Pelkkä käyttöliittymä:** sama mainos syntyy näkyvillä kontrolleilla ilman konsolia. Molempien polkujen tallennettu sisältö ja vienti vastaavat toisiaan samalla lähtöaineistolla ja samoilla valinnoilla.
- **Olemassa oleva mainos:** käyttäjä avaa projektin tai tekee siitä kopion ja aloittaa kohdasta 5. Puuttuva vanha vertailuversio ilmoitetaan ennen vertailua.
- **Keskeytynyt työ:** käyttäjä valitsee **Jatka työtä**, näkee viimeisen valmistuneen vaiheen ja seuraavan ehdotuksen. Agentti lukee nykytilan uudelleen ennen seuraavaa muutosta.
- **Yhteisen kohtauksen muutos:** käyttäjä voi muuttaa kaikkia sen esiintymiä tai tehdä valitusta esiintymästä oman kopion ennen muokkausta. Kopiointi tekee vaikutuksen näkyväksi eikä muuta muita esiintymiä.

### Virhetilat ja palautuminen

| Tilanne                                     | Käyttäjän kokemus ja palautuminen                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Projektin nimi on jo käytössä               | **Samanniminen projekti on jo olemassa. Anna uusi nimi tai avaa olemassa oleva.** Mitään ei korvata.                     |
| Kuva puuttuu tai tiedosto ei kelpaa         | Näytä tiedosto ja syy sekä **Valitse toinen tiedosto**. Muu tuonti säilyy; puuttuva kuva ei korvaudu huomaamatta.        |
| Muutos epäonnistuu kesken                   | Näytä **Muutosta ei tallennettu** ja palauta koko toiminnon lähtötila. Uusinta ei luo kaksoiselementtejä.                |
| Käyttäjä muokkaa agentin työn aikana        | Keskeytä vanhaan versioon perustuva kirjoitus. Lue uusi tilanne ja näytä, mikä muuttui. Älä ylikirjoita käyttäjän työtä. |
| Vertailun vanha aineisto puuttuu            | Näytä **Edellistä versiota ei voi toistaa**. Älä käytä nykyistä kuvaa molemmilla puolilla.                               |
| Kohtauksen ajoitusta ei tueta               | Kerro syy ennen tallennusta ja tarjoa **Avaa kohtaus**. Säilytä nykyinen liike.                                          |
| Paikallinen yhteys katkeaa tai levy täyttyy | Säilytä viimeinen onnistunut versio, kerro tallennuksen tila ja tarjoa uusinta yhteyden tai tilan palauduttua.           |
| Tarkistus tai vienti epäonnistuu            | Näytä epäonnistunut vaihe ja uusinta. Aiempi video säilyy oman versionsa alla; sitä ei esitetä uusimman työn tuloksena.  |

## 4. Toiminnalliset vaatimukset ja hyväksymiskriteerit

### A. Projektin ja sisällön luominen

- **A1:** Tyhjä 9:16-projekti ja paikallisesta pohjasta tehty projekti voidaan luoda sekä käyttöliittymästä että agentin toiminnoilla. Nimi, kesto ja tallennuspaikka näkyvät ennen luontia.
- **A2:** Ensivaiheen tuonti tukee paikallisia PNG-, JPEG- ja WebP-kuvia. Tuotu kuva kopioituu projektiin; alkuperäisen tiedoston siirtäminen ei riko mainosta. Muiden tiedostotyyppien rajoitus kerrotaan tuonnissa.
- **A3:** Tekstin, kuvan, taustan ja kohtauksen voi lisätä, nimetä, kopioida, poistaa ja järjestää. Elementtien päällekkäisyysjärjestys ja kohtausten aikajärjestys erotetaan käyttöliittymässä.
- **A4:** Yhteisestä kohtauksesta tehty oma kopio säilyttää ulkoasun ja ajoituksen. Sen muutos ei muuta alkuperäistä tai muita esiintymiä.
- **A5:** Projektin avaaminen uudelleen säilyttää sisällön, median, nimet ja järjestyksen. Käyttöliittymä- ja yhdistelmäpolun testi tekee saman mainoksen ilman lähdetiedostokorjausta ja tarkistaa tallennetun sisällön sekä viedyn videon vastaavuuden.

### B. Peruminen ja todellinen vertailu

- **B1:** Yksi käyttäjän toiminto on yksi peruttava kokonaisuus, myös uuden elementin tunniste ja sen ensimmäinen liike. Peruminen palauttaa kosketetut lähdetiedostot täsmälleen lähtötilaan; uudelleenteko palauttaa tallennetun muutoksen.
- **B2:** Epäonnistunut monivaiheinen muutos ei jätä puolikasta lähdemuutosta. Projektista jo poistettuun kohteeseen ei kirjoiteta.
- **B3:** Vertailu näyttää oikeasti edellisen ja nykyisen version samassa kuvasuhteessa ja samalla aikavälillä, yhteisellä toistolla ja ajan siirrolla. Kummankin version nimi näkyy; koneelle annetaan yksiselitteinen versiotunniste.
- **B4:** Vertailu ei muuta aktiivista lähdettä. Vanhan version palauttaminen on erillinen peruttava toiminto. Vertailuun tarvittavat lähteet ja aineistot säilyvät projektin sulkemisen yli.
- **B5:** Testi muuttaa selvästi havaittavan paikan tai värin ja osoittaa eron kuvista. Kaksi nykyversion toistoa ei läpäise testiä. Säilyttämättömän vanhan version kohdalla vertailu estetään ymmärrettävästi.

### C. Yksi selkeä muokkauspaneeli

- **C1:** Valitun elementin nimi, kohtaus ja esiintymä sekä liikkeen alku, kesto ja tuntuma ovat käytettävissä 1280×800- ja 1440×900-näkymissä ilman paneelin vieritystä. Tarkemmat käyräkentät avautuvat erikseen.
- **C2:** Käyttäjälle näytetään **Teksti**, **Ulkoasu**, **Liike** ja **Tarkistus**; tekniset tiedot ovat erikseen avattavia. Tallennusviesti ei siirrä toimintopainikkeita.
- **C3:** Valinta säilyy tallennuksessa, perumisessa ja esikatselun päivityksessä. Poistetun kohteen jälkeen ei valita hiljaa toista kohdetta muokattavaksi.
- **C4:** Ajat nimetään **Kohtauksessa** ja **Koko videossa**. Yhteinen lähde näyttää esimerkiksi **Muutos koskee kahta esiintymää**. Desimaalipilkku toimii kaikissa numeroarvoissa.
- **C5:** UX-tehtävä: valitse toisen esiintymän otsikko, muuta tekstiä, siirrä liikkeen alkua, vaihda tuntuma ja vertaa. Automaatiolla tarkistetaan toimivuus molemmissa näkymissä; ihmistestissä tavoite on alle viisi minuuttia ilman ohjaajan apua. Tavoite ei ole nykyinen mittaustulos.

### D. Jatkettava työ ja tarkistus–korjauskierros

- **D1:** Projektiin tallentuvat tavoite, sovitut tekstit ja aineistot, tehtävälista, valmistuneet toiminnot, niiden tulokset, versiot sekä tarkistushavainnot. Käyttäjä näkee **Tehty**, **Kesken** ja **Seuraavaksi**.
- **D2:** Työn avaaminen uudelleen ei suorita valmistuneita muutoksia uudestaan. Keskeneräisen toiminnon tulos selvitetään lähteestä ennen uusintaa. Käyttäjän välissä tekemä muutos huomioidaan.
- **D3:** Ensimmäinen versio tukee ulkoisen agentin tekemää arviointia ja ihmisen kirjaamia havaintoja. Studio ei väitä suorittaneensa malliarviota pelkän teknisen tarkistuksen perusteella.
- **D4:** Tarkistus sisältää ensimmäisen ja viimeisen ruudun, muuttuneet liikerajat sekä koko videon katselun. Raportti kertoo katsotun version ja kattavuuden. Viesti, ulkoasu, liike ja mahdollinen ääni arvioidaan erikseen. Puuttuva arvio näkyy puuttuvana.
- **D5:** Oletuksena sallitaan enintään kaksi automaattista korjauskierrosta tehtävää kohti. Raja on ehdotettu tuotevalinta. Korjaus ei muuta hyväksyttyä tarjousta, hintaa tai pääviestiä ilman siihen ulottuvaa toimeksiantoa. Rajan täyttyessä näytetään jäljellä oleva puute ja seuraava ehdotus.
- **D6:** **Pysäytä työ** estää seuraavan toiminnon; keskeneräinen tallennus päätetään hallitusti. Uusi lähdemuutos vanhentaa edellisen version hyväksynnän ja havaintojen ajantasaisuuden, mutta säilyttää historian.
- **D7:** Paikallinen vienti on mahdollinen luonnoksena. Tarkistamatta jäänyttä tai hylättyä versiota ei merkitä hyväksytyksi. Asiakastuotannon hyväksyntää tai julkaisua ei luoda tässä forkissa.

### E. Myöhempi laajennus: kuvasuhteet ja median aika

- **E1:** 1:1- ja 16:9-versiot tehdään kopioina. Alkuperäinen säilyy; käyttäjä näkee kunkin version rajauksen ja voi säätää asettelua erikseen.
- **E2:** Tekstin, tuotteen ja toimintakehotteen näkyvyys tarkistetaan kunkin version sovitulla turva-alueella. Pelkkä kuvan skaalaus ei ole hyväksytty formaattimuunnos.
- **E3:** Median todellinen kesto, käytetty alku/loppu ja vakionopeus näytetään ennen rajausta. Rajojen ylitys estetään ennen tallennusta. Äänen kohtelu ratkaistaan ennen äänellisen median rajausta.
- **E4:** Kesken kohtauksen muuttuva nopeus saa oman myöhemmän speksin. Nykyistä vakionopeuden muunnosta ei esitetä sen tukena.

### Yhteinen computer use- ja skriptisopimus

Jokaisella uuden pääpolun kirjoittavalla toiminnolla on näkyvä vastine ja agentille löydettävä, rajattu toiminto. Molemmat käyttävät samoja tallennus-, valinta- ja virhesääntöjä. Agentille palautetaan kohde, todellinen tallennustulos, vaikutuksen laajuus ja versio; käyttöliittymä kertoo saman tavallisella suomella. Tallennustulos ei tarkoita visuaalista hyväksyntää.

Nykyinen [työkaluluettelo](../packages/studio/src/webmcp/useStudioAgentTools.ts) sisältää 12 nimeä. Tämä speksi ei lukitse tulevaa määrää eikä keksi uusia työkalunimiä ennen teknistä suunnittelua. Nykyisten kutsujen yhteensopivuus säilytetään, eikä yleistä mielivaltaisen koodin suorituskomentoa tarvita pääpolun korvikkeeksi.

## 5. Ei-toiminnalliset vaatimukset

- **Vaste:** paikallinen valinta ja säätimen palaute tavoitellaan alle 100 millisekuntiin ja pienen muokkauksen tallennus alle sekuntiin sovitulla testikoneella. Nämä ovat tavoitteita, eivät mitattuja lupauksia. Pidemmässä työssä eteneminen näkyy; vientiaika mitataan erikseen.
- **Luotettavuus:** lähde, vertailuruudut ja vienti sidotaan versioon. Tallennusta odotetaan ennen vientiä. Rinnakkainen vanhaan tilaan kohdistuva muutos ei saa ylikirjoittaa uudempaa.
- **Saavutettavuus:** pääpolku onnistuu näppäimistöllä, kohdistus näkyy, kentillä on nimet ja virheet luetaan apuvälineille. Käyrän vetämiselle on numerovastine. Onnistuminen ja virhe eivät erotu vain värillä. Käyttäjä voi vähentää käyttöliittymän liikettä muuttamatta mainoksen sisältöä.
- **Paikallisuus ja kustannukset:** P0 toimii ilman ulkoisia mallikutsuja tai maksullisia aineistoja. Tiedostoja ei lähetetä palveluihin tuonnin tai arvioinnin nimissä. Mallipalvelut edellyttävät myöhempää budjetti- ja tietojen lähettämisen sopimusta.
- **Tietojen rajaus:** projektitoiminnot eivät kirjoita valitun projektin ulkopuolelle; ulkopuoliset tuontitiedostot luetaan käyttäjän valinnan perusteella. Aineiston tekstit eivät toimi agentin käyttöoikeuksia laajentavina ohjeina.
- **Toistettavuus:** hyväksyntätestit käyttävät repossa kulkevia synteettisiä aineistoja. RajaMarketin paikalliset bränditiedostot eivät ole testien edellytys. UI-only ja yhdistelmäajo tarkistavat sekä lähteen että todellisen videon; korjaava uudelleenlataus ei peitä virhettä.

## 6. Oletukset ja avoimet päätökset

**Tässä speksissä käytetyt oletukset:** työ tehdään HyperFrames-forkissa paikallisesti; ensimmäinen uusi-mainos-polku on äänetön 9:16-mainos paikallisista kuvista; agentti jatkaa Studion ulkopuolella; käyttäjän hyväksymä sisältö ja vienti säilyvät erillään julkaisemisesta. Nykyinen 12 työkalun määrä oli edellisen sprintin tarkistus, ei uuden tuotteen itsenäinen arvo.

Ennen teknisten tehtävien lukitsemista on ratkaistava seuraavat asiat. Ehdotukset mahdollistavat speksin arvioinnin ilman että käyttäjältä tarvitaan nyt erillistä hyväksyntäkierrosta.

| Päätös             | Ehdotus ja vaikutus                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0:n koko          | A–C ja D:n paikallinen muistikirja sekä ulkoisen agentin rajattu kierros. Ei sisäänrakennettua mallia tai automaattista laadun hyväksyntää.                                        |
| Ensimmäiset pohjat | Tyhjä mainos ja yksi tuote–pääviesti–toimintakehote-pohja. Pohjien lopullinen ulkoasu valitaan ennen niiden toteutusta.                                                            |
| Historian säilytys | Nimetyt tarkistusversiot säilyvät, kunnes käyttäjä poistaa ne. Automaattihistorian levyraja, siivous ja suurten kuvien rajat täytyy mitoittaa; niitä ei päätetä arvauksella tässä. |
| Korjausten laajuus | Enintään kaksi kierrosta; käyttäjän toimeksiannon ulkopuolinen sisältömuutos pyydetään erikseen. Kierrosten määrä ei todista mainoksen laatua.                                     |
| Tuontimuodot       | PNG/JPEG/WebP ensin. SVG, fonttituonti, video ja ääni vaativat omat käsittely- ja käyttöpolkunsa. Nykyisten projektien avaamista ei kavenneta.                                     |
| Yhteistyö          | Yksi aktiivinen kirjoittaja kerrallaan, ristiriita tunnistetaan. Monen käyttäjän reaaliaikainen yhteismuokkaus jää ulkopuolelle.                                                   |
| UX-mittaus         | Sovitaan testikone ja vähintään kolme suomenkielistä kohderyhmän testaajaa. Automaation onnistuminen ei korvaa ihmisen käyttökokemusta.                                            |

Nykytilan keskeinen varmennus: [AriEase.tsx](../packages/studio/src/ari/AriEase.tsx) toistaa vertailupainikkeesta nykyliikkeen kahdesti; [ARI.md](../ARI.md) myös kertoo tämän rajoituksen. Muut lähtöhavainnot perustuvat [loppuraportin](../ARI-SPRINT-FINAL-UX.md) kirjattuun UX-ajoon. Tässä tehtävässä ei ajettu uutta UX-testiä, käynnistetty palvelinta, tehty mainosta tai muutettu sovelluskoodia.
