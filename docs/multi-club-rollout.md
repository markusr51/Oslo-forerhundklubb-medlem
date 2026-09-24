# Flerklubb — utrulling 24. september 2026

## Omfang

- Alle 77 eksisterende personer og deres medlemskap er tilordnet Oslo Førerhundklubb. Det finnes én klubb i produksjon; ingen demoklubber er opprettet.
- Én personlig profil og innlogging, med primært/sekundært medlemskap og separate klubbnotater. Ekvipasje/ekstern ekvipasje følger medlemskapstypen for kvalifiserte personer.
- Klubbvalg, avgrensede medlemssøk, arrangementer, skjemaer, kommunikasjon, dokumenter og økonomi. Servicefunksjoner avgrenser også forespørsler som bruker servertilgang.
- Hver klubb bestemmer kontingent, honorarer og kilometergodtgjørelse per år. Primære og sekundære medlemmer betaler samme kontingent i klubben. Kontingent må settes av klubben; ingen tidligere kontingentsats er gjettet.
- Hjelpetrenere velger selv arbeidsklubber. Valget gir ikke tilgang til medlemsregister eller styrefunksjoner. Oslos eksisterende kvalifiserte hjelpetrenere er tilknyttet Oslo som utgangspunkt.
- Felles oppgjørsvisning inkluderer gamle og nye registreringer uten dobbeltføring. Historiske satser/beløp beholdes. Systemadministrator kan korrigere beløp med logget begrunnelse.
- Brukeren velger veterinærklinikk. Veterinærer får bare klinikkens tilknyttede hunder; NAV får alle hunder; skoletrenere får aktivt tilordnede hunder. Hundedata og hundedokumenter har egne tilgangskontroller.
- Support kan administrere klubber, klinikker, medlemskap og hundetilknytninger. Eksisterende kontoadministrasjon beholdes. GuideViews funksjoner beholdes med klubbavgrenset administrasjon.
- Fiken er fortsatt bare Oslo. Domene, e-postavsender og SMS-avsender er uendret.

## Gjennomført kontroll

Migrasjon 001–016 ble kjørt samlet i én transaksjon, med automatisk avbrudd ved uventede endringer i eksisterende data i 52 tabeller. Det samme utrullingsskriptet ble først prøvd i isolert PostgreSQL med en lokal sikkerhetskopi. Alle kontrollene bestod. Migrasjon 017 gir serverrollen eksplisitte leserettigheter til de nye klubboppslagene og nødvendige funksjonsrettigheter for visningene.

Sikkerhetskopi av produksjonsskjema og data er lagret utenfor Git-repoet i arbeidsområdets `work/audit/pre-rollout-*`. Ingen produksjonsdata er lagt i GitHub. Migrasjonene ble anvendt via Supabase Management API (`db query`), ikke gjennom `db push`; ikke kjør 001–017 om igjen mot denne databasen.

Alle 24 tjenester er deployet og ACTIVE, med opprinnelige JWT-innstillinger. Tjenester som kalles fra nettleseren svarer på CORS-kontroll med klubbheaderen tillatt. Beskyttede bakgrunnsjobber/webhooks avviser kall uten sine eksisterende nøkler. PostgREST gjenkjenner persons-relasjonene og avviser anonyme oppslag. En faktisk databasekontroll med supportrollen viser 77 medlemmer, én klubb og seks tidligere oppgjørsposter.

Testene dekker migrering, klubbgrenser, forfalsket klubbvalg, private notater, kontingent/rater, gamle beløp, veterinær/NAV/skoletrener, filtilgang, tilbakekalling, supportkorrigering og samtidige serviceforespørsler. Den tidligere Opprett skjema-feilen er fortsatt rettet, med native datovelgere og synlig feilmelding ved tjenestefeil.

Kjør med Node 24 og `@electric-sql/pglite` (alternativt angi PGLITE_MODULE):

```
node tests/access-model.cjs
node tests/tenant-isolation.cjs
node tests/service-scope.cjs
node tests/guideview-club-access.cjs
node tests/forms-deadline.cjs
```

## Praktiske begrensninger

En manuell gjennomgang med VoiceOver og faktisk innlogget filopplasting/skjemaoppretting er ikke utført. Slike handlinger er testet i isolerte database-/handler-/DOM-tester, mens produksjonskontrollene er uten utsendelser, fakturering eller syntetiske medlems-/oppgjørsposter. Nettlesere som allerede har portalen åpen må laste siden på nytt for å hente `app.js?v=0300`.

Ved senere feil: behold klubbavgrensningen. Ikke legg tilbake gamle uavgrensede servicefunksjoner etter at nye klubber er tatt i bruk. Bruk sikkerhetskopien til målrettet gjenoppretting, og kontroller eventuelle nye registreringer før data erstattes.
