# Ari A1–A2: paikalliset kuvat

Synteettinen aineisto, ei asiakkaan kuvia. Luodaan uudelleen repossa olevalla [mittausskriptillä](../../../../../studio-server/scripts/measure-ari-images.ts):

```sh
npx --yes bun run ari:measure:images
```

- `one.png`: 1000 × 1000; `four.png`: 2000 × 2000; `sixteen.png`: 4000 × 4000.
- `oversize.png`: 4100 × 4100, tarkoituksella yli 16 MP:n rajan.
- `product.jpeg` ja `product.webp`: 1000 × 1000, sama synteettinen vihreä pinta.
- `invalid.png`: tekstitiedosto, jonka pääte on tarkoituksella väärä.
- `truncated.png`: katkaistu PNG, jonka tunnistetavut säilyvät.

Skripti mittaa viisi täydellistä dekoodausta kustakin PNG-koosta, sekä deterministiset kohinapinnat lähellä tavurajaa ja sen yli. Suuria kohinakuvia ei tallenneta repositorioon; niiden generaattori ja siemen ovat skriptissä. Tulokset tallentuvat `screenshots/2026-09-09-a1-a2/image-measurements.json`-tiedostoon. Mittaus ei ole ihmistesti eikä yleinen valokuvien suorituskykytakuu.

Selaintesti kopioi valitut alkuperäiset väliaikaiseen kansioon, tuo ne näkyvällä käyttöliittymällä tai löydetyillä agenttityökaluilla ja poistaa vain nämä väliaikaiset alkuperäiset. Repossa olevia fixturejä tai luotuja mainoslähteitä ei käsikorjata.
