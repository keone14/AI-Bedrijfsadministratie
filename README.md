# AI Bedrijfsadministratie

Betrouwbare, eenvoudige bedrijfsadministratie voor Belgische ondernemers.

## Kernprincipe
AI helpt lezen, classificeren en uitleggen. De database, gevalideerde regels en deterministische code bepalen betrouwbare statussen en bedragen.

## Stack
- Next.js + TypeScript
- Supabase Auth, PostgreSQL, Storage en RLS
- Vercel

## Veiligheidsregels
- Geen fiscale of juridische waarheid uit vrije AI-output.
- Tenantdata altijd gescheiden via `company_id` en RLS.
- Documentbucket is privé.
- Originele documenten blijven behouden.
- Belangrijke bedragen moeten traceerbaar zijn naar bronfacturen.
- Regeldata bewaart bron, geldigheid en laatste verificatiedatum.
- Productiemigraties gaan pas naar `main` na review.

## Lokale configuratie
Kopieer `.env.example` naar `.env.local` en vul uitsluitend lokale/veilige secrets in. Commit nooit echte secrets naar GitHub.

## Huidige status
De branch `bootstrap-v1` bevat de eerste vertical slice: UI-basis, Supabase clients, multi-tenant databaseschema, private storage policies en CI quality gate.

De database-migratie staat bewust nog niet op `main`, zodat de gekoppelde productie-Supabase niet automatisch aangepast wordt voordat de migratie is beoordeeld.
