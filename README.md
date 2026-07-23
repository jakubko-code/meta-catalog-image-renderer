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

Uloženie šablóny atómovo zapíše branding, predvolenú šablónu, ďalšie šablóny
a pravidlá ich použitia a zvýši
`templateVersion`. Tlačidlo „Renderovať a publikovať“ spustí background beh cez
R2, preto lokálne UI potrebuje platné R2 premenné v `.env`. Beh pokračuje aj po
zatvorení karty, kým zostane spustený Node server.

Záložka Produkty načítava verejné R2 obrázky po 60 položkách. Podporuje
vyhľadávanie podľa SKU alebo názvu a filtre pre zľavy, dnešné zmeny a chyby.

Záložka **Filtre** umožňuje obmedziť renderovanie a supplementary feed na vybrané
kategórie. Pole kategórie sa vyberá z reálnych polí feedu. Výber nadradenej
kategórie zahŕňa aj všetky hodnoty pod ňou oddelené znakom `>`; viac vybraných
vetiev používa OR logiku. Filter dostupnosti a povinný obrázok zostávajú zachované.
Po zmene filtra treba spustiť publikovanie, aby sa nový výber zapísal do R2 feedu.

### Viac šablón pre jedného klienta

V záložke **Šablóna** je vždy jedna bezpečná predvolená šablóna. Tlačidlom
**Duplikovať** možno vytvoriť ďalšie pomenované šablóny a každej zvoliť rozloženie
Klasická, Rozdelená, Spodný pás alebo Minimalistická. Všetky existujúce nastavenia
farieb, loga, ceny, titulku a odznaku sa upravujú samostatne pre práve vybranú
šablónu. Logo a fontové súbory sú spoločné assety klienta, ale hlavná farba rámu
a ostatné vizuálne farby sú súčasťou konkrétnej šablóny a medzi šablónami sa
neprepisujú.

Pravidlá priraďujú odvodenú šablónu produktom podľa minimálnej zľavy alebo vetvy
kategórie. Vyhodnocujú sa zhora nadol a prvé zhodné pravidlo vyhrá. Produkt zachytený
pravidlom sa zaradí do renderovania aj vtedy, keď je mimo kategórií vybraných v
záložke **Filtre**; povinný obrázok a základné pravidlá, napríklad dostupnosť, však
stále musí splniť. Výsledný výber je teda zjednotenie katalógového filtra a pravidiel
šablón. Ak sa nezhoduje žiadne pravidlo, zaradený produkt použije predvolenú šablónu.
Zmena šablón alebo pravidiel zvýši `templateVersion`; následný render preto bezpečne
pripraví nové obrázky.

### Viacerí klienti

V ľavom paneli zvoľ **Pridať klienta**. Formulár pred uložením stiahne a overí
XML alebo CSV feed, mapovanie produktových polí a filtre. Nový klient dostane
samostatný súbor `clients/<id>.json`, logo v `assets/clients/<id>/`, lokálny stav
v `out/<id>/` a R2 prefix `<id>/`. Bucket a verejná R2 doména sa preberú z
existujúcej konfigurácie; R2 prístupové kľúče zostávajú spoločné.

Pri vytvorení klienta možno voliteľne nahrať vlastný font Regular a Bold vo
formáte TTF, OTF alebo WOFF (WOFF2 renderer nepodporuje). Súbory sa uložia do
`assets/clients/<id>/`, takže lokálny náhľad aj GitHub Actions používajú presne
rovnakú typografiu. Ak sa fonty nenahrajú, použije sa spoločný Poppins.

Logo aj fontový pár možno nahrať alebo vymeniť aj neskôr v záložke **Šablóna →
Logo a fonty**. Nahratie aktualizuje klientsku konfiguráciu, zapne nové logo,
zvýši `templateVersion` a obnoví živý náhľad. Cesty k assetom sa v bežnom editore
nezobrazujú ako ručne editovateľné textové polia.

Po založení klienta najprv skontroluj živý náhľad a až potom spusti prvé
publikovanie. Aby nového klienta spracovával aj denný GitHub Action, jeho JSON a
logo musia byť commitnuté a odoslané do repozitára. Workflow všetky konfigurácie
v `clients/` objaví automaticky.

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

