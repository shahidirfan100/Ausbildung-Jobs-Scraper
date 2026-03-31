import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

const BASE_URL = 'https://www.ausbildung.de';
const SEARCH_URL = `${BASE_URL}/suche/`;
const PAGE_SIZE = 20;
const DETAIL_CONCURRENCY = 12;
const PUSH_BATCH_SIZE = 250;

const toPositiveInt = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return fallback;
    return Math.floor(n);
};

const sanitizeValue = (value) => {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }

    if (Array.isArray(value)) {
        const arr = value.map(sanitizeValue).filter((v) => v !== undefined);
        return arr.length ? arr : undefined;
    }

    if (typeof value === 'object') {
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            const cleaned = sanitizeValue(val);
            if (cleaned !== undefined) out[key] = cleaned;
        }
        return Object.keys(out).length ? out : undefined;
    }

    return value;
};

const decodeHtmlEntities = (value) => {
    if (typeof value !== 'string' || !value) return value;

    const namedEntities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>',
    };

    return value
        .replace(/&nbsp;|&amp;|&quot;|&#39;|&apos;|&lt;|&gt;/g, (match) => namedEntities[match] || match)
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
};

const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ensureHtmlDescription = (value) => {
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    if (!trimmed) return undefined;

    if (/<\/?[a-z][^>]*>/i.test(trimmed)) return trimmed;

    const decoded = decodeHtmlEntities(trimmed).replace(/\r\n/g, '\n');
    const paragraphs = decoded
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br/>')}</p>`);

    return paragraphs.length ? paragraphs.join('') : undefined;
};

const htmlToText = (html) => {
    if (typeof html !== 'string' || !html.trim()) return undefined;

    const withBreaks = html
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|ul|ol|h1|h2|h3|h4|h5|h6)>/gi, '\n');

    const noTags = withBreaks.replace(/<[^>]+>/g, ' ');

    return decodeHtmlEntities(noTags)
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .replace(/ *\n */g, '\n')
        .trim() || undefined;
};

const isJobPostingType = (value) => {
    if (typeof value === 'string') return value === 'JobPosting';
    if (Array.isArray(value)) return value.includes('JobPosting');
    return false;
};

const findJobPostingJsonLd = (html) => {
    if (typeof html !== 'string' || !html) return null;

    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        const jsonText = match[1]?.trim();
        if (!jsonText) continue;

        try {
            const parsed = JSON.parse(jsonText);
            const items = Array.isArray(parsed) ? parsed : [parsed];

            for (const item of items) {
                if (item && typeof item === 'object' && isJobPostingType(item['@type'])) {
                    return item;
                }
            }
        } catch {
            // Ignore malformed blocks and continue scanning.
        }
    }

    return null;
};

const getStartUrl = ({ startUrl, startUrls, url, keyword = '', location = '', beruf = '' }) => {
    if (typeof startUrl === 'string' && startUrl.trim()) return startUrl.trim();
    if (typeof url === 'string' && url.trim()) return url.trim();

    if (Array.isArray(startUrls)) {
        for (const item of startUrls) {
            if (typeof item === 'string' && item.trim()) return item.trim();
            if (item && typeof item.url === 'string' && item.url.trim()) return item.url.trim();
        }
    }

    const search = new URL(SEARCH_URL);
    if (keyword) search.searchParams.set('was', keyword);
    if (location) search.searchParams.set('wo', location);
    if (beruf) search.searchParams.set('beruf', beruf);
    return search.href;
};

const getInitialOffset = (baseUrl) => {
    const parsed = new URL(baseUrl, BASE_URL);

    const fromValue = Number(parsed.searchParams.get('from'));
    if (Number.isFinite(fromValue) && fromValue >= 0) {
        return Math.floor(fromValue);
    }

    const pageValue = Number(parsed.searchParams.get('page'));
    if (Number.isFinite(pageValue) && pageValue > 1) {
        return (Math.floor(pageValue) - 1) * PAGE_SIZE;
    }

    return 0;
};

const buildPageUrl = (baseUrl, from, keyword, location, beruf) => {
    const parsed = new URL(baseUrl, BASE_URL);
    if (!parsed.searchParams.has('was') && keyword) parsed.searchParams.set('was', keyword);
    if (!parsed.searchParams.has('wo') && location) parsed.searchParams.set('wo', location);
    if (!parsed.searchParams.has('beruf') && beruf) parsed.searchParams.set('beruf', beruf);
    parsed.searchParams.delete('page');
    parsed.searchParams.set('from', String(from));
    return parsed.href;
};

const createDedupKey = (hit) => {
    const vacancy = hit?.vacancyData || {};
    const cluster = hit?.jobPostingClusterData || {};

    return (
        vacancy.vacancyPublicId
        || vacancy.slug
        || (vacancy.title && vacancy.corporationName ? `${vacancy.title}::${vacancy.corporationName}` : null)
        || (cluster.id ? String(cluster.id) : null)
    );
};

