# Flerklubb, Min hund og support — utviklingsgren

**Ikke produksjonsklar. Ikke kjør migrasjonene på den aktive portalen ennå.** Domeneflytting er utsatt. Det er ikke opprettet testklubber eller nye tilganger i produksjon.

## Implementert

- Klubber og klubbroller. Hjelpetrenere velger selv hvilke klubber de arbeider for; valget gir aldri styretilgang.
- Klubbvise oppdrag, atomisk tildeling, fullføring og avlysning. Tilknyttet oppdrag bestemmer betalingsklubben på serveren.
- Egne oppgjør og kvitteringer per klubb, med RLS og private lagringsområder. Historikk beholdes etter utmelding.
- Individuell oppfølging, dagsarrangement, helgearrangement og kilometer. Serveren beregner honoraret med registreringsårets klubbsatser. Satsene lagres med posten og påvirkes ikke av senere satsendringer. Annet honorar og utlegg registreres med eget beløp.
- Godkjenning før utbetalingsmarkering, CSV per klubb og ny opplasting av kvittering til samme post ved feil, uten nytt beløp.
- Veterinærtilgang følger brukerens klinikkvalg. NAV har hundetilgang på tvers av klubber. Begge kan endre hundens profil, opprette/endre/slette opplysninger og laste opp/ned/slette hundedokumenter. Klinikkskifte trekker tilbake tidligere klinikks nye forespørsler. Nedlastingslenker varer 60 sekunder.
- Skoletrener ser aktivt tilordnede hunder. Veterinær/NAV får ikke GuideView-administrasjon gjennom hunderollen.
- Supportside for klubber og klinikker (navn/aktiv), tilganger, hunderegistrering med bruker, hundetilknytning, skoletrenertilknytning og tilbakekalling. Tidligere kontoadministrasjon brukes fortsatt for kontoer og passordhjelp.
- Endringslogg som vanlige klienter ikke kan endre eller slette.
- Fire GuideView-tjenester bruker nye serverkontroller for klubbavgrenset administrasjon av økter, tilknytninger, invitasjoner og lyd-/videoruting. Dette er en autorisert endring av tilgangskontrollene. GuideViews funksjoner beholdes. app.js får klubbvalg og navigasjon til de nye sidene.
- Native dag-/måned-/årskontroller gjenbruker events.js.

- Alle eksisterende medlemskap og klubbdata migreres til Oslo etter brukerens bekreftelse. Andre klubber starter uten Oslos medlemmer.
- Én personlig profil og klubbvise medlemsopplysninger. Primært og sekundært medlemskap bruker samme person og innlogging; private klubbnotater deles ikke.
- Hver klubb setter sin egen medlemskontingent per år. Beløpet er likt for primære og sekundære medlemmer i den klubben. Ingen eksisterende kontingentsats er antatt eller opprettet automatisk.
- Honorarsatser og kilometergodtgjørelse lagres separat per klubb og år. Bare eget klubbstyre eller systemadministrator kan endre dem.
- Gammel og ny oppgjørshistorikk vises samlet uten kopiering av økonomiposter. Nye og gamle satseditorer synkroniseres; historiske beløp beholdes.
- Servicefunksjonene får klubbavgrensede klienter. Fiken bruker alltid Oslo. Avsender for e-post/SMS og domenet endres ikke.

Ny navigasjon er lagt inn i utviklingsgrenens app.js. Hele grenen må fortsatt innføres samlet etter ferdig verifikasjon; den er ikke publisert i drift.

## Verifikasjon

Testene bruker isolert PostgreSQL via PGlite og syntetiske data, aldri produksjonsdatabasen. Installer Node 24 og `@electric-sql/pglite`, og kjør:

```
node tests/access-model.cjs
node tests/tenant-isolation.cjs
node tests/service-scope.cjs
node tests/guideview-club-access.cjs
node tests/forms-deadline.cjs
```

Access-testen kjører alle migrasjonene mot en skjemakopi av produksjon (uten persondata) med reell RLS som authenticated. Den dekker veterinærgrense, NAV, CRUD, klinikkbytte, dokumentlagring, support, skoletrenertilordning og tilbakekalling, logg, selvvalgte klubber, betalingsklubb, klubbseparasjon, satssnapshots, kvitteringsgjenoppretting og ingen selvopprykk. GuideView-testen kjører de faktiske handlerne med falske databaseklienter, kontrollerer avvisning av en annen klubbs administrator og at feil i tilgangsoppslag ikke slipper gjennom endringer. Eksisterende skjematester består også.

Tenant-testen kontrollerer migrering av eksisterende Oslo-poster, to klubbers satser og kontingent, medlemskapstype, separate notater, falskt klubbvalg og lagringstilgang. Service-testen kjører den faktiske avgrensningskoden med simulerte klienter, også samtidige forespørsler.

**Begrensning:** Isolerte tester erstatter ikke PostgREST-integrasjon, VoiceOver-/nettlesertest eller virkelig Supabase-filoverføring.

## Gjenstår før utrulling

1. Sluttkontroller servicefunksjonenes mottakere og kontaktoppslag, også hjelpetrenere uten ordinært medlemskap. Kontroller lagringstilgang til rolletildelte fellesdokumenter uten valgt-klubb-header.
2. Fullfør visning for personer med bare veterinær-/NAV-tilgang, supportkorrigeringer og gamle oversikters henvisning til samlet oppgjør.
3. Kontroller PostgREST-relasjoner mot den nye persons-visningen, cacheversjoner, reell filoverføring og innlogging i nettleser. VoiceOver-verifikasjon gjenstår.
4. Gjennomfør samlet produksjonsmigrering, deploy av servicefunksjoner og publisering av nettsidene med etterkontroll. Oppdater skrivebordskopien separat. Ingen testklubber opprettes i produksjon før demonstrasjon er ønsket.

Ingen domeneendring, Supabase-migrasjon eller GuideView-deploy er utført av denne utviklingsgrenen. Den tidligere skjema-/datorettingen på main er separat og skal beholdes.
