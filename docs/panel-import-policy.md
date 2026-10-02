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
| `tags` | `tags`, `tag`, `labels` |

`Tags` kan indeholde flere tags i samme celle. Adskil tags med komma, semikolon, pipe eller linjeskift. Tags normaliseres til lowercase. Hvis `Tags`-kolonnen er mappet og tom, fjernes eksisterende tags for den importerede panelist. Uden `Tags`-kolonne bevares eksisterende tags ved opdatering.

Andre registrerede custom fields matches via deres normaliserede, stabile nøgle. Filen skal være CSV eller XLSX og må højst være 8 MB.

Kendte Preely-rosterfelter mappes også automatisk: `Name` gemmes samlet som `full_name` uden navnesplit; `Zip Code` mappes til postnummer; `Boligtype` og syv `[B2B]`-felter gemmes som custom attributes med stabile keys. Custom fields oprettes ved commit for felter med værdier, også efter organisationsreset. Ikke-genkendte kolonner vises eksplicit i importwizard og tælles som unmappede.

## Samtykke pr. formål

Samtykke importeres kun fra eksplicitte kolonner. `survey_contact` og `panel_membership` er uafhængige; én status udfylder ikke den anden. Brug disse normaliserede kolonnenavne:

| Formål | Status | Oprindelig grant-tid | Tilbagetrækningstid | Dokumentationsreference |
|---|---|---|---|---|
| `survey_contact` | `survey_contact_status` | `survey_contact_granted_at` | `survey_contact_withdrawn_at` | `survey_contact_evidence_ref` |
| `panel_membership` | `panel_membership_status` | `panel_membership_granted_at` | `panel_membership_withdrawn_at` | `panel_membership_evidence_ref` |

Status må være `granted` eller `withdrawn`. Tidsstempler skal være ISO-8601 med offset, fx `2026-07-22T10:30:00+02:00` eller `2026-07-22T08:30:00Z`. `granted` kræver grant-tid og dokumentationsreference, uden tilbagetrækningstid. `withdrawn` kræver tilbagetrækningstid og dokumentationsreference; oprindelig grant-tid kan medsendes. Referencen er et ikke-tomt, opak ID på højst 500 tegn. Indhold eller gyldighed af dokumentation verificeres ikke af importeren.

Udeladte samtykkefelter opretter ingen samtykkepost. Delvist udfyldte eller ugyldige felter afviser rækken. Importens afkrydsning er operatørens bekræftelse af gennemgået dokumentation; den opretter ikke samtykke. Importresultatet viser kun aggregerede tællere for givet, trukket tilbage og uden dokumentation pr. formål.

## Dubletter

Hvis `external_id` findes, bruges den som dedup-nøgle. Ellers bruges normaliseret `email`. Rækker uden brugbar nøgle afvises. Senere forekomst i samme fil af samme nøgle markeres som dublet.

## Samtykke

Import kræver eksplicit bekræftelse af lovligt behandlingsgrundlag og kontaktgrundlag. Backend kontrollerer bekræftelsen både ved dry-run og commit. UI-valget kan derfor ikke omgå reglen.

## Fejl og historik

Ugyldige rækker gemmes i importbatchens fejlrapport. Rapporten kan downloades. Efter commit genindlæses ruten, så importhistorik og tællere viser den afsluttede batch straks.