const toJobUrl = (slug) => {
    if (!slug || typeof slug !== 'string') return undefined;
    const cleaned = slug.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!cleaned) return undefined;
    if (cleaned.startsWith('stellen/')) return `${BASE_URL}/${cleaned}/`;
    return `${BASE_URL}/stellen/${cleaned}/`;
};

// Next.js RSC payload embeds a JSON object for search results inside stream chunks.
const extractRscSearchPayload = (body) => {
    const marker = '"searchType":"default"';
    const markerIdx = body.indexOf(marker);
    if (markerIdx === -1) return null;

    const start = body.lastIndexOf('{', markerIdx);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < body.length; i++) {
        const ch = body[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{') {
            depth++;
            continue;
        }

        if (ch === '}') {
            depth--;
            if (depth === 0) {
                const jsonText = body.slice(start, i + 1);
                try {
                    return JSON.parse(jsonText);
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
};

const mapHit = (hit, meta = {}, detail = {}) => {
    const vacancy = hit?.vacancyData || {};
    const cluster = hit?.jobPostingClusterData || {};

    return {
        title: vacancy.title,
        company: vacancy.corporationName || vacancy.subsidiaryName,
        location: vacancy.location,
        beruf: vacancy.professionTitle,
        ausbildungsart: vacancy.apprenticeshipType,
        start_date: vacancy.startsNoEarlierThan,
        bundesland: detail.bundesland,
        date_posted: detail.datePosted,
        description_html: detail.descriptionHtml,
        description_text: detail.descriptionText,
        salary: detail.salary,
        job_type: detail.jobType,
        url: toJobUrl(vacancy.slug),
        vacancy_public_id: vacancy.vacancyPublicId,
        vacancy_slug: vacancy.slug,
        vacancy_count: vacancy.vacancyCount,
        related_branches_count: vacancy.relatedBranchesCount,
        corporation_name: vacancy.corporationName,
        corporation_public_id: vacancy.corporationPublicId,
        corporation_logo: vacancy.corporationLogo,
        corporation_starving_state: vacancy.corporationStarvingState,
        corporation_display_vacancy_counts: vacancy.corporationDisplayVacancyCounts,
        subsidiary_name: vacancy.subsidiaryName,
        subsidiary_public_id: vacancy.subsidiaryPublicId,
        subsidiary_logo: vacancy.subsidiaryLogo,
        direct_application_on: vacancy.directApplicationOn,
        application_options: vacancy.applicationOptions,
        apprenticeship_type: vacancy.apprenticeshipType,
        profession_title: vacancy.professionTitle,
        salesforce_category: vacancy.salesforceCategory,
        expected_graduation: vacancy.expectedGraduation,
        duration: vacancy.duration,
        valid_until: vacancy.validUntil,
        in_spotlight: vacancy.inSpotlight,
        non_eu_flow: vacancy.nonEuFlow,
        ba_booking: vacancy.baBooking,
        cluster_id: cluster.id,
        cluster_subsidiary_id: cluster.subsidiaryId,
        cluster_profession_id: cluster.professionId,
        cluster_created_at: cluster.createdAt,
        cluster_updated_at: cluster.updatedAt,
        meta_results_count: meta.resultsCount,
        meta_vacancies_count: meta.vacanciesCount,
        meta_city_name: meta.cityName,
        meta_session_location: meta.sessionLocation,
        meta_country_entry_point: meta.countryEntryPoint,
        meta_country_entry_code: meta.countryEntryCode,
    };
};

const fetchDetailFields = async (jobUrl, proxyConfiguration, cache) => {
    if (!jobUrl) return {};
    if (cache.has(jobUrl)) return cache.get(jobUrl);

    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;

    try {
        const response = await gotScraping.get(jobUrl, {
            proxyUrl,
            timeout: { request: 30000 },
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
            },
        });

        const jobPosting = findJobPostingJsonLd(String(response.body));
        if (!jobPosting) {
            cache.set(jobUrl, {});
            return {};
        }

        const descriptionSource = sanitizeValue(jobPosting.description);
        const descriptionHtml = sanitizeValue(ensureHtmlDescription(descriptionSource));
        const salaryValue = jobPosting?.baseSalary?.value?.value ?? jobPosting?.baseSalary?.value ?? jobPosting?.baseSalary;

        const details = sanitizeValue({
            descriptionHtml,
            descriptionText: htmlToText(descriptionHtml || descriptionSource),
            datePosted: jobPosting.datePosted,
            jobType: Array.isArray(jobPosting.employmentType) ? jobPosting.employmentType.join(', ') : jobPosting.employmentType,
            salary: typeof salaryValue === 'number' || typeof salaryValue === 'string' ? String(salaryValue) : undefined,
            bundesland: jobPosting?.jobLocation?.address?.addressRegion,
        }) || {};

        cache.set(jobUrl, details);
        return details;
    } catch (error) {
        log.debug(`Detail enrichment failed for ${jobUrl}: ${error.message}`);
        cache.set(jobUrl, {});
        return {};
    }
};

const fetchRscResults = async (url, proxyConfiguration) => {
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;

    const response = await gotScraping.get(url, {
        proxyUrl,
        timeout: { request: 30000 },
        headers: {
            'RSC': '1',
            'Accept': 'text/x-component',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        },
    });

    const payload = extractRscSearchPayload(String(response.body));
    if (!payload) return { hits: [], meta: {} };

    const searchResults = payload.searchResults || {};
    return {
        hits: Array.isArray(searchResults?.hits?.primary) ? searchResults.hits.primary : [],
        meta: searchResults?.meta || {},
    };
};

const mapInBatches = async (items, concurrency, mapper) => {
    const out = [];

    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const mapped = await Promise.all(batch.map(mapper));
        for (const item of mapped) {
            if (item) out.push(item);
        }
    }

    return out;
};

const run = async () => {
    await Actor.init();

    try {
        const input = (await Actor.getInput()) || {};
        const {
            keyword = '',
            location = '',
            beruf = '',
            collectDetails = true,
            results_wanted: resultsWantedRaw = 100,
            max_pages: maxPagesRaw = 50,
            startUrl,
            startUrls,
            url,
            proxyConfiguration,
        } = input;

        const resultsWanted = toPositiveInt(resultsWantedRaw, 100);
        const maxPages = toPositiveInt(maxPagesRaw, 50);
        const startSearchUrl = getStartUrl({ startUrl, startUrls, url, keyword, location, beruf });

        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : undefined;

        const seen = new Set();
        const detailCache = new Map();
        let saved = 0;
        let pushed = 0;
        let pagesWithoutNewRecords = 0;
        const pushBuffer = [];
        let currentFrom = getInitialOffset(startSearchUrl);

        const requiredPages = Math.ceil((resultsWanted + currentFrom) / PAGE_SIZE);
        const effectiveMaxPages = Math.max(maxPages, requiredPages);

        if (effectiveMaxPages !== maxPages) {
            log.info(`Increasing max_pages from ${maxPages} to ${effectiveMaxPages} to satisfy results_wanted=${resultsWanted}.`);
        }

        const flushBuffer = async (force = false) => {
            while (pushBuffer.length >= PUSH_BATCH_SIZE || (force && pushBuffer.length > 0)) {
                const size = force ? Math.min(pushBuffer.length, PUSH_BATCH_SIZE) : PUSH_BATCH_SIZE;
                const chunk = pushBuffer.splice(0, size);
                await Dataset.pushData(chunk);
                pushed += chunk.length;
                log.debug(`Pushed batch: ${chunk.length} items (total pushed: ${pushed}).`);
            }
        };

        for (let requestIndex = 1; requestIndex <= effectiveMaxPages && saved < resultsWanted; requestIndex++) {
            const pageUrl = buildPageUrl(startSearchUrl, currentFrom, keyword, location, beruf);
            log.debug(`Fetching offset ${currentFrom}`);

            let pageData;
            try {
                pageData = await fetchRscResults(pageUrl, proxyConf);
            } catch (error) {
                log.warning(`RSC request failed at offset ${currentFrom}: ${error.message}`);
                pagesWithoutNewRecords++;
                if (pagesWithoutNewRecords >= 2) break;
                continue;
            }

            const hits = pageData.hits;
            if (!hits.length) {
                log.info(`No results at offset ${currentFrom}. Stopping.`);
                break;
            }

            const remaining = resultsWanted - saved;
            const selectedHits = [];
            let pageNew = 0;

            for (const hit of hits) {
                if (selectedHits.length >= remaining) break;

                const dedupeKey = createDedupKey(hit);
                if (!dedupeKey || seen.has(dedupeKey)) continue;

                seen.add(dedupeKey);
                pageNew++;
                selectedHits.push(hit);
            }

            const mapped = await mapInBatches(selectedHits, DETAIL_CONCURRENCY, async (hit) => {
                const detail = collectDetails
                    ? await fetchDetailFields(toJobUrl(hit?.vacancyData?.slug), proxyConf, detailCache)
                    : {};

                const item = sanitizeValue(mapHit(hit, pageData.meta, detail));
                return item && Object.keys(item).length > 0 ? item : null;
            });

            if (!mapped.length) {
                pagesWithoutNewRecords++;
                log.debug(`Offset ${currentFrom}: no new records after deduplication.`);
                if (pagesWithoutNewRecords >= 2) {
                    log.info('Stopping after consecutive pages without new records.');
                    break;
                }
                currentFrom += hits.length || PAGE_SIZE;
                continue;
            }

            pagesWithoutNewRecords = 0;
            pushBuffer.push(...mapped);
            await flushBuffer(false);
            saved += mapped.length;

            log.info(`Offset ${currentFrom}: +${mapped.length} unique items (${saved}/${resultsWanted}), raw hits ${hits.length}.`);

            currentFrom += hits.length || PAGE_SIZE;

            if (hits.length < PAGE_SIZE) {
                log.info('Last page detected (fewer results than page size).');
                break;
            }
        }

        await flushBuffer(true);

        log.info(`Extraction complete. Saved ${saved} unique records, pushed ${pushed} records.`);
    } finally {
        await Actor.exit();
    }
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
