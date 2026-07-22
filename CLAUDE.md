# Renderer produktových obrázkov pre Meta katalóg

Dávková pipeline: feed klienta → obrázky s cenou a badgeom → supplementary feed
pre Meta. Pilot na 1–2 klientoch. Iba Meta, nikdy nie Google Shopping.

## Neporušiteľné pravidlá

**Konfigurácia, nie kód.** Nový klient = nový JSON v `clients/`. V `src/` nikdy
nesmie vzniknúť vetvenie na konkrétneho klienta. Ak šablóna potrebuje niečo nové,
pridá sa parameter do configu — nie `if (client === 'vintino')`.

**Content hash rozhoduje o renderi.** Hash musí zahŕňať všetko, čo ovplyvňuje
výsledný obrázok: dáta produktu, celú sekciu `template`, celú sekciu `brand`,
rozmery výstupu a `templateVersion`. Keď sa zmení šablóna, zdvihne sa
`templateVersion` a prerenderuje sa celý katalóg.

**Cache busting cez názov súboru.** Formát `{id}-{hash}.jpg`. Súbory sa nikdy
neprepisujú, vždy vzniká nový. Bez toho drží Meta starý obrázok aj týždne po zmene
ceny. Nahrávaj s `Cache-Control: public, max-age=31536000, immutable`.

**Primárneho feedu klienta sa nedotýkame.** Supplementary feed obsahuje výhradne
stĺpce `id` a `image_link`, nič iné.

**Beh musí byť idempotentný.** Opakované spustenie nesmie nič pokaziť ani
duplikovať.

**Chyba jedného SKU nezhodí beh.** Chyby sa zbierajú a reportujú na konci so
zoznamom ID a dôvodom. Neúspešné SKU sa nezapíšu do stavu, takže sa skúsia znova
pri ďalšom behu.

**Žiadne tajomstvá v repe.** R2 kľúče cez GitHub Secrets a `.env`. Súbor `.env`
patrí do `.gitignore`.

## Technické pasce

**Satori** nevie čítať systémové fonty — potrebuje buffery. Font musí obsahovať
Latin Extended-A, inak zmiznú ľ, š, č, ť, ž. Každý element s viacerými potomkami
musí mať `display: flex`. Podporovaná je len podmnožina CSS — žiadny grid, žiadny
`line-clamp`. Text skracuj v JavaScripte, nie cez CSS.

**Zdrojové fotky zmenši cez sharp** (max 1200 px, `fit: inside`) predtým, než ich
vložíš do Satori ako data URI. Bez toho pri veľkých fotkách vyletí pamäť a render
sa niekoľkonásobne spomalí.

**Formátovanie cien:** locale `sk-SK`, symbol € je za číslom s medzerou a
desatinná čiarka, teda `239,00 €`. Nikdy nie `€239.00`.

**GitHub Actions:** jeden workflow pre všetkých klientov v cykle, nie workflow na
klienta — inak sa nezmestíme do 2 000 free minút. Cache `node_modules`. Naplánované
workflow GitHub automaticky vypne po 60 dňoch bez aktivity v repe.

**Cloudflare R2** je S3-kompatibilné, ale endpoint a autentifikácia sa líšia od AWS.
Ak si nie si istý API, stiahni si dokumentáciu — nehádaj.

## Štýl kódu

Plain ESM JavaScript, žiadny TypeScript, žiadny build step. Minimum závislostí —
worker pool a CSV writer si napíš sám, nesťahuj na to balíček. Komentáre píš iba
tam, kde vysvetľujú *prečo*, nie *čo*. Kód v angličtine, komentáre po slovensky.

Testy len na dve veci, ktoré sa ticho pokazia: parsovanie cien z rôznych formátov
a stabilitu content hashu.

## Príkazy

```text
npm run validate <klient>              overí konfiguráciu
npm run inspect <klient>               vypíše prvých 10 produktov z feedu
npm run preview <klient> <sku>         vyrenderuje jeden obrázok do ./preview.jpg
npm run render <klient> [--limit=N] [--force]
```

## Vrstva UI

Lokálny vývojový server (`npm run ui`, `node:http`, výhradne 127.0.0.1). Tenká
vrstva nad pipeline — nikdy neduplikuje jej logiku, vždy importuje existujúce
moduly.

Bez frameworku a bez build stepu: jeden HTML súbor, inline CSS, vanilla JS.

Náhľad renderuje skutočným `renderProduct()`. Ak sa niekedy objaví aproximácia
kreatívy v prehliadači, je to chyba — rozdiel medzi náhľadom a výstupom musí byť
nulový.

Uloženie šablóny vždy zdvihne `templateVersion`. UI musí pred uložením ukázať,
koľko SKU sa tým prerenderuje.

Endpointy sa raz budú preklápať na serverless routy — logiku drž v handleroch
oddelene od routovania.
