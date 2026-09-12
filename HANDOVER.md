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

## 4. Quality gates

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

De repository bevat ook een aparte `Restore Drill` workflow. Die start een volledig lokale Supabase-stack in GitHub Actions en voert de versioned migrations vanaf nul uit. Hiervoor zijn geen cloud-Supabaseprojecten, productiegegevens of betaalde diensten nodig.

Een groene CI bewijst alleen de afgedekte flows. Een groene Restore Drill bewijst alleen het hieronder beschreven herstelscenario en is geen bewijs voor volledige Supabase-platform disaster recovery.

## 5. Branches en deployment

Huidige ontwikkelregel:
- `bootstrap-v1`: actieve V1-ontwikkeling en controles;
- `main`: niet aanpassen of naar productie brengen zonder expliciete review/goedkeuring.

Vercel Preview kan featurebranches bouwen. Preview-, staging- en production-secrets moeten gescheiden blijven.

Niet aannemen dat een previewdeployment gelijkstaat aan staging: een verkoopklare stagingomgeving vereist ook een aparte database/secrets en mag geen productieklantdata gebruiken.

### Open blokkering

Op 2026-09-10 is geprobeerd een apart gratis Supabase-project voor AI Bedrijfsadministratie staging aan te maken. Supabase bevestigde een projectprijs van €0/maand, maar blokkeerde de creatie omdat het account de limiet van twee actieve gratis projecten bereikt had. Er is geen bestaand project gepauzeerd, verwijderd of geüpgraded. Dedicated cloud staging blijft daarom open.

## 6. Database en migrations

Databasewijzigingen horen versioned in `supabase/migrations/`.

Harde regels:
- geen handmatige productieschemawijziging buiten migrations;
- migrations eerst buiten productie uitvoeren;
- RLS en storage policies daar testen;
- pas daarna productie overwegen.

De lokale Restore Drill bouwt de database vanaf nul op met alle migrations. Tijdens de eerste uitvoering werd hierdoor een echte reproduceerbaarheidsfout ontdekt: twee migrationbestanden hadden dezelfde versie `20260902140500`. De currency-migration is op `bootstrap-v1` hernummerd naar `20260902140600`, waarna een verse lokale migration-run verder kon.

Dedicated cloud staging blijft niet bewezen wegens de gratis-projectlimiet hierboven.

## 7. Tenant- en securitymodel

Elke tenantgebonden kernentiteit hoort `company_id` te hebben. Toegang loopt via `company_members`, RLS, server-side autorisatie en een expliciete actieve bedrijfscontext. Documenten blijven privé en storage paths zijn company-scoped.

De actieve bedrijfscontext op `bootstrap-v1` gebruikt een server-side gevalideerde keuze en wordt niet afgeleid door stilletjes het eerste bedrijf te nemen. Gevoelige kernflows controleren de gekozen `company_id` opnieuw.

Bij securitycontrole minimaal proberen:
- gebruiker A leest/wijzigt company B;
- verkeerd `company_id`;
- verkeerd storage path;
- directe/oude documentlink;
- verlopen sessie;
- meerdere ondernemingen onder één gebruiker;
- gedeeltelijk mislukte upload + retry.

Cloud-stagingbewijs voor deze scenario's blijft een afzonderlijk open verkoopbewijs zolang dedicated staging niet beschikbaar is.

## 8. Data-eigendom en export

De repository bevat exports voor:
- bedrijfsgegevens;
- facturen;
- originele documenten.

Dit ondersteunt overdraagbaarheid van klantdata. Een export is niet hetzelfde als disaster recovery.

## 9. Backup en restore - bewezen lokale drill

De repository bevat `scripts/restore-drill.sh` en `.github/workflows/restore-drill.yml`.

De drill gebruikt uitsluitend synthetische data en bewijst het volgende:
1. een verse lokale Supabase-database kan uit de versioned migrations worden opgebouwd;
2. een synthetische tenant met bedrijf, membership, document, factuur, deadline en alert wordt aangemaakt;
3. een echt PostgreSQL custom-format data-backup wordt gemaakt van de app-owned tenanttabellen;
4. een origineel document wordt apart uit private Storage opgehaald en met SHA-256 gecontroleerd;
5. tenantdata en het originele storageobject worden bewust verwijderd;
6. de databasebackup wordt werkelijk teruggezet;
7. het originele bestand wordt op exact hetzelfde company-scoped storagepad teruggezet;
8. kernwaarden, relaties en de SHA-256 van het herstelde bestand worden opnieuw gecontroleerd.

Een succesvolle run eindigt met `RESTORE_DRILL_PASS`.

### Wat deze drill niet bewijst

Dit is bewust geen claim van volledige Supabase-cloud disaster recovery. Niet afgedekt zijn onder meer:
- restore van de volledige managed Supabase Auth-platformstate;
- een volledige cloudproject-snapshot of point-in-time restore;
- herstel na verlies van een complete Supabase-regio/account;
- production recovery met echte klantdata.

Voor commerciële overdracht moet een koper dit onderscheid kennen. Het lokale bewijs toont dat de app-owned operationele data en private originele documentbytes reproduceerbaar kunnen worden geback-upt en hersteld zonder productie te raken.

## 10. Accounts die bij verkoop moeten worden geïnventariseerd

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

## 11. Wat een koper vóór closing nog moet kunnen verifiëren

Minimaal:
1. schone installatie vanaf repository;
2. gescheiden cloud staging werkt;
3. migrations zijn reproduceerbaar;
4. tenant/RLS- en storage-isolatie zijn aantoonbaar groen;
5. 20-facturenflow werkt inclusief fouten en retries;
6. lokale app-data + private-original restore drill is groen en cloud recoverybeperkingen zijn bekend;
7. mobiel en desktop E2E zijn groen;
8. exports leveren de beloofde klantdata/originelen;
9. geen kritieke secrets of bekende kritieke securityproblemen;
10. operationele accounts, afhankelijkheden en kosten zijn geïnventariseerd.

De actuele status en prioriteit van deze punten staat in `SALE_READINESS.md`.

## 12. Wat niet stilzwijgend mag gebeuren

- Geen productie-Supabase aanpassen om een test sneller af te ronden.
- Geen bestaand LIFE/Vault/Trading Lab-project als AI Bedrijfsadministratie staging gebruiken.
- Geen betaalde dienst of upgrade activeren zonder expliciete beslissing.
- Geen productieklantdata gebruiken voor stagingtests wanneer synthetische data volstaat.
- Geen fiscale/juridische regel toevoegen zonder actuele officiële bron.
- Geen P0-verkoopblokkering als afgerond markeren zonder reproduceerbaar bewijs.
