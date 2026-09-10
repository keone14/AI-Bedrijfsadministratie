# AI Bedrijfsadministratie - Sale Readiness

Last reviewed: 2026-09-10  
Branch: `bootstrap-v1`

## Status

**NIET VERKOOPKLAAR**

De kern van V1 is duidelijk en de belangrijkste lokale quality-, bulk-, actieve-bedrijfscontext-, restore- en tenant-isolatiebewijzen zijn nu aanwezig. De grootste resterende verkoopblokkering is een echte, gescheiden cloud-stagingomgeving. Zonder die omgeving kunnen de laatste production-like RLS/storage- en volledige database-integratietests niet eerlijk als dedicated-stagingbewijs worden gemarkeerd.

Deze status is bewust streng. Verkoopklaar betekent hier: overdraagbaar, reproduceerbaar, aantoonbaar veilig en testbaar zonder kennis die alleen bij de huidige eigenaar zit.

## Wat een koper nu overneemt

### Product

V1 is gericht op Belgische zelfstandigen en kleine ondernemingen die weinig boekhoudkundige voorkennis hebben. De kernflow is:

`bedrijf instellen -> facturen uploaden -> uitlezen/categoriseren -> twijfelgevallen controleren -> dashboard bijwerken`

Belangrijke productprincipes:
- moeilijke administratie in gewone taal;
- geen fiscale of financiële waarheid uit vrije AI-output;
- bedragen traceerbaar naar brondata;
- onzekerheid zichtbaar maken;
- originele documenten bewaren;
- bedrijfsdata strikt per `company_id` scheiden;
- klantdata exporteerbaar houden.

### Technische stack

- Next.js + TypeScript
- React
- Supabase Auth, PostgreSQL, Storage en RLS
- Vercel voor webhosting/deployments
- Zod voor schema-validatie
- Playwright voor E2E-tests
- GitHub Actions voor CI, lokale Supabase Restore Drill en Tenant Isolation Drill

### Reeds overdraagbare onderdelen

- `.env.example` voor configuratie zonder echte secrets in de repository;
- versioned Supabase migrations die lokaal vanaf nul worden uitgevoerd in de Restore Drill en Tenant Isolation Drill;
- private documentflow en server-side documenttoegang;
- server-side beveiligde factuuracties;
- centrale actieve bedrijfscontext voor gebruikers met meerdere ondernemingen;
- exports voor bedrijfsgegevens, facturen en originele documenten;
- CI met dependency audit, typecheck, lint, production build en browser-E2E;
- exacte 20-facturen browserproef met gedeeltelijke fout + gerichte retry;
- responsive tests voor kernflows;
- reproduceerbare lokale backup/wis/restore-drill voor app-owned tenantdata en private originele documentbytes;
- reproduceerbare lokale tenant-isolatiedrill met twee echte synthetische Auth-sessies die cross-company reads/writes en private Storage-toegang probeert te doorbreken;
- bestaande Source of Truth voor product, UX, architectuur en Belgische regelbronnen.

## Harde verkoopblokkeringen

### P0 - Moet opgelost of aantoonbaar getest zijn vóór verkoopklaar