## R2 využitie v lokálnom UI

Záložka **Nastavenia** zobrazuje aktuálne Standard storage a mesačné Class A/Class
B operácie voči free-tier limitom. Ide o globálne využitie spoločné pre všetkých
klientov. Metriky sa cachujú 5 minút a dajú sa obnoviť ručne.

Do lokálneho `.env` pridaj `CLOUDFLARE_API_TOKEN` s read-only oprávneniami
`Account Analytics Read` a `Workers R2 Storage Read`. Tento token nie je potrebný
pre renderovanie ani GitHub Actions; slúži iba na zobrazenie Cloudflare metrík.
Úložisko v UI je aktuálny snapshot, zatiaľ čo Cloudflare fakturuje priemerné
GB-month.

## Odstránenie pozadia: BiRefNet, U²-Net alebo Gemini

Pre bezplatné lokálne spracovanie najprv jednorazovo spusti:

```bash
npm run setup:u2net
```

Príkaz vytvorí izolované Python prostredie `.venv-rembg` a nainštaluje `rembg`.
Lokálne modely sa stiahnu pri prvom výreze a uložia do `out/models/u2net/`.
Predvolený novší `birefnet-general-lite` v našich produktových testoch vytvoril
čistejšie hrany než základný U²-Net. Zdrojový obrázok pri lokálnej metóde neopustí
počítač. Po vyrezaní sa priehľadné okraje automaticky orežú a produkt sa zväčší
podľa nastaveného okraja.

Gemini zostáva ako voliteľná experimentálna metóda na porovnanie výsledkov. Do lokálneho
`.env` pridaj `GEMINI_API_KEY`. Voliteľná premenná `GEMINI_IMAGE_MODEL` môže
prepísať predvolený stabilný model `gemini-3.1-flash-image` (Nano Banana 2). API
kľúč sa neposiela do prehliadača; volanie vykonáva lokálny Node server.

V záložke **Šablóna** vyber ukážkové SKU, zvoľ metódu a vytvor výrez. Výsledky
BiRefNetu, U²-Netu a Gemini sa ukladajú oddelene do `out/<client>/background-removal/`.
Gemini technické jednofarebné pozadie lokálne prevedie na alfa kanál. Cache je
odvodená od adresy zdrojového obrázka, modelu a verzie spracovania; tlačidlo
**Vytvoriť výrez znova** cache vedome obíde.

### Použitie výrezu vo finálnej šablóne

V editore konkrétnej šablóny otvor skupinu **Produktový obrázok → Odstránenie
pozadia** a zapni **Použiť produkt bez pozadia**. Nastavenie platí iba pre danú
šablónu. Produkty priradené cez pravidlá k inej šablóne preto môžu zostať s
pôvodným pozadím. Posuvník **Okraj okolo výrezu** určuje, koľko voľného priestoru
zostane okolo produktu.

Živý náhľad aj finálny render následne používajú BiRefNet. Výrez sa vloží priamo
na farbu pozadia šablóny bez pôvodnej bielej plochy a rámu. Po uložení šablóny sa
zvýši `templateVersion`, takže dotknuté produkty sa pri ďalšom renderovaní vytvoria
znova a supplementary feed bude ukazovať na nové obrázky.

Výrez sa cachuje. Zmena farieb, textov alebo okraja preto nespúšťa drahú segmentáciu
znova. Denný GitHub Actions beh má vlastné Python prostredie aj cache modelu a túto
funkciu podporuje automaticky; prvé spracovanie väčšieho počtu produktov bude
prirodzene dlhšie.

BiRefNet produkty spracováva postupne a po každom výreze obnoví ONNX proces. Tým
sa pri dávke neuvoľnená pracovná pamäť nehromadí do swapu. Predvolene používa dve
CPU vlákna; na výkonnejšom stroji možno počet zmeniť cez premennú
`REMBG_CPU_THREADS`.

Pri zdrojoch s bielym pozadím sa navyše automaticky kontroluje, či BiRefNet
neodstránil veľkú bielu plochu uzavretú vo vnútri produktu, napríklad displej
notebooku. Ochranná oprava sa použije iba pri výrazne neúplnej maske; pri bežných
produktoch a prirodzených otvoroch zostáva pôvodná BiRefNet maska nezmenená.
