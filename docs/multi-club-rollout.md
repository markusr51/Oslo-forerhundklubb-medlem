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
- Fire GuideView-tjenester bruker nye serverkontroller for klubbavgrenset administrasjon av økter, tilknytninger, invitasjoner og lyd-/videoruting. Dette er en autorisert endring av tilgangskontrollene. Eksisterende GuideView-sider og app.js er uendret.
- Native dag-/måned-/årskontroller gjenbruker events.js.

Nye navigasjonslenker ligger bak `PORTAL_MULTICLUB_ENABLED`; flagget er ikke slått på eller satt inn på de eksisterende sidene. Nye sider og serverfunksjoner må innføres samlet etter ferdig sikkerhetsgjennomgang.

## Verifikasjon

Testene bruker isolert PostgreSQL via PGlite og syntetiske data, aldri produksjonsdatabasen. Installer Node 24 og `@electric-sql/pglite`, og kjør:

```
node tests/access-model.cjs
node tests/guideview-club-access.cjs
node tests/forms-deadline.cjs
```

Access-testen kjører alle migrasjonene mot en minimumsmodell av eksisterende skjema med reell RLS som authenticated. Den dekker veterinærgrense, NAV, CRUD, klinikkbytte, dokumentlagring, support, skoletrenertilordning og tilbakekalling, logg, selvvalgte klubber, betalingsklubb, klubbseparasjon, satssnapshots, kvitteringsgjenoppretting og ingen selvopprykk. GuideView-testen kjører de faktiske handlerne med falske databaseklienter, kontrollerer avvisning av en annen klubbs administrator og at feil i tilgangsoppslag ikke slipper gjennom endringer. Eksisterende skjematester består også.

**Begrensning:** Dette er ikke en full kopi av produksjonsskjemaet, og ikke en godkjent VoiceOver-/nettlesertest eller en test av virkelig Supabase-filoverføring.

## Gjenstår før utrulling

1. Avgrens alle gamle tilgangsveier. Nye RLS-regler alene beskytter ikke data som gamle Edge Functions leser med service_role. `forms-actions` sitt persons-oppslag, `helper-requests`, varslingsmottakere og regnskapsjobber må få klubbavgrensning. `admin_dashboard_data`, `admin_helper_year_overview` og persons-policyene må også tilpasses. Den automatiske Fiken-synken må ikke eksportere andre klubbers personer til Oslos regnskap.
2. Samle gammel og ny økonomiflyt. Gamle `helper_entries`/`helper_expenses`, arrangementsregistreringer og den nye klubbjournalen er foreløpig separate. De må samles uten dobbeltføring og uten tap av historiske satser/kvitteringer. Eksisterende satser er ikke kopiert til den nye satstabellen.
3. Kontroller migreringsgrunnlaget: migrasjon 002 tilordner alle nåværende personer til Oslo. Det må erstattes med eller verifiseres mot et riktig medlemsgrunnlag før den kjøres. Nye klubber opprettes senere for demonstrasjon.
4. Knytt medlemskap, arrangementer, dokumenter, varsler og integrasjoner til klubb, og legg inn klubbvalg i eksisterende arbeidsflyter. GuideViews gamle klient sender foreløpig ikke klubbvalg; bakenden bruker Oslo som kompatibilitetsstandard. Supporttilordning av skoletrener må få eksplisitt klubb før flere klubber aktiveres.
5. Fullfør økonomikorrigeringer i support, kontaktvisning i oppgjør (viser nå person-ID), samarbeidstilganger og bekreft alle eksisterende dokumentgrenser.
6. Test mot fullstendig skjema med eksisterende policies, grants og triggers; test migrering av historikk, faktisk filoverføring, innlogging, nettleser og VoiceOver. Deretter deployes migrasjoner og de fire GuideView-tjenestene samlet, navigasjonen aktiveres, og produksjonskontroll utføres.

Ingen domeneendring, Supabase-migrasjon eller GuideView-deploy er utført av denne utviklingsgrenen. Den tidligere skjema-/datorettingen på main er separat og skal beholdes.