- [ ] **Dedicated cloud stagingomgeving beschikbaar** met gescheiden database/secrets en zonder productieklantdata. Op 2026-09-10 bevestigde Supabase €0/maand voor een extra project, maar creatie werd geblokkeerd door de limiet van twee actieve gratis projecten. Er is niets gepauzeerd, verwijderd of geüpgraded.
- [ ] **RLS/tenant-isolatie integration proof op dedicated staging**: lokaal is dit inmiddels reproduceerbaar groen met twee echte synthetische gebruikers, twee bedrijven en Auth/PostgREST. Gebruiker A en B zien hun eigen data, cross-company reads geven geen rijen terug, cross-company wijziging en documentregistratie worden geblokkeerd. Dedicated-stagingbewijs ontbreekt nog.
- [ ] **Storage-isolatie integration proof op dedicated staging**: lokaal is private Storage reproduceerbaar groen. Een gebruiker kan het eigen origineel downloaden, maar niet het origineel van het andere bedrijf, niet uploaden in het andere bedrijfspad en niet naar een niet-canoniek storagepad schrijven. Dedicated-stagingbewijs ontbreekt nog.
- [ ] **Volledige 20-facturen-flow op een schone dedicated stagingdatabase**, inclusief uploads, retries, duplicaten, correcties en dashboardupdate. De browserbulkflow is wel bewezen: exact 20 uploads werken zonder verlies en bij één fout wordt alleen het mislukte bestand opnieuw verstuurd.
- [x] **Backup + restore-test voor app-owned operationele data en private originele documenten**. GitHub Actions bouwt lokale Supabase vanaf nul, maakt een echte PostgreSQL-backup, wist synthetische tenantdata en het originele storageobject, herstelt beide en controleert kernwaarden plus SHA-256. Dit bewijst niet volledige managed Supabase cloud/Auth disaster recovery.
- [x] **Eenduidige actieve bedrijfscontext**. De gekozen onderneming wordt server-side tegen actieve memberships gevalideerd en gevoelige kernflows gebruiken expliciet de gekozen `company_id`; routes mogen niet stilletjes het eerste bedrijf kiezen.
- [ ] **Secrets-audit compleet voor commerciële overdracht**: de CI blokkeert bekende secretpatronen en production secrets horen niet in client/repository, maar vóór closing blijft een finale account- en secretrotatie/inventory nodig.
- [x] **Kritieke gebruikersfoutscenario's in browsertests**: verlopen sessie, tijdelijke bevestigingsfout, mislukte correctie en gedeeltelijke bulk-upload + gerichte retry hebben regressietests.

### P1 - Nodig voor professionele overdracht

- [ ] Installatie vanaf lege machine stap voor stap als koper-drill uitvoeren.
- [x] Vereiste environment variables gedocumenteerd zonder echte waarden/secrets (`.env.example`, README, HANDOVER).
- [x] Database migrations lokaal vanaf lege database reproduceerbaar. De Restore Drill ontdekte en corrigeerde bovendien een dubbele migrationversie (`20260902140500`).
- [ ] Deploymentprocedure van repository tot preview/dedicated staging documenteren en volledig testen.
- [ ] Basis monitoring/observability vastleggen: mislukte uploads, processing errors, unauthorized attempts en API-fouten.
- [ ] Rate limiting/abuse protection toevoegen waar gevoelige serverroutes dit nodig hebben, zonder onbetrouwbare in-memory serverless state.
- [ ] Retentie- en verwijderbeleid voor klantdata vastleggen.
- [ ] Licentie- en dependency-inventory controleren vóór commerciële overdracht.
- [ ] Bekende technische schuld en bekende beperkingen bijhouden in één overdraagbare lijst.

### P2 - Product completeness

- [ ] V1 Assistent veilig afronden of expliciet uit de verkoopbare V1-scope verwijderen via Source of Truth-besluit.
- [ ] Alleen officieel bevestigde Belgische deadlines activeren, met bron, geldigheid en laatste verificatiedatum.
- [ ] Finale toegankelijkheids- en responsive controle op 360, 390/430, 768-900, 1024 en 1440 px over alle kernpagina's.

## Actueel bewijs

### CI / browser

De normale GitHub Actions quality-gate draait op `bootstrap-v1` en controleert:
- obvious committed secret patterns;
- installatie en production dependency audit;
- TypeScript;
- lint;
- production build;
- Playwright desktop en mobiel.

De 20-facturenproef controleert exact 20 init-, storage-, finalize- en extractiestappen. Een aparte foutproef laat één factuur falen en bewijst dat succesvolle uploads behouden blijven en alleen de mislukte factuur opnieuw wordt verstuurd.

### Fresh database + restore

`Restore Drill` gebruikt lokale Supabase in GitHub Actions. Daardoor kan de repository zonder productie of betaald cloudproject aantonen dat migrations vanaf nul toepasbaar zijn en dat app-owned tenantdata plus een private origineel bestand daadwerkelijk hersteld kunnen worden na gesimuleerd verlies.

De eerste restore-run vond een echte releaseblokkering: twee migrations deelden dezelfde versie. Die fout is op `bootstrap-v1` gecorrigeerd door de currency-migration uniek te nummeren als `20260902140600`.

