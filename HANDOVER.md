# AI Bedrijfsadministratie - Handover Runbook

Last reviewed: 2026-09-10  
Branch reviewed: `bootstrap-v1`

Dit document is bedoeld voor een toekomstige eigenaar of ontwikkelaar. Het beschrijft alleen wat vandaag uit de repository reproduceerbaar of controleerbaar is. Open punten worden bewust niet als afgerond voorgesteld.

## 1. Wat je overneemt

AI Bedrijfsadministratie is een Next.js/TypeScript-app voor eenvoudige bedrijfsadministratie, met Supabase voor Auth, PostgreSQL, Storage en RLS. De kernregel is: AI mag helpen lezen en uitleggen, maar betrouwbare statussen en bedragen komen uit gevalideerde data en deterministische code.

Belangrijkste documenten vóór wijzigingen:
- `README.md`
- `SALE_READINESS.md`
- Source of Truth in `/AI Bedrijfsadministratie`
- versioned migrations in `supabase/migrations/`

## 2. Lokale installatie vanaf repository

Vereist:
- Git
- Node.js 22
- npm

Stappen:

```bash
git clone <repository-url>
cd AI-Bedrijfsadministratie
git checkout bootstrap-v1
npm install
cp .env.example .env.local
npm run dev
```

Vul in `.env.local` uitsluitend waarden voor een development- of stagingomgeving in. Commit nooit `.env.local` of echte secrets.

## 3. Minimale configuratie

Zie `.env.example` en `README.md` voor de actuele lijst.

Basis:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` - uitsluitend server-side
- `APP_URL`

Gratis testmodus voor factuurverwerking:

```env
AI_INVOICE_PROVIDER=fixture
ALLOW_SYNTHETIC_AI_FIXTURE=true
```

De fixture is voor development/staging. De server blokkeert deze modus in Vercel production.

Een externe AI-provider is optioneel en kan kosten veroorzaken. Een koper hoeft die niet te activeren om de gratis testflow te gebruiken.

## 4. Lokale quality gate

Voer vóór overdracht of merge minimaal uit:

```bash
npm audit --omit=dev --audit-level=high
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

GitHub Actions voert daarnaast een eenvoudige secret-patterncontrole uit vóór installatie/build/tests.

Een groene CI bewijst codekwaliteit voor de afgedekte flows, maar bewijst niet automatisch RLS-isolatie, storage-isolatie, backup/restore of de volledige stagingflow.

## 5. Branches en deployment

Huidige ontwikkelregel:
- `bootstrap-v1`: actieve V1-ontwikkeling en controles;
- `main`: niet aanpassen of naar productie brengen zonder expliciete review/goedkeuring.

Vercel Preview kan featurebranches bouwen. Preview-, staging- en production-secrets moeten gescheiden blijven.

Niet aannemen dat een previewdeployment gelijkstaat aan staging: een verkoopklare stagingomgeving vereist ook een aparte database/secrets en mag geen productieklantdata gebruiken.

## 6. Database en migrations

Databasewijzigingen horen versioned in `supabase/migrations/`.

Harde regels:
- geen handmatige productieschemawijziging buiten migrations;
- migrations eerst op een aparte stagingdatabase uitvoeren;
- RLS en storage policies daar testen;
- pas daarna productie overwegen.

### Nog niet bewezen

Er is momenteel nog geen in deze repository gedocumenteerde, uitgevoerde end-to-end procedure die vanaf een lege stagingdatabase alle migrations toepast en daarna de volledige V1-testset groen bewijst. Dit blijft een verkoopblokkering in `SALE_READINESS.md`.

## 7. Tenant- en securitymodel

Elke tenantgebonden kernentiteit hoort `company_id` te hebben. Toegang loopt via `company_members`, RLS en server-side autorisatie. Documenten blijven privé en storage paths zijn company-scoped.

Bij securitycontrole minimaal proberen:
- gebruiker A leest/wijzigt company B;
- verkeerd `company_id`;
- verkeerd storage path;
- directe/oude documentlink;
- verlopen sessie;
- meerdere ondernemingen onder één gebruiker;
- gedeeltelijk mislukte upload + retry.

Deze scenario's mogen pas als bewezen veilig worden gemarkeerd na echte integratietests op staging.

## 8. Data-eigendom en export

De repository bevat exports voor:
- bedrijfsgegevens;
- facturen;
- originele documenten.

Dit ondersteunt overdraagbaarheid van klantdata. Een export is echter geen disaster-recoverybewijs. Backup én restore moeten afzonderlijk worden getest.

## 9. Accounts die bij verkoop moeten worden geïnventariseerd

Vóór overdracht moet de eigenaar een koper-facing inventaris maken van de daadwerkelijk gebruikte accounts, zonder secrets in dit document te zetten:
- GitHub repository en toegangsrechten;
- Vercel project(en) en environments;
- Supabase project(en) en regio/omgeving;
- domein/DNS indien van toepassing;
- optionele AI-provider indien geactiveerd;
- eventuele monitoring/loggingdiensten.

Per dienst vastleggen:
- eigenaar/beheerder;
- doel;
- omgeving: development/staging/production;
- overdrachtsmethode of opnieuw koppelen;
- verwachte kosten/limieten;
- waar secrets veilig opnieuw worden ingesteld.

Nooit wachtwoorden, tokens, herstelcodes of service-role keys in GitHub opslaan.

## 10. Wat een koper vóór closing nog moet kunnen verifiëren

Minimaal:
1. schone installatie vanaf repository;
2. gescheiden staging werkt;
3. migrations zijn reproduceerbaar;
4. tenant/RLS- en storage-isolatie zijn aantoonbaar groen;
5. 20-facturenflow werkt inclusief fouten en retries;
6. backup kan werkelijk worden teruggezet;
7. mobiel en desktop E2E zijn groen;
8. exports leveren de beloofde klantdata/originelen;
9. geen kritieke secrets of bekende kritieke securityproblemen;
10. operationele accounts, afhankelijkheden en kosten zijn geïnventariseerd.

De actuele status en prioriteit van deze punten staat in `SALE_READINESS.md`.

## 11. Wat niet stilzwijgend mag gebeuren

- Geen productie-Supabase aanpassen om een test sneller af te ronden.
- Geen betaalde dienst of upgrade activeren zonder expliciete beslissing.
- Geen productieklantdata gebruiken voor stagingtests wanneer synthetische data volstaat.
- Geen fiscale/juridische regel toevoegen zonder actuele officiële bron.
- Geen P0-verkoopblokkering als afgerond markeren zonder reproduceerbaar bewijs.
