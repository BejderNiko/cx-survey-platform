# Faste regler for panelimport

Panelimport er én arbejdsgang: upload, automatisk parse/mapping/validering, import og opdateret historik. Brugeren vælger ikke tekniske mapping- eller dedup-regler.

## Kolonnemapping

Kendte danske og engelske overskrifter normaliseres til panelistfelter. Mellemrum, store/små bogstaver og bindestreg/underscore ignoreres. Centrale aliaser:

| Målfelt | Accepterede overskrifter |
|---|---|
| `external_id` | `external_id`, `ekstern_id`, `kunde_id`, `kundenummer`, `customer_id` |
| `email` | `email`, `e-mail`, `mail`, `emailadresse` |
| `first_name` | `first_name`, `fornavn`, `firstname` |
| `last_name` | `last_name`, `efternavn`, `lastname` |
| `language` | `language`, `sprog`, `locale` |
| `country` | `country`, `land` |

Andre registrerede custom fields matches via deres normaliserede, stabile nøgle. Filen skal være CSV eller XLSX og må højst være 8 MB.

## Dubletter

Hvis `external_id` findes, bruges den som dedup-nøgle. Ellers bruges normaliseret `email`. Rækker uden brugbar nøgle afvises. Senere forekomst i samme fil af samme nøgle markeres som dublet.

## Samtykke

Import kræver eksplicit bekræftelse af lovligt behandlingsgrundlag og kontaktgrundlag. Backend kontrollerer bekræftelsen både ved dry-run og commit. UI-valget kan derfor ikke omgå reglen.

## Fejl og historik

Ugyldige rækker gemmes i importbatchens fejlrapport. Rapporten kan downloades. Efter commit genindlæses ruten, så importhistorik og tællere viser den afsluttede batch straks.