De drill is bewust beperkt. Hij bewijst geen volledige Supabase-cloudproject-, Auth- of regioherstelprocedure.

### Tenant + private Storage isolation

`Tenant Isolation Drill` gebruikt eveneens alleen lokale Supabase en volledig synthetische data. De drill bouwt de database vanaf nul op, maakt twee afzonderlijke gebruikers en bedrijven, meldt beide gebruikers via de echte lokale Auth API aan en test daarna via de echte lokale REST- en Storage-API's.

Op commit `d2eb4b174abe817bdd93024fa9b75d40de66e1d6` eindigde de drill groen met `TENANT_ISOLATION_PASS`: eigen data was toegankelijk, cross-company reads bleven leeg, cross-company writes werden geblokkeerd en private Storage weigerde toegang tot het andere bedrijf en niet-canonieke paden. Op dezelfde commit waren ook de normale quality-gate en Restore Drill groen.

Dit is sterk lokaal regressiebewijs voor de huidige migrations en policies, maar blijft bewust onderscheiden van een dedicated cloud-stagingtest. Omgevingsconfiguratie, cloudprojectinstellingen en deploymentsecrets worden hierdoor niet bewezen.

## Handover checklist voor een koper

Een overdracht is pas professioneel wanneer de nieuwe eigenaar zonder mondelinge kennis van de huidige eigenaar kan bepalen:

- welke GitHub repository en branches relevant zijn;
- welke branch productie vertegenwoordigt;
- welke Supabase projecten development/staging/production zijn;
- welke Vercel projecten en environments bestaan;
- welke environment variables vereist zijn;
- hoe migrations worden toegepast en terug gecontroleerd;
- hoe CI, E2E, Restore Drill en Tenant Isolation Drill worden uitgevoerd;
- wat de restore- en tenant-isolatiedrills wel en niet bewijzen;
- hoe exports werken;
- waar officiële Belgische regelbronnen worden bijgehouden;
- welke functies V1 bewust niet uitvoert;
- welke accounts/diensten bij verkoop moeten worden overgedragen of opnieuw gekoppeld;
- welke terugkerende operationele kosten kunnen ontstaan bij schaal, zonder die kosten als nul te veronderstellen.

## Geen verborgen afhankelijkheid van de huidige eigenaar

Voor verkoop moet elk onderdeel dat nu afhangt van een persoonlijk account, persoonlijke configuratie of handmatige kennis worden geïdentificeerd. Een koper moet accounts veilig kunnen overnemen of opnieuw koppelen zonder secrets in code of documentatie te zetten.

Nooit in deze repository opnemen:
- wachtwoorden;
- API keys;
- service-role secrets;
- herstelcodes;
- persoonlijke tokens;
- productieklantdata.

## Criteria om status te verhogen

### BIJNA VERKOOPKLAAR

Pas gebruiken wanneer alle P0-punten technisch zijn bewezen en de belangrijkste P1-overdrachtsdocumentatie bestaat.

### VERKOOPKLAAR

Pas gebruiken wanneer:
- V1-kernflows reproduceerbaar werken;
- kritieke security- en tenant-tests aantoonbaar groen zijn;
- dedicated staging bestaat;
- backup én restore binnen de afgesproken scope getest zijn en resterende cloud-recoveryrisico's expliciet zijn;
- deployment en migrations reproduceerbaar zijn;
- koper-facing handoverdocumentatie voldoende is;
- bekende kritieke securityproblemen ontbreken;
- operationele afhankelijkheden en kosten inzichtelijk zijn;
- er geen essentiële kennis alleen in het hoofd van de huidige eigenaar zit.

## Regel voor toekomstige improvement runs

Prioriteer voortaan niet op het aantal nieuwe functies maar op de grootste combinatie van:
1. verkoopblokkering;
2. security/data-risico;
3. gebruikersimpact;
4. betrouwbaarheid;
5. overdraagbaarheid;
6. technische schuld;
7. inspanning.

Als een cosmetische verbetering concurreert met een open P0-blokkering, krijgt de P0-blokkering voorrang.
