# Test etter rettingene i 0.30.1

Dato: 24. september 2026. Domene og avsendere er uendret.

## Rettet

1. Gamle oppgjørstabeller avviser egen godkjenning, egen utbetaling og endring av sats. Godkjente poster låses. Administrator bruker samlet oppgjørsfunksjon. Endring av arrangement flytter ikke allerede godkjente oppgjør.
2. GuideView bruker LiveKits abonnementsrettigheter og publisistens serverhåndhevede liste over tillatte mediespor. Ny forbindelse har mottak sperret til rutingslisten er oppdatert. Ved vedvarende kontrollfeil kobles klienten fra.
3. Avslutning og avlysning fjerner deltakere og lukker medierommet. Ved serverfeil kan «Kontroller at samtalen er stengt» forsøkes på nytt. Ny tokenutstedelse avviser avsluttede økter.
4. Trenerens aktive hunderelasjon gir oppretting uavhengig av valgt klubb. Riktig hundefører kan velges og inviteres. Invitasjoner begrenses til aktive hunderelasjoner. Support har bruker, skoletrener, hjelpetrener og aspirant.
5. Ruting beholder eksisterende kontroller og fokus, også når en deltaker legges til.
6. Be om hjelp, oppdragsdialog og datospørsmål bruker native lokalmenyer.
7. Årsoversikt, administrators ventelister og Min side bruker samlet oppgjørsgrunnlag. Nye registreringer gir klubbavgrenset varsel i portalen. Den eldre registreringssidens delsum er tydelig merket og lenker til samlet oppgjør.
8. Inaktiv/utmeldt medlemsstatus avslutter medlemsadgang i den aktuelle klubben. Andre medlemskap og selvstendige styre-, trener- og fagtilganger beholdes.
9. Eksisterende år og alle minutter beholdes i arrangementsvelgerne.
10. GuideView rydder opp ved tilkoblingsfeil, støtter lyd uten kamera og viser beskjed ved frakobling/gjenoppkobling.

## Utførte automatiske kontroller

Isolert PostgreSQL med reelle tilgangsregler: gammel og ny oppgjørsflyt, klubbgrenser, medlemsstatus, hunderelasjoner, oversikter og varsler. Migreringsprøve på lokal sikkerhetskopi av produksjonsdata med kontroll av uendrede økonomirader, profiler, identiteter og Fiken-data. Simulert medietjeneste: abonnementsrettigheter, foreldet bekreftelse etter gjenoppkobling, blokkert lyd og serverstyrt romlukking. DOM-test: dynamiske lokalmenyer, ugyldige datoer, eksisterende år/minutt og fokusbevaring. Alle 40 siders JavaScript kontrolleres samlet med felles skript.

## Praktisk test med skjermleser

Bruk avtalte testpersoner og testdata; invitasjoner i portalen er reelle.

1. Last siden på nytt. Gå gjennom menyen med VoiceOver. Kontroller Skjemaer, Mine skjemaer, GuideView og klubbvalg.
2. Opprett et skjema med og uten frist. Legg til et obligatorisk datospørsmål. Besvar skjemaet, prøv en ugyldig dato og kontroller kvitteringen etter innsending.
3. Prøv dato og klokkeslett i Be om hjelp og i oppdragsdialogen. Endre et eldre arrangement og kontroller at år og eksempelvis 18:10 beholdes.
4. Opprett GuideView som trener. Kontroller riktig bruker/hund, invitasjon og godta/avslå. Prøv med hundefører, hjelpetrener og skoletrener samtidig.
5. Kontroller mikrofon, kamera av/på og lyd uten kamera. Slå lyd og bilde av/på mellom bestemte deltakere. La VoiceOver stå på en rutingskontroll mens andre kobler til.
6. Prøv kort nettverksbrudd og gjenoppkobling. Avslutt økten og kontroller på alle enheter at lyd og bilde faktisk stopper og at ny tilkobling avvises.
7. Kontroller gamle og nye oppgjør i samlet oversikt, årsoversikt og administrators venteliste. Bruk testposter for godkjenning; ikke marker reelle poster som utbetalt bare for å teste.
8. Med separate testbrukere: klubbbytte, sekundært medlemskap, klinikkbytte, hundedokumenter og utmelding. Et annet klubbstyre skal ikke se Oslo-medlemmer uten et eget medlemskap der.

## Begrensning før praktisk godkjenning

Automatiske tester erstatter ikke VoiceOver eller en faktisk samtale med flere enheter. Disse brukertestene er ikke utført av agenten. LiveKit-romlukking og gjenoppkobling må bekreftes i den faktiske medietjenesten. Kortlivede tilkoblingstokener varer to minutter; på selvdrift uten LiveKit Clouds tokenrevokering kan allerede utstedte tokener leve ut denne tiden. Rutingsvalget bekreftes som lagret mens oppdateringen gjennomføres hos deltakerne. Ikke bruk ruting som en testet fortrolighetsbarriere før flerpartstesten er bestått.
