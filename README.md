# Oslo Førerhundklubb medlemsportal v0.5

Nyheter i v0.5:
- Ny tilgjengelig SMS-side.
- Test mot Sveve med `test=true` uten faktisk utsending.
- Send én ekte test-SMS til manuelt nummer.
- Valg mellom ikke-svarbar SMS fra `Oslo FHK` og svarbar SMS via Sveves svarnummer.
- Bare `admin` og `system_admin` kan bruke SMS-siden.
- Meldingslengde begrenset til 1071 tegn og tegn-teller i grensesnittet.
- Beholder brukeradministrasjon, medlemsregister, eksport og endringshistorikk fra v0.4.

Testrekkefølge:
1. Last opp og erstatt filene i GitHub-repositoryet.
2. Åpne `https://medlem.osloforerhundklubb.no/sms.html`.
3. Logg inn som systemadministrator.
4. Skriv ditt eget mobilnummer og en kort testmelding.
5. Kjør først «Test mot Sveve uten å sende».
6. Hvis testen godkjennes, send én ekte test-SMS.
7. Gruppeutsending kobles på først etter at denne testen er bekreftet.
