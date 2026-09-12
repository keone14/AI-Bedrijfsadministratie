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
Kopieer `.env.example` naar `.env.local` en vul uitsluitend lokale/veilige configuratie in. Commit nooit echte secrets naar GitHub.

### Vereiste basisvariabelen
- `NEXT_PUBLIC_SUPABASE_URL`: URL van het Supabase-project voor de huidige omgeving.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publieke Supabase-key voor browser/auth-verkeer.
- `SUPABASE_SERVICE_ROLE_KEY`: geheime server-side key. Nooit naar de browser sturen of committen.
- `APP_URL`: basis-URL van de app, lokaal standaard `http://localhost:3000`.

### Factuurverwerking zonder kosten
Voor lokale of stagingtests kan de ingebouwde synthetische fixture worden gebruikt:

```env
AI_INVOICE_PROVIDER=fixture
ALLOW_SYNTHETIC_AI_FIXTURE=true
```

Deze modus stuurt geen documentinhoud naar een externe AI-dienst. De server blokkeert de fixture bovendien wanneer `VERCEL_ENV=production`, zodat synthetische testdata niet als echte productie-uitlezing kan worden gebruikt.

### Optionele externe AI
De code ondersteunt ook een expliciet geconfigureerde OpenAI-provider. Die is **niet standaard actief** en kan gebruikskosten veroorzaken. Alleen wanneer een toekomstige eigenaar bewust voor die provider kiest zijn daarnaast nodig:

```env
AI_INVOICE_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_INVOICE_MODEL=
```

Zonder complete providerconfiguratie start de app geen externe AI-uitlezing. Secrets blijven altijd server-side.

## Deployment workflow
- `main` is productie en wordt niet gebruikt voor experimentele tests.
- Featurebranches zoals `bootstrap-v1` worden eerst als Vercel Preview gebouwd en gecontroleerd.
- Preview- en production-environmentvariabelen blijven gescheiden.
- Een wijziging mag pas naar `main` wanneer CI, security-audit, typecheck, lint en production build slagen en de preview is gecontroleerd.
- Database-migraties worden versioned en pas na review naar productie gebracht.

## Verkoop en overdracht
`SALE_READINESS.md` is de centrale checklist voor technische verkoopbaarheid en overdracht. De status wordt bewust niet verhoogd zonder aantoonbaar bewijs voor onder meer staging, tenant/RLS-isolatie, de 20-facturenflow en backup + restore.

## Huidige status
De branch `bootstrap-v1` bevat de eerste vertical slice: UI-basis, Supabase clients, multi-tenant databaseschema, private storage policies en CI quality gate.

De database-migratie staat bewust nog niet op `main`, zodat de gekoppelde productie-Supabase niet automatisch aangepast wordt voordat de migratie is beoordeeld.
