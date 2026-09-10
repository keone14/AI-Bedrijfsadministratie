# AI Bedrijfsadministratie - Operational Observability

Last reviewed: 2026-09-10
Branch: `bootstrap-v1`

## Doel

Deze laag geeft een toekomstige eigenaar basiszicht op operationele betrouwbaarheid zonder een externe analytics- of monitoringdienst te verplichten. De implementatie gebruikt alleen de bestaande PostgreSQL/Supabase-infrastructuur.

## Privacy en toegang

Operationele events staan in `private.operational_events`.

Bewust NIET opgeslagen:
- e-mailadres;
- IP-adres;
- user_id;
- bestandsnaam;
- documentinhoud;
- prompts;
- tokens/secrets.

De tabel is niet toegankelijk voor `anon` of `authenticated`. Alleen server-side `service_role` kan events schrijven en de metrics-snapshot opvragen.

Retentie: events ouder dan 30 dagen worden bij nieuwe writes verwijderd.

## Gemeten signalen

De basislaag kan meten:
- succesvolle en mislukte factuuruploads;
- upload success rate;
- gestarte, succesvolle en mislukte factuuruitlezingen;
- extraction success rate;
- gemiddelde verwerkingstijd uit `invoice_processing_jobs`;
- percentage nieuwe facturen dat nog review nodig heeft;
- aantal veldcorrecties;
- failed processing jobs;
- authorization-denied events op gevoelige flows;
- API-latency voor geïnstrumenteerde kernroutes;
- calculation errors zodra calculation-routes die eventcode gebruiken.

De eerste geïnstrumenteerde kernroutes zijn:
- `invoice_upload_finalize`;
- `invoice_extract`.

Dit is bewust een basislaag. Niet elke route wordt al gemeten en er is geen claim van externe 24/7 paging/alerting.

## Server-side functies

`record_operational_event(...)`
- alleen `service_role`;
- valideert eventtype, outcome, route key, latency en statuscode;
- schrijft alleen minimale operationele metadata.

`get_operational_metrics_snapshot(since_at)`
- alleen `service_role`;
- venster maximaal 30 dagen;
- combineert private events met bestaande betrouwbare job-, invoice- en correctietabellen.

## Automatisch bewijs

`.github/workflows/observability-drill.yml` voert `scripts/observability-drill.sh` uit op een verse lokale Supabase-stack.

De drill controleert:
1. private schema/table zijn niet toegankelijk voor browserrollen;
2. write- en snapshot-RPC zijn niet uitvoerbaar door `anon`/`authenticated`;
3. er staan geen expliciete privacygevoelige velden in de telemetrytabel;
4. 30-dagenretentie verwijdert een oud synthetisch event;
5. upload- en extraction success rates kloppen;
6. authorization-denied en calculation-error tellingen kloppen;
7. gemiddelde API-latency klopt;
8. de snapshot bevat failed jobs, gemiddelde processingtijd, reviewpercentage en correcties.

Een succesvolle run eindigt met `OBSERVABILITY_DRILL_PASS`.

## Operationeel gebruik

Een toekomstige beheerder kan de service-role-only snapshot via server-side tooling of een later beveiligd adminscherm uitlezen. Voeg geen publieke/admin-UI toe zonder aparte autorisatiebeslissing.

## Beperkingen

Deze basis monitoring bewijst niet:
- externe uptime monitoring;
- 24/7 alerts naar e-mail/Slack/pager;
- volledige tracing over alle routes;
- log shipping naar een externe SIEM;
- production incident response.

Die onderdelen zijn pas nodig wanneer het productvolume of de koper daar expliciet om vraagt. Ze mogen niet stilzwijgend kosten of privacyrisico toevoegen.
