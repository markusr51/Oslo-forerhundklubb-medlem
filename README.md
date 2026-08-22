# Oslo Førerhundklubb – medlemsportal

Første tilgjengelige prototype av medlemsportalen.

## Status

Denne versjonen bruker kun fire fiktive testpersoner. Den er ikke koblet til Supabase og endrer ingen ekte medlemsdata.

## Filer

- `index.html`: testinnlogging
- `members.html`: søkbar medlemsoversikt
- `person.html`: personvisning/redigering
- `style.css`: tilgjengelig layout med tydelig tastaturfokus
- `app.js`: testdata og interaksjon
- `config.example.js`: mal for senere Supabase-tilkobling

## Neste fase

1. Opprette separat GitHub-repository for medlemsportalen.
2. Publisere prototypen på en midlertidig adresse og VoiceOver-teste den.
3. Koble til Supabase Auth.
4. Lage sikre RLS-policyer før ekte data leses fra nettleseren.
5. Erstatte testdata med `persons`, `person_roles` og `roles` fra Supabase.
6. Koble `medlem.osloforerhundklubb.no` til den ferdige portalen.

## Sikkerhet

Legg aldri databasepassord eller Supabase service-role key i dette repositoryet eller i JavaScript som sendes til nettleseren.
