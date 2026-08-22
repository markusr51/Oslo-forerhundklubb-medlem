# Oslo Førerhundklubb medlemsportal v0.3

Denne versjonen bruker Supabase Auth + RLS og inneholder ingen hardkodede medlemsdata.

## Nytt i v0.3
- Legg til ny person.
- Rediger personopplysninger og medlemsstatus.
- Meld ut person uten å slette historikken.
- Flere samtidige roller per person, med legg til/deaktiver.
- Brukere og tilganger: liste, aktivere/deaktivere portalbrukere.
- Invitasjon av nye portalbrukere er klargjort via Supabase Edge Function.

## Viktig
`config.js` inneholder kun offentlig Project URL og publishable key. Legg aldri service role/secret key eller databasepassord i GitHub.

## Edge Function for invitasjoner
Koden ligger i `supabase/functions/invite-portal-user/index.ts`. Den må deployes i Supabase før knappen «Send invitasjon» virker. Funksjonen verifiserer at innlogget bruker er aktiv `system_admin` før den bruker Supabase Admin API.

GitHub Pages kan fortsatt publisere resten av portalen som før.
