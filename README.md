# Meta Catalog Image Renderer

Lokálny renderer produktových obrázkov a supplementary feedu pre Meta katalóg.

## Lokálne UI

```sh
npm run ui
```

Potom otvor `http://127.0.0.1:4173`. Server počúva výhradne na lokálnej adrese
`127.0.0.1`. Je to vývojový nástroj bez autentifikácie a nesmie sa cez proxy,
port forwarding ani zmenu bind adresy vystaviť do internetu.

UI používa rovnaké klientské konfigurácie a pipeline moduly ako príkazový riadok.
Feed drží v pamäti najviac 10 minút; tlačidlo „Obnoviť feed“ vynúti nové stiahnutie.

Uloženie šablóny atómovo zapíše sekcie `template` a `brand` a zvýši
`templateVersion`. Tlačidlo „Renderovať a publikovať“ spustí background beh cez
R2, preto lokálne UI potrebuje platné R2 premenné v `.env`. Beh pokračuje aj po
zatvorení karty, kým zostane spustený Node server.

Záložka Produkty načítava verejné R2 obrázky po 60 položkách. Podporuje
vyhľadávanie podľa SKU alebo názvu a filtre pre zľavy, dnešné zmeny a chyby.

## Automatické publikovanie cez GitHub Actions

Workflow `.github/workflows/publish-catalogs.yml` sa spúšťa raz denne o 03:17
v časovom pásme Europe/Bratislava. Všetkých klientov z `clients/`
spracuje postupne v jednom jobe. Nezmenené SKU sa podľa R2 stavu preskočia.

V súkromnom GitHub repozitári pridaj cez **Settings → Secrets and variables →
Actions** tieto repository secrets:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Ak bucket používa EU jurisdiction, pridaj repository variable
`R2_JURISDICTION` s hodnotou `eu`. Inak ju netreba vytvárať.

Prvý test spusti cez **Actions → Publish Meta catalogs → Run workflow**. Pole
client nechaj prázdne, aby sa spracovali všetci klienti, a `force` nechaj vypnuté.
Výsledné počty sa zobrazia v job summary.
