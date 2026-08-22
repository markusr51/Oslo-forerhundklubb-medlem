# Oslo Førerhundklubb – medlemsportal v0.2

Første versjon koblet til ekte Supabase Auth og medlemsdatabase.

## Hva v0.2 gjør

- Ekte innlogging med Supabase Auth.
- Krever aktiv konto i `app_users`.
- Henter medlemslisten fra `persons`, `person_roles` og `roles`.
- Søk etter navn, e-post, telefon eller rolle.
- Rollefilter bygges fra databasen.
- Personside kan redigere navn, e-post, telefon, medlemsstatus og rolle.
- Rolle kan deaktiveres uten å slette personen.
- Logg ut avslutter Supabase-sesjonen.
- Ingen ekte medlemsdata er hardkodet i GitHub-filene.

## Sikkerhet

`config.js` inneholder bare Supabase Project URL og en publishable key. Dette er offentlig klientkonfigurasjon. Tilgang til medlemsdata håndheves av Supabase Auth og Row Level Security (RLS).

Aldri legg inn:
- databasepassord
- `sb_secret_...`
- `service_role`
- andre serverhemmeligheter

i dette repositoryet.

## Filer

- `index.html` – ekte innlogging
- `members.html` – medlemsoversikt
- `person.html` – personvisning og redigering
- `style.css` – tilgjengelig layout og tydelig tastaturfokus
- `app.js` – Supabase Auth og databasefunksjoner
- `config.js` – offentlig Supabase-klientkonfigurasjon
- `logo.png` – klubblogo
- `README.md` – denne filen

## Neste steg

1. Oppdater GitHub-repositoryet med disse filene.
2. Vent på GitHub Pages-deploy.
3. Test ekte innlogging.
4. Kontroller at medlemslisten viser 73 personer.
5. Test åpning av person uten å lagre endringer først.
6. Når lese- og innloggingsflyten er godkjent, test en ufarlig redigering på en avtalt post.
7. Deretter bygges bruker-/administratorstyring i selve portalen.
