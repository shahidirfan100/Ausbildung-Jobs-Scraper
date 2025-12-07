// Ausbildung.de jobs scraper - Hybrid: Next.js Data API + JSON-LD + HTML fallback
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { gotScraping } from 'got-scraping';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            keyword = '', location = '', beruf = '',
            results_wanted: RESULTS_WANTED_RAW = 100, max_pages: MAX_PAGES_RAW = 50,
            collectDetails = true, startUrl, startUrls, url, proxyConfiguration,
        } = input;

        // Internal settings
        const bundesland = '';
        const umkreis = '50';

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : Number.MAX_SAFE_INTEGER;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 50;

        const toAbs = (href, base = 'https://www.ausbildung.de') => {
            try { return new URL(href, base).href; } catch { return null; }
        };

        const cleanText = (html) => {
            if (!html) return '';
            const $ = cheerioLoad(html);
            $('script, style, noscript, iframe').remove();
            return $.root().text().replace(/\s+/g, ' ').trim();
        };

        const buildStartUrl = (kw, loc, bf) => {
            const u = new URL('https://www.ausbildung.de/suche/');
            if (kw) u.searchParams.set('was', String(kw).trim());
            if (loc) u.searchParams.set('wo', String(loc).trim());
            if (bf) u.searchParams.set('beruf', String(bf).trim());
            return u.href;
        };

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        // ============================================================
        // BUILD_ID EXTRACTION - Extract from initial HTML response
        // ============================================================
        async function extractBuildId() {
            log.info('Extracting BUILD_ID from ausbildung.de...');
            try {
                const response = await gotScraping({
                    url: 'https://www.ausbildung.de/suche/',
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    headerGeneratorOptions: {
                        browsers: [{ name: 'chrome', minVersion: 100 }],
                        operatingSystems: ['windows', 'linux'],
                        devices: ['desktop'],
                        locales: ['de-DE'],
                    },
                    timeout: { request: 30000 },
                });

                // Try multiple patterns to find buildId
                const patterns = [
                    /buildId["':\s]+["']?([a-zA-Z0-9_-]+)/,
                    /"buildId":"([^"]+)"/,
                    /buildId['"]\s*:\s*['"]([\w-]+)['"]/,
                    /_buildId["']?\s*:\s*["']([^"']+)["']/,
                ];

                for (const pattern of patterns) {
                    const match = response.body.match(pattern);
                    if (match && match[1]) {
                        log.info(`Extracted BUILD_ID: ${match[1]}`);
                        return match[1];
                    }
                }

                // Fallback: look in __NEXT_DATA__ script
                const nextDataMatch = response.body.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
                if (nextDataMatch) {
                    try {
                        const nextData = JSON.parse(nextDataMatch[1]);
                        if (nextData.buildId) {
                            log.info(`Extracted BUILD_ID from __NEXT_DATA__: ${nextData.buildId}`);
                            return nextData.buildId;
                        }
                    } catch { /* ignore */ }
                }

                log.warning('Could not extract BUILD_ID from HTML');
                return null;
            } catch (error) {
                log.warning(`BUILD_ID extraction failed: ${error.message}`);
                return null;
            }
        }

        // ============================================================
        // TIER 1: Next.js Data API Fetching
        // ============================================================
        async function fetchFromNextJsApi(buildId, page, kw, loc, bf) {
            try {
                const apiUrl = new URL(`https://www.ausbildung.de/_next/data/${buildId}/suche.json`);
                apiUrl.searchParams.set('page', page.toString());
                if (kw) apiUrl.searchParams.set('was', kw);
                if (loc) apiUrl.searchParams.set('wo', loc);
                if (bf) apiUrl.searchParams.set('beruf', bf);

                log.debug(`Next.js API: Fetching ${apiUrl.href}`);

                const response = await gotScraping({
                    url: apiUrl.href,
                    responseType: 'json',
                    proxyUrl: proxyConf ? await proxyConf.newUrl() : undefined,
                    headerGeneratorOptions: {
                        browsers: [{ name: 'chrome', minVersion: 100 }],
                        operatingSystems: ['windows', 'linux'],
                        devices: ['desktop'],
                        locales: ['de-DE'],
                    },
                    timeout: { request: 30000 },
                });

                return response.body;
            } catch (error) {
                log.warning(`Next.js API fetch failed for page ${page}: ${error.message}`);
                return null;
            }
        }

        // Parse job data from Next.js API response
        function parseNextJsJobs(apiResponse) {
            const jobs = [];
            try {
                // Navigate through the Next.js pageProps structure
                const pageProps = apiResponse?.pageProps || apiResponse;

                // Try different possible data locations
                const possiblePaths = [
                    pageProps?.jobs,
                    pageProps?.data?.jobs,
                    pageProps?.searchResults?.jobs,
                    pageProps?.results,
                    pageProps?.data?.results,
                    pageProps?.positions,
                    pageProps?.listings,
                    pageProps?.data?.listings,
                    pageProps?.initialData?.jobs,
                    pageProps?.jobListings,
                ];

                for (const items of possiblePaths) {
                    if (Array.isArray(items) && items.length > 0) {
                        for (const item of items) {
                            // Extract bundesland with multiple fallbacks
                            const bundesland = item.bundesland || item.state || item.region ||
                                item.federalState || item.address?.region ||
                                item.location?.bundesland || item.location?.state ||
                                item.jobLocation?.address?.addressRegion || null;

                            // Extract beruf (profession) with multiple fallbacks
                            const beruf = item.beruf || item.profession || item.category ||
                                item.berufsfeld || item.jobCategory || item.occupationalCategory ||
                                item.branche || item.field || item.fachrichtung || null;

                            // Extract ausbildungsart (training type) with multiple fallbacks
                            const ausbildungsart = item.ausbildungsart || item.trainingType ||
                                item.stellenart || item.positionType || item.type ||
                                item.employmentType || item.contractType ||
                                (item.isDualStudium ? 'Duales Studium' : null) ||
                                (item.isAusbildung ? 'Ausbildung' : null) || null;

                            jobs.push({
                                title: item.title || item.name || item.jobTitle || null,
                                company: item.company || item.employer || item.companyName ||
                                    item.hiringOrganization?.name || item.firma || null,
                                location: item.location?.city || item.location?.name ||
                                    item.location || item.city || item.address?.city ||
                                    item.jobLocation?.address?.addressLocality || item.ort || null,
                                bundesland: bundesland,
                                beruf: beruf,
                                ausbildungsart: ausbildungsart,
                                date_posted: item.datePosted || item.publishedAt ||
                                    item.createdAt || item.date || null,
                                start_date: item.startDate || item.ausbildungsbeginn ||
                                    item.beginnDate || item.start || null,
                                description_html: item.description || item.descriptionHtml || null,
                                description_text: item.descriptionText ||
                                    (item.description ? cleanText(item.description) : null),
                                salary: item.salary || item.gehalt || item.baseSalary?.value ||
                                    item.verguetung || null,
                                job_type: item.jobType || item.employmentType || null,
                                url: item.url || item.href || item.link ||
                                    (item.slug ? `https://www.ausbildung.de/stellen/${item.slug}/` : null),
                            });
                        }
                        break;
                    }
                }


                // Check for pagination info - look in multiple places
                const pagination = pageProps?.pagination || pageProps?.meta?.pagination ||
                    pageProps?.data?.pagination || pageProps?.paging || {};

                // Determine if there are more pages: check explicit flags or if we got a full page of results
                const hasExplicitMore = pagination.hasNext === true || pagination.hasMore === true ||
                    pagination.nextPage !== undefined || pagination.next !== undefined;
                const gotFullPage = jobs.length >= 20; // If we got 20 jobs, there's likely more

                return {
                    jobs,
                    pagination,
                    hasMore: hasExplicitMore || gotFullPage,
                    totalPages: pagination.totalPages || pagination.total_pages || pagination.lastPage || null
                };
            } catch (error) {
                log.debug(`Error parsing Next.js response: ${error.message}`);
                return { jobs: [], pagination: {}, hasMore: false };
            }
        }

        // ============================================================
        // TIER 2: JSON-LD Schema Extraction
        // ============================================================
        function extractFromJsonLd($) {
            const scripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < scripts.length; i++) {
                try {
                    const parsed = JSON.parse($(scripts[i]).html() || '');
                    const arr = Array.isArray(parsed) ? parsed : [parsed];
                    for (const e of arr) {
                        if (!e) continue;
                        const t = e['@type'] || e.type;
                        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) {
                            return {
                                title: e.title || e.name || null,
                                company: e.hiringOrganization?.name || null,
                                date_posted: e.datePosted || null,
                                description_html: e.description || null,
                                location: (e.jobLocation?.address?.addressLocality ||
                                    e.jobLocation?.address?.addressRegion) || null,
                                salary: e.baseSalary?.value?.value || e.baseSalary?.value || null,
                                job_type: e.employmentType || null,
                                start_date: e.validThrough || null,
                            };
                        }
                    }
                } catch { /* ignore parsing errors */ }
            }
            return null;
        }

        // ============================================================
        // TIER 3: CSS Selector Extraction (User-specified selectors)
        // ============================================================
        function extractJobsFromHtml($, baseUrl) {
            const jobs = [];

            // Primary selector: .c-jobCard
            let cards = $('.c-jobCard');

            // Fallback selectors if primary doesn't find any
            if (!cards.length) {
                cards = $('a[href*="/stellen/"]').closest('article, div[class*="card"], li');
            }
            if (!cards.length) {
                cards = $('h2 a[href*="/stellen/"]').closest('article, div, li');
            }

            cards.each((_, card) => {
                const $card = $(card);

                // Get job link - multiple selector attempts
                let link = $card.find('h2 a').attr('href') ||
                    $card.find('a[href*="/stellen/"]').first().attr('href') ||
                    $card.find('a[href*="/ausbildung/"]').first().attr('href') ||
                    $card.attr('href');

                if (!link) return;
                const jobUrl = toAbs(link, baseUrl);
                if (!jobUrl) return;

                // Extract data using user-specified selectors
                const title = $card.find('h2 a, h3, h2').first().text().trim() ||
                    $card.find('[class*="title"]').first().text().trim();
                const company = $card.find('.c-jobCard__company, [class*="company"]').first().text().trim();
                const location = $card.find('.c-jobCard__location, [class*="location"]').first().text().trim();

                if (title || company) {
                    jobs.push({ url: jobUrl, title, company, location });
                }
            });

            return jobs;
        }

        function extractDetailFromHtml($) {
            // Extract from detail page using user-specified selectors
            const description_html =
                $('.c-jobDetail__description').html() ||
                $('[class*="job-description"], [class*="beschreibung"], .description').first().html();

            const sidebarInfo = $('.c-jobDetail__sidebar, .c-jobDetail__facts').text().trim();
            const fullText = $('body').text();

            // ---- Helper function to find labeled values ----
            const findLabeledValue = (labelPattern) => {
                // Try structured elements first (dt/dd, label/value pairs)
                let value = null;

                // Try dl/dt/dd pairs
                $('dt, .label, strong').each((_, el) => {
                    const label = $(el).text().trim().toLowerCase();
                    if (labelPattern.test(label)) {
                        const dd = $(el).next('dd, .value, span').text().trim();
                        if (dd) value = dd;
                    }
                });
                if (value) return value;

                // Try info items with headers
                $('[class*="info"], [class*="fact"], [class*="detail"]').each((_, el) => {
                    const text = $(el).text();
                    const match = text.match(new RegExp(labelPattern.source + '[:\\s]+([^\\n]+)', 'i'));
                    if (match && match[1]) value = match[1].trim();
                });
                if (value) return value;

                return null;
            };

            // ---- Extract Bundesland (Federal State) ----
            let bundesland = $('[class*="bundesland"], [class*="state"], [class*="region"]').first().text().trim() || null;
            if (!bundesland) {
                // Try breadcrumbs
                const breadcrumbs = $('.breadcrumb, [class*="breadcrumb"], nav').text();
                const statesPattern = /(Baden-Württemberg|Bayern|Berlin|Brandenburg|Bremen|Hamburg|Hessen|Mecklenburg-Vorpommern|Niedersachsen|Nordrhein-Westfalen|Rheinland-Pfalz|Saarland|Sachsen|Sachsen-Anhalt|Schleswig-Holstein|Thüringen)/i;
                const stateMatch = breadcrumbs.match(statesPattern) || fullText.match(statesPattern);
                if (stateMatch) bundesland = stateMatch[1];
            }
            if (!bundesland) bundesland = findLabeledValue(/bundesland|federal\s*state|region/i);

            // ---- Extract Beruf (Profession) ----
            let beruf = $('[class*="beruf"], [class*="profession"], [class*="category"], [class*="berufsfeld"]').first().text().trim() || null;
            if (!beruf) {
                // Try to extract from breadcrumbs or categories
                beruf = findLabeledValue(/beruf|profession|kategorie|berufsfeld|fachrichtung/i);
            }
            if (!beruf) {
                // Try meta tags
                const metaKeywords = $('meta[name="keywords"]').attr('content');
                if (metaKeywords && metaKeywords.includes('Ausbildung')) {
                    const parts = metaKeywords.split(',').map(s => s.trim());
                    const profession = parts.find(p => !p.includes('Ausbildung.de') && p.length > 5 && p.length < 50);
                    if (profession) beruf = profession;
                }
            }

            // ---- Extract Ausbildungsart (Training Type) ----
            let ausbildungsart = $('[class*="ausbildungsart"], [class*="training-type"], [class*="stellenart"]').first().text().trim() || null;
            if (!ausbildungsart) {
                ausbildungsart = findLabeledValue(/ausbildungsart|art\s*der\s*ausbildung|stellenart|training|typ/i);
            }
            if (!ausbildungsart) {
                // Try to infer from page content
                const trainingTypes = ['Duale Ausbildung', 'Schulische Ausbildung', 'Duales Studium', 'Praktikum', 'Trainee'];
                for (const type of trainingTypes) {
                    if (fullText.includes(type)) {
                        ausbildungsart = type;
                        break;
                    }
                }
            }
            if (!ausbildungsart) {
                // Check title for common patterns
                const title = $('h1').first().text().trim();
                if (title.toLowerCase().includes('duales studium')) ausbildungsart = 'Duales Studium';
                else if (title.toLowerCase().includes('ausbildung')) ausbildungsart = 'Ausbildung';
            }

            // ---- Extract other fields ----
            const title = $('h1').first().text().trim() ||
                $('[class*="job-title"]').first().text().trim();
            const company = $('[class*="company"], [class*="employer"], [class*="firma"]').first().text().trim();
            const location = $('[class*="location"], [class*="ort"], [class*="standort"]').first().text().trim();
            const start_date = $('[class*="beginn"], [class*="start"]').first().text().trim() ||
                findLabeledValue(/beginn|start|ab wann|ausbildungsbeginn/i);

            return {
                title: title || null,
                company: company || null,
                location: location || null,
                bundesland: bundesland || null,
                beruf: beruf || null,
                ausbildungsart: ausbildungsart || null,
                start_date: start_date || null,
                description_html: description_html || null,
                description_text: description_html ? cleanText(description_html) : null,
                sidebar_info: sidebarInfo || null,
            };
        }

        // ============================================================
        // PAGINATION - Using user-specified selectors
        // ============================================================
        function findNextPage($, baseUrl) {
            // Primary: a[rel='next']
            let next = $('a[rel="next"]').attr('href');
            if (next) return toAbs(next, baseUrl);

            // Secondary: .c-pagination__next
            next = $('.c-pagination__next').attr('href');
            if (next) return toAbs(next, baseUrl);

            // Fallback: look for next/weiter links
            const nextLink = $('a').filter((_, el) => {
                const text = $(el).text().trim().toLowerCase();
                return /(weiter|next|›|»|>)/i.test(text) && !/(zurück|prev|back)/i.test(text);
            }).first().attr('href');

            if (nextLink) return toAbs(nextLink, baseUrl);

            return null;
        }

        // ============================================================
        // MAIN SCRAPING LOGIC
        // ============================================================
        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(keyword, location, beruf));

        let saved = 0;
        const seenUrls = new Set();

        // ============================================================
        // TRY TIER 1: Next.js Data API
        // ============================================================
        const useDefaultSearch = !startUrl && !url && !(Array.isArray(startUrls) && startUrls.length);

        if (useDefaultSearch) {
            log.info('=== TIER 1: Attempting Next.js Data API ===');

            const buildId = await extractBuildId();

            if (buildId) {
                let apiSuccess = false;
                let currentPage = 1;

                let consecutiveFailures = 0;
                const MAX_CONSECUTIVE_FAILURES = 2;

                while (saved < RESULTS_WANTED && currentPage <= MAX_PAGES) {
                    const apiData = await fetchFromNextJsApi(buildId, currentPage, keyword, location, beruf);

                    if (!apiData) {
                        log.warning(`Next.js API returned no data at page ${currentPage}`);
                        consecutiveFailures++;
                        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                            log.info('Too many consecutive API failures, switching to HTML fallback');
                            break;
                        }
                        currentPage++;
                        continue; // Try next page before giving up
                    }

                    const { jobs, hasMore, totalPages } = parseNextJsJobs(apiData);

                    if (jobs.length === 0) {
                        log.info(`No jobs parsed from API response at page ${currentPage}`);
                        consecutiveFailures++;
                        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
                        currentPage++;
                        continue;
                    }

                    // Reset failure counter on success
                    consecutiveFailures = 0;
                    apiSuccess = true;

                    for (const job of jobs) {
                        if (saved >= RESULTS_WANTED) break;

                        const jobUrl = job.url ? toAbs(job.url) : null;
                        if (!jobUrl || seenUrls.has(jobUrl)) continue;

                        seenUrls.add(jobUrl);
                        await Dataset.pushData({ ...job, url: jobUrl });
                        saved++;
                    }

                    log.info(`API Page ${currentPage}: Saved ${saved}/${RESULTS_WANTED} jobs` +
                        (totalPages ? ` (total pages: ${totalPages})` : ''));

                    currentPage++;

                    // Only break if we explicitly know there's no more OR we didn't get any new jobs
                    if (!hasMore && jobs.length < 20) {
                        log.info('Reached last page of API results');
                        break;
                    }

                    // Small delay to avoid rate limiting
                    await new Promise(r => setTimeout(r, 500));
                }

                // If API got enough results, we're done
                if (apiSuccess && saved >= RESULTS_WANTED) {
                    log.info(`=== Next.js API SUCCESS: Saved ${saved} jobs ===`);
                    return;
                }

                // If API got some results but not enough, continue with HTML to get more
                if (apiSuccess && saved > 0 && saved < RESULTS_WANTED) {
                    log.info(`API got ${saved} jobs, switching to HTML to get remaining ${RESULTS_WANTED - saved}...`);
                }
            }

            log.info('Next.js API did not yield results, falling back to HTML parsing...');
        }

        // ============================================================
        // FALLBACK: HTML Parsing with CheerioCrawler (TIER 2 & 3)
        // ============================================================
        log.info('=== TIER 2/3: HTML Parsing with JSON-LD and CSS fallback ===');

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 10,
            requestHandlerTimeoutSecs: 90,
            async requestHandler({ request, $, enqueueLinks, log: crawlerLog }) {
                const label = request.userData?.label || 'LIST';
                const pageNo = request.userData?.pageNo || 1;

                if (label === 'LIST') {
                    crawlerLog.info(`Processing LIST page ${pageNo}: ${request.url}`);

                    // Extract jobs using CSS selectors (TIER 3)
                    const jobs = extractJobsFromHtml($, request.url);
                    crawlerLog.info(`Found ${jobs.length} job cards on page ${pageNo}`);

                    if (collectDetails) {
                        for (const job of jobs) {
                            if (saved >= RESULTS_WANTED) break;
                            if (seenUrls.has(job.url)) continue;
                            seenUrls.add(job.url);
                            await enqueueLinks({
                                urls: [job.url],
                                userData: { label: 'DETAIL', basicInfo: job }
                            });
                        }
                    } else {
                        for (const job of jobs) {
                            if (saved >= RESULTS_WANTED) break;
                            if (seenUrls.has(job.url)) continue;
                            seenUrls.add(job.url);
                            await Dataset.pushData(job);
                            saved++;
                        }
                    }

                    // Handle pagination
                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const nextPage = findNextPage($, request.url);
                        if (nextPage && !seenUrls.has(nextPage)) {
                            seenUrls.add(nextPage);
                            await enqueueLinks({
                                urls: [nextPage],
                                userData: { label: 'LIST', pageNo: pageNo + 1 }
                            });
                        }
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) return;

                    try {
                        crawlerLog.info(`Processing DETAIL: ${request.url}`);
                        const basicInfo = request.userData?.basicInfo || {};

                        // TIER 2: Try JSON-LD first
                        const jsonLd = extractFromJsonLd($);

                        // TIER 3: CSS selector fallback
                        const htmlData = extractDetailFromHtml($);

                        // Merge data: JSON-LD > HTML > Basic Info
                        const item = {
                            title: jsonLd?.title || htmlData.title || basicInfo.title || null,
                            company: jsonLd?.company || htmlData.company || basicInfo.company || null,
                            location: jsonLd?.location || htmlData.location || basicInfo.location || null,
                            bundesland: htmlData.bundesland || null,
                            beruf: htmlData.beruf || null,
                            ausbildungsart: htmlData.ausbildungsart || null,
                            date_posted: jsonLd?.date_posted || null,
                            start_date: jsonLd?.start_date || htmlData.start_date || null,
                            description_html: jsonLd?.description_html || htmlData.description_html || null,
                            description_text: htmlData.description_text ||
                                (jsonLd?.description_html ? cleanText(jsonLd.description_html) : null),
                            salary: jsonLd?.salary || null,
                            job_type: jsonLd?.job_type || null,
                            url: request.url,
                        };

                        await Dataset.pushData(item);
                        saved++;
                        crawlerLog.info(`Saved job ${saved}/${RESULTS_WANTED}: ${item.title}`);
                    } catch (err) {
                        crawlerLog.error(`DETAIL ${request.url} failed: ${err.message}`);
                    }
                }
            }
        });

        await crawler.run(initial.map(u => ({ url: u, userData: { label: 'LIST', pageNo: 1 } })));
        log.info(`=== FINISHED: Saved ${saved} jobs total ===`);
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
