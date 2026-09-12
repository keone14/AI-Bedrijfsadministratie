# AI Bedrijfsadministratie - Transfer Checklist

Last reviewed: 2026-09-10
Branch: `bootstrap-v1`

Dit document is bedoeld voor de praktische overdracht van AI Bedrijfsadministratie aan een koper. Het bevat bewust geen wachtwoorden, tokens, API keys, herstelcodes of productieklantdata.

## 1. GitHub

Vastleggen voor closing:
- repository: `keone14/AI-Bedrijfsadministratie`;
- ontwikkelbranch: `bootstrap-v1`;
- welke branch op closing productie wordt;
- repository ownership of collaborator access overdragen;
- na overdracht oude persoonlijke toegang verwijderen;
- branch protection / required checks configureren op de uiteindelijke releasebranch;
- bevestigen dat CI, Security Drill, Tenant Isolation Drill, Restore Drill en Observability Drill groen zijn op de overgedragen releasecommit.

De huidige `bootstrap-v1` branch is niet beschermd. Dit moet vóór of tijdens de definitieve overdracht bewust worden ingericht op de branch die de koper als releasebranch gebruikt.

## 2. Vercel

Vastleggen:
- exact project dat bij AI Bedrijfsadministratie hoort;
- huidige eigenaar/team;
- productie- en previewdomains;
- gekoppelde GitHub repository;
- production/preview environment variables per naam, nooit de waarde in GitHub;
- welke variabelen de koper opnieuw moet instellen;
- project ownership/team access overdragen of project opnieuw koppelen onder koperaccount;
- na succesvolle overdracht oude persoonlijke toegang intrekken.

Bekende huidige beperking: de Hobby/free build-rate-limit kan preview builds tijdelijk blokkeren. Hiervoor mag niet stilzwijgend naar Pro worden geüpgraded.

## 3. Supabase

Voor de uiteindelijke AI Bedrijfsadministratie-omgeving vastleggen:
- projectnaam en project ref;
- regio;
- environment: staging of production;
- project owner/organization;
- Auth-configuratie;
- gebruikte Storage buckets;
- database migrations-versie;
- welke keys opnieuw moeten worden ingesteld in Vercel;
- backup/recoveryprocedure en bekende beperkingen.

Nooit een service-role key aan een koper geven via repository, chatlog of document. Bij ownershipwijziging keys veilig roteren en alleen via de secret/configuratie-interface van de gebruikte diensten instellen.

Dedicated cloud staging is nog niet beschikbaar door de huidige limiet van twee actieve gratis Supabase-projecten. De lokale Supabase drills vervangen dat cloud-stagingbewijs niet.

## 4. Environment variables

De koper moet minimaal de namen uit `.env.example` nalopen. Per variable documenteren:
- doel;
- development/preview/production;
- verplicht of optioneel;
- wie de nieuwe waarde genereert;
- waar de waarde veilig wordt ingesteld.

Belangrijk:
- `SUPABASE_SERVICE_ROLE_KEY` uitsluitend server-side;
- externe AI-provider blijft optioneel;
- fixture mode uitsluitend development/staging en nooit Vercel production;
- oude secrets na overdracht roteren.

## 5. Domein en DNS

Indien een custom domein wordt gebruikt:
- registrar identificeren;
- eigendom van het domein overdragen of koper als beheerder toevoegen;
- DNS-records documenteren;
- Vercel domain-koppeling opnieuw bevestigen;
- SSL/HTTPS na overdracht controleren;
- oude persoonlijke registrar- of DNS-toegang verwijderen.

Als er nog geen apart verkoopdomein is, dit expliciet als `niet van toepassing / nog te bepalen` registreren in plaats van iets te veronderstellen.

## 6. AI-provider

Een externe AI-provider is niet vereist om de gratis synthetische testflow te draaien.

Als een koper externe factuuruitlezing activeert:
- eigen provideraccount gebruiken;
- eigen API-key genereren;
- model/configuratie expliciet documenteren;
- kosten en gebruikslimieten zelf bevestigen;
- klantdata- en privacyvoorwaarden beoordelen;
- geen persoonlijke API-key van de verkoper hergebruiken.

## 7. Data en privacy

Voor closing controleren:
- er zit geen productieklantdata in repository, fixtures of documentatie;
- exports van bedrijfsgegevens, facturen en originelen werken;
- telemetry bevat geen documentinhoud, prompts, e-mailadressen of IP-adressen;
- telemetryretentie staat op maximaal 30 dagen volgens de huidige observability-implementatie;
- retentie- en verwijderbeleid voor echte klantdata is als apart open punt afgehandeld vóór commerciële livegang.

## 8. Releasebewijs dat bij de overdracht hoort

De koper moet voor de gekozen releasecommit kunnen verifiëren:
- production dependency audit;
- TypeScript;
- lint;
- production build;
- Playwright desktop en mobiel;
- 20-facturen bulk + gerichte retry;
- Dashboard responsive checks op 360, 390, 430, 768, 900, 1024 en 1440 px;
- Tenant Isolation Drill;
- Security Drill;
- Restore Drill;
- Observability Drill.

Een groene lokale/CI release is geen vervanging voor een dedicated cloud-stagingtest.

## 9. Kosteninventaris

Voor closing per externe dienst aangeven:
- huidige plannaam;
- huidige bekende vaste maandkost;
- variabele kosten of limieten;
- welke kosten pas ontstaan bij schaal of activatie.

Nooit een toekomstige kost als gegarandeerd nul presenteren wanneer dit niet door de provider bevestigd is.

Momenteel wordt het product bewust binnen gratis infrastructuur ontwikkeld. Een betaalde upgrade mag niet stilzwijgend onderdeel van de overdracht worden.

## 10. Closing-volgorde

Aanbevolen praktische volgorde:
1. koper krijgt repository read/review toegang;
2. koper verifieert documentatie en groene releasechecks;
3. koper maakt of ontvangt eigen Vercel/Supabase/provider-toegang;
4. environment variables worden onder koperbeheer opnieuw ingesteld;
5. domein/DNS wordt overgedragen indien van toepassing;
6. cloud-staging en production-like smoke tests worden uitgevoerd;
7. pas daarna productieownership omschakelen;
8. secrets roteren;
9. verkopersaccounts/toegang verwijderen;
10. overdracht schriftelijk als voltooid registreren.

## 11. Wat de verkoper niet moet overdragen

Niet delen:
- persoonlijke wachtwoorden;
- persoonlijke recovery codes;
- volledige account-sessies;
- persoonlijke GitHub/Vercel/Supabase login;
- bestaande privé API keys als een koper zelf een key kan aanmaken;
- productieklantdata buiten een noodzakelijke, rechtmatige overdrachtsprocedure.

De voorkeur is altijd ownership/access gecontroleerd overdragen en daarna secrets roteren, niet persoonlijke accounts delen.
