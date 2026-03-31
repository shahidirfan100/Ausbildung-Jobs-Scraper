# Ausbildung.de Jobs Scraper

Extract apprenticeship and vocational training listings from Ausbildung.de with rich, structured output for analysis, monitoring, and automation. Collect job titles, companies, locations, application details, timelines, and stable IDs in one dataset. Built for reliable large-scale job data collection with clean, deduplicated records.

---

## Features

- **Rich Job Records** — Collect listing information, company metadata, training type, and timeline details.
- **Duplicate-Safe Output** — Automatically keeps unique job entries using stable identifiers.
- **Clean Dataset Quality** — Excludes empty values from output so records are easier to use downstream.
- **Flexible Search Inputs** — Run by keyword, location, profession, or full search URL.
- **Scalable Collection** — Control volume with result and page limits to fit quick tests or larger runs.
- **Proxy Ready** — Works with proxy configuration for stable, repeatable data collection.

---

## Use Cases

### Job Market Intelligence
Track apprenticeship and dual-study opportunities across companies and locations. Build recurring snapshots to monitor hiring trends over time.

### Career Platform Aggregation
Feed clean Ausbildung.de listings into internal job portals, newsletter workflows, or recommendation engines.

### Education and Training Research
Analyze training types, expected graduation requirements, and start timelines to understand evolving vocational pathways.

### Recruitment Benchmarking
Compare company-level hiring activity with identifiers and vacancy volume indicators to benchmark talent demand.

### Data Pipelines and BI
Export structured records into analytics systems for dashboards, alerts, and automated reporting.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | — | Start from a specific Ausbildung.de search URL. If provided, this overrides keyword/location/beruf construction. |
| `keyword` | String | No | — | Search keyword, for example `Fachinformatiker`. |
| `location` | String | No | — | Target city or location, for example `Berlin`. |
| `beruf` | String | No | — | Profession/job-type filter value. |
| `collectDetails` | Boolean | No | `true` | Compatibility input kept for existing workflows. |
| `results_wanted` | Integer | No | `100` | Maximum number of unique listings to save. |
| `max_pages` | Integer | No | `50` | Maximum number of result pages to process. |
| `proxyConfiguration` | Object | No | `{ "useApifyProxy": true }` | Proxy setup for improved reliability. |

---

## Output Data

Each dataset item contains core job fields and extended listing metadata.

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Listing title. |
| `company` | String | Company or subsidiary name. |
| `location` | String | City/location shown in listing. |
| `beruf` | String | Profession title/category. |
| `ausbildungsart` | String | Apprenticeship or training type. |
| `start_date` | String | Earliest known start date. |
| `description_html` | String | HTML job description extracted from JobPosting schema on the detail page. |
| `description_text` | String | Plain-text description derived from `description_html`. |
| `url` | String | Canonical listing URL. |
| `vacancy_public_id` | String | Stable listing identifier. |
| `vacancy_slug` | String | Listing slug. |
| `vacancy_count` | Number | Vacancy count marker from source record. |
| `related_branches_count` | Number | Related branch count indicator. |
| `corporation_name` | String | Corporation name from listing metadata. |
| `corporation_public_id` | String | Stable corporation identifier. |
| `corporation_logo` | String | Corporation logo URL. |
| `corporation_starving_state` | Number | Corporation state flag. |
| `corporation_display_vacancy_counts` | Boolean | Whether vacancy counts are displayed. |
| `subsidiary_name` | String | Subsidiary name. |
| `subsidiary_public_id` | String | Stable subsidiary identifier. |
| `subsidiary_logo` | String | Subsidiary logo URL. |
| `direct_application_on` | Boolean | Indicates direct application availability. |
| `application_options` | String | Application option mode. |
| `apprenticeship_type` | String | Detailed apprenticeship type code. |
| `profession_title` | String | Detailed profession label. |
| `salesforce_category` | String | Category label attached to listing. |
| `expected_graduation` | String | Expected graduation requirement. |
| `duration` | String | Program duration text. |
| `valid_until` | String | Valid-until date if available. |
| `in_spotlight` | Boolean | Spotlight/promoted indicator. |
| `non_eu_flow` | Number | Non-EU flow marker. |
| `ba_booking` | String | Booking state marker. |
| `cluster_id` | Number | Cluster identifier. |
| `cluster_subsidiary_id` | Number | Cluster subsidiary ID. |
| `cluster_profession_id` | Number | Cluster profession ID. |
| `cluster_created_at` | String | Cluster creation timestamp. |
| `cluster_updated_at` | String | Cluster update timestamp. |
| `meta_results_count` | Number | Total results indicator from current response metadata. |
| `meta_vacancies_count` | Number | Total vacancies indicator from current response metadata. |
| `meta_city_name` | String | Metadata city value when present. |
| `meta_session_location` | Boolean | Session location flag. |
| `meta_country_entry_point` | String | Country entry point value. |
| `meta_country_entry_code` | String | Country entry code. |

---

## Usage Examples

### Basic Keyword Search

```json
{
  "keyword": "Fachinformatiker",
  "location": "Berlin",
  "results_wanted": 20
}
```

### Profession-Focused Collection

```json
{
  "keyword": "Ausbildung",
  "location": "Hamburg",
  "beruf": "informatik",
  "results_wanted": 100,
  "max_pages": 10
}
```

### Start From Custom Search URL

```json
{
  "startUrl": "https://www.ausbildung.de/suche/?was=fachinformatiker&wo=berlin",
  "results_wanted": 50,
  "max_pages": 8,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

---

## Sample Output

```json
{
  "title": "Duales Studium BWL Sales Management | Peak One GmbH",
  "company": "iba Internationale Berufsakademie",
  "location": "Hamburg",
  "beruf": "Duales Studium BWL",
  "ausbildungsart": "duales-studium",
  "start_date": "2026-04-01",
  "url": "https://www.ausbildung.de/stellen/duales-studium-bwl-sales-management-peak-one-gmbh-bei-iba-internationale-berufsakademie-in-hamburg-5a6f712e-b21b-4236-8e59-4a02ae086b44/",
  "vacancy_public_id": "5a6f712e-b21b-4236-8e59-4a02ae086b44",
  "vacancy_slug": "duales-studium-bwl-sales-management-peak-one-gmbh-bei-iba-internationale-berufsakademie-in-hamburg-5a6f712e-b21b-4236-8e59-4a02ae086b44",
  "vacancy_count": 856,
  "related_branches_count": 311,
  "corporation_name": "iba Internationale Berufsakademie",
  "corporation_public_id": "7a077aae-996c-43de-b923-29bc8a4a79d5",
  "corporation_logo": "https://www.ausbildung.de/uploads/image/17/17fa40f4-8cb8-4f23-a492-59ae7706b77d/iba_Logo_auf_wei%C3%9F_RGB.png",
  "subsidiary_name": "iba Internationale Berufsakademie",
  "subsidiary_public_id": "51ba5881-21bc-4d96-8c0a-8f3c3c3ab214",
  "direct_application_on": false,
  "application_options": "online",
  "apprenticeship_type": "duales-studium",
  "profession_title": "Duales Studium BWL",
  "salesforce_category": "A+",
  "expected_graduation": "fachabitur",
  "duration": "3 Jahre",
  "in_spotlight": false,
  "non_eu_flow": 1,
  "ba_booking": "FALSE",
  "cluster_id": 2464,
  "cluster_subsidiary_id": 9030,
  "cluster_profession_id": 668,
  "cluster_created_at": "2020-08-31T18:03:11.999Z",
  "cluster_updated_at": "2020-08-31T18:03:11.999Z",
  "meta_results_count": 10000,
  "meta_vacancies_count": 113270,
  "meta_session_location": false,
  "meta_country_entry_point": "Pakistan",
  "meta_country_entry_code": "PK"
}
```

---

## Tips For Best Results

### Start Small, Then Scale
- Use `results_wanted: 20` for quick validation runs.
- Increase volume only after validating output quality.

### Use Targeted Queries
- Combine `keyword` and `location` for tighter result relevance.
- Add `beruf` when you need profession-specific datasets.

### Control Runtime
- Use `max_pages` to keep run duration predictable.
- Prefer multiple focused runs over one oversized broad run.

### Improve Stability
- Enable proxies for large collections and repeated schedules.
- If results repeat heavily, lower `max_pages` and run more targeted filters.

---

## Integrations

- **Google Sheets** — Build shareable reporting sheets quickly.
- **Airtable** — Maintain searchable apprenticeship databases.
- **Make** — Automate enrichment and routing workflows.
- **Zapier** — Trigger actions in CRM, messaging, and analytics tools.
- **Webhooks** — Push fresh dataset items into your own systems.

### Export Formats

- **JSON** — Best for APIs and backend pipelines.
- **CSV** — Ideal for spreadsheets and BI tools.
- **Excel** — Useful for business handoff and reporting.
- **XML** — Helpful for system-to-system data exchange.

---

## Frequently Asked Questions

### How many listings can I collect?
You can collect as many as available within your `results_wanted` and `max_pages` limits.

### Are duplicates automatically removed?
Yes. The actor keeps unique records using stable listing identifiers.

### Why are some fields missing in an item?
Some listings simply do not provide every optional attribute. Empty values are omitted from the output.

### Can I run from a pre-filtered URL?
Yes. Provide `startUrl` to start from a specific Ausbildung.de search page.

### Can I schedule regular monitoring runs?
Yes. Use Apify schedules and export targets to track changes over time.

---

## Support

For issues or feature requests, use the Apify Console issue and support channels.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Scheduling](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for legitimate data collection workflows. You are responsible for complying with applicable laws, platform terms, and internal data governance policies.
