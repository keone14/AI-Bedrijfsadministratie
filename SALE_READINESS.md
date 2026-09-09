# AI Bedrijfsadministratie - Sale Readiness

Last reviewed: 2026-09-09  
Branch: `bootstrap-v1`  
Reviewed commit before this document: `953bef80c7da2b7bf227472bfb3d11a88b039c14`

## Status

**NIET VERKOOPKLAAR**

De kern van V1 is duidelijk en meerdere veiligheids- en betrouwbaarheidsmaatregelen zijn aanwezig, maar een koper mag het product nog niet als technisch afgerond beschouwen. De belangrijkste ontbrekende bewijzen zijn staging, echte tenant/RLS-integratietests, de volledige 20-facturenflow, restore-testing en een eenduidige actieve bedrijfscontext.

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
- GitHub Actions voor CI

### Reeds zichtbare overdraagbare onderdelen

- `.env.example` voor configuratie zonder echte secrets in de repository;
- versioned Supabase migrations;
- private documentflow en server-side documenttoegang;
- server-side beveiligde factuuracties;
- exports voor bedrijfsgegevens, facturen en originele documenten;
- CI met dependency audit, typecheck, lint, production build en browser-E2E;
- responsive tests voor kernflows;
- bestaande Source of Truth voor product, UX, architectuur en Belgische regelbronnen.

## Harde verkoopblokkeringen

### P0 - Moet opgelost of aantoonbaar getest zijn vóór verkoopklaar

- [ ] **Stagingomgeving beschikbaar** met gescheiden database/secrets en zonder productieklantdata.
- [ ] **RLS/tenant-isolatie integratietests**: gebruiker A kan data van bedrijf B nooit lezen, wijzigen of downloaden.
- [ ] **Storage-isolatie getest**: verkeerd `company_id`, verkeerd storage path en directe document-URL geven nooit cross-company toegang.
- [ ] **Volledige 20-facturen-E2E** op een schone stagingdatabase, inclusief mislukte uploads, retries, duplicaten, correcties en dashboardupdate.
- [ ] **Backup + restore-test** uitgevoerd. Alleen een download/export of backup hebben telt niet als herstelbewijs.
- [ ] **Eenduidige actieve bedrijfscontext** voor gebruikers met meerdere ondernemingen. Geen route mag stilletjes het eerste bedrijf kiezen.
- [ ] **Secrets-audit**: geen productiegeheim in client, repository, logs of testfixtures.
- [ ] **Kritieke foutscenario's** getest: verlopen sessie, databasefout, storagefout, gedeeltelijke upload en retry.

### P1 - Nodig voor professionele overdracht

- [ ] Installatie vanaf lege machine stap voor stap reproduceren.
- [ ] Alle vereiste environment variables documenteren zonder waarden/secrets.
- [ ] Database migrations vanaf lege stagingdatabase volledig reproduceerbaar maken.
- [ ] Deploymentprocedure van repository tot preview/staging documenteren en testen.
- [ ] Basis monitoring/observability vastleggen: mislukte uploads, processing errors, unauthorized attempts en API-fouten.
- [ ] Rate limiting/abuse protection toevoegen waar gevoelige serverroutes dit nodig hebben, zonder onbetrouwbare in-memory serverless state.
- [ ] Retentie- en verwijderbeleid voor klantdata vastleggen.
- [ ] Licentie- en dependency-inventory controleren vóór commerciële overdracht.
- [ ] Bekende technische schuld en bekende beperkingen bijhouden in één overdraagbare lijst.

### P2 - Product completeness

- [ ] V1 Assistent veilig afronden of expliciet uit de verkoopbare V1-scope verwijderen via Source of Truth-besluit.
- [ ] Alleen officieel bevestigde Belgische deadlines activeren, met bron, geldigheid en laatste verificatiedatum.
- [ ] Eindcontrole toegankelijkheid en responsive gedrag op 360, 390/430, 768-900, 1024 en 1440 px.

## Bewijs dat al aanwezig is

Op commit `953bef80c7da2b7bf227472bfb3d11a88b039c14` is de GitHub Actions CI-run succesvol afgerond. Dat is positief bewijs voor de huidige codekwaliteit, maar het vervangt geen echte staging-, RLS-, restore- of bulk-integratietests.

De repository bevat daarnaast serverroutes voor exports van:
- bedrijfsgegevens;
- facturen;
- originele documenten.

Dat ondersteunt data-eigendom en verlaagt lock-in, maar de exportflow is geen volledige disaster-recoveryprocedure.

## Handover checklist voor een koper

Een overdracht is pas professioneel wanneer de nieuwe eigenaar zonder mondelinge kennis van de huidige eigenaar kan bepalen:

- welke GitHub repository en branches relevant zijn;
- welke branch productie vertegenwoordigt;
- welke Supabase projecten development/staging/production zijn;
- welke Vercel projecten en environments bestaan;
- welke environment variables vereist zijn;
- hoe migrations worden toegepast en terug gecontroleerd;
- hoe CI en E2E worden uitgevoerd;
- hoe backups worden gemaakt en teruggezet;
- hoe tenant-isolatie wordt getest;
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
- staging bestaat;
- backup én restore getest zijn;
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