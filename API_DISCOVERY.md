## Selected API
- Endpoint: `https://www.ausbildung.de/suche/?was=<keyword>&wo=<location>&beruf=<beruf>&from=<offset>`
- Method: `GET`
- Required headers:
  - `RSC: 1`
  - `Accept: text/x-component`
  - `Accept-Language: de-DE,de;q=0.9,en;q=0.8`
- Auth: None
- Pagination: `from` offset query parameter (increments by 20)
- Response type: Next.js App Router RSC stream (`text/x-component`) containing structured JSON payload with `searchResults.hits.primary`

### Available fields in `vacancyData` (sample)
- `corporationName`
- `vacancyPublicId`
- `slug`
- `title`
- `vacancyCount`
- `location`
- `relatedBranchesCount`
- `startsNoEarlierThan`
- `corporationLogo`
- `directApplicationOn`
- `subsidiaryLogo`
- `subsidiaryName`
- `inSpotlight`
- `corporationDisplayVacancyCounts`
- `professionTitle`
- `applicationOptions`
- `salesforceCategory`
- `nonEuFlow`
- `subsidiaryPublicId`
- `corporationPublicId`
- `corporationStarvingState`
- `validUntil`
- `expectedGraduation`
- `apprenticeshipType`
- `duration`
- `baBooking`

### Additional fields from `jobPostingClusterData`
- `id`
- `subsidiaryId`
- `professionId`
- `createdAt`
- `updatedAt`

### Additional metadata from `searchResults.meta`
- `vacanciesCount`
- `resultsCount`
- `cityName`
- `sessionLocation`
- `countryEntryPoint`
- `countryEntryCode`

### Existing actor fields (before rewrite)
- `title`
- `company`
- `location`
- `bundesland`
- `beruf`
- `ausbildungsart`
- `start_date`
- `date_posted`
- `description_html`
- `description_text`
- `salary`
- `job_type`
- `url`

### Missing/extra fields provided by selected endpoint
- Stable IDs (`vacancyPublicId`, `corporationPublicId`, `subsidiaryPublicId`)
- Branding/media (`corporationLogo`, `subsidiaryLogo`)
- Funnel/application hints (`applicationOptions`, `directApplicationOn`, `nonEuFlow`)
- Lifecycle fields (`validUntil`, `startsNoEarlierThan`, `expectedGraduation`, `duration`)
- Commercial flags (`inSpotlight`, `salesforceCategory`, `baBooking`, `corporationDisplayVacancyCounts`)
- Global result metadata (`resultsCount`, `vacanciesCount`, country/session context)

### Endpoint scoring
- Returns structured JSON payload in response body: +30
- Has >15 unique fields: +25
- No auth required: +20
- Supports pagination (`from` offset): +15
- Extends current output fields: +10

**Total score: 100/100**

## URLScan notes
- Public URLScan search was used to inspect existing scans for `ausbildung.de`.
- New scan submission from terminal required an API key in this environment.
- Endpoint discovery was completed using live response/network-style analysis from the site itself (RSC transport), then validated with multi-page requests.
