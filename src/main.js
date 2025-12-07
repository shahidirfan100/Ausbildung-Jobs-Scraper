// Ausbildung.de jobs scraper - JSON API + HTML fallback implementation
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';
import { gotScraping } from 'got-scraping';

// Single-entrypoint main
await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            keyword = '', location = '', beruf = '',
            results_wanted: RESULTS_WANTED_RAW = 100, max_pages: MAX_PAGES_RAW = 50,
            collectDetails = true, startUrl, startUrls, url, proxyConfiguration,
        } = input;

        // Hardcoded internal settings
        const useJsonApi = true;
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

        const buildStartUrl = (kw, loc, bf, bl, umk) => {
            const u = new URL('https://www.ausbildung.de/suche/');
            if (kw) u.searchParams.set('was', String(kw).trim());
            if (loc) u.searchParams.set('wo', String(loc).trim());
            if (bf) u.searchParams.set('beruf', String(bf).trim());
            if (bl) u.searchParams.set('bundesland', String(bl).trim());
            if (umk) u.searchParams.set('umkreis', String(umk).trim());
            return u.href;
        };

        // Function to fetch jobs from JSON API
        async function fetchJobsFromApi(page, kw, loc, bf, bl, umk, proxyConf) {
            try {
                const apiUrl = new URL('https://www.ausbildung.de/api/jobs/search');
                apiUrl.searchParams.set('page', page.toString());
                apiUrl.searchParams.set('per_page', '20');
                if (kw) apiUrl.searchParams.set('was', kw);
                if (loc) apiUrl.searchParams.set('wo', loc);
                if (bf) apiUrl.searchParams.set('beruf', bf);
                if (bl) apiUrl.searchParams.set('bundesland', bl);
                if (umk) apiUrl.searchParams.set('umkreis', umk);

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
                });

                return response.body;
            } catch (error) {
                log.warning(`API fetch failed for page ${page}: ${error.message}`);
                return null;
            }
        }

        const initial = [];
        if (Array.isArray(startUrls) && startUrls.length) initial.push(...startUrls);
        if (startUrl) initial.push(startUrl);
        if (url) initial.push(url);
        if (!initial.length) initial.push(buildStartUrl(keyword, location, beruf, bundesland, umkreis));

        const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

        let saved = 0;
        const seenUrls = new Set();

        // Try JSON API first if enabled
        if (useJsonApi && !startUrl && !url && !(Array.isArray(startUrls) && startUrls.length)) {
            log.info('Attempting to scrape using JSON API...');
            let currentPage = 1;
            
            while (saved < RESULTS_WANTED && currentPage <= MAX_PAGES) {
                const apiData = await fetchJobsFromApi(currentPage, keyword, location, beruf, bundesland, umkreis, proxyConf);
                
                if (!apiData || !apiData.results || !Array.isArray(apiData.results) || apiData.results.length === 0) {
                    log.info(`No more results from API at page ${currentPage}`);
                    break;
                }

                for (const job of apiData.results) {
                    if (saved >= RESULTS_WANTED) break;
                    
                    const jobUrl = job.url ? toAbs(job.url) : null;
                    if (!jobUrl || seenUrls.has(jobUrl)) continue;
                    
                    seenUrls.add(jobUrl);
                    
                    const item = {
                        title: job.title || job.name || null,
                        company: job.company || job.employer || null,
                        location: job.location || job.city || null,
                        bundesland: job.bundesland || job.state || null,
                        beruf: job.beruf || job.profession || null,
                        ausbildungsart: job.ausbildungsart || job.training_type || null,
                        date_posted: job.date_posted || job.published_at || job.created_at || null,
                        description_html: job.description_html || job.description || null,
                        description_text: job.description_text || (job.description ? cleanText(job.description) : null),
                        salary: job.salary || job.gehalt || null,
                        job_type: job.job_type || job.employment_type || null,
                        start_date: job.start_date || job.ausbildungsbeginn || null,
                        url: jobUrl,
                    };

                    await Dataset.pushData(item);
                    saved++;
                }

                log.info(`API: Page ${currentPage} processed, saved ${saved}/${RESULTS_WANTED} jobs`);
                currentPage++;
                
                // Check if we've reached the total available
                if (apiData.total && saved >= apiData.total) break;
                if (apiData.pagination && !apiData.pagination.has_next) break;
            }

            log.info(`JSON API scraping completed. Saved ${saved} items`);
            return;
        }

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
                                location: (e.jobLocation && e.jobLocation.address && (e.jobLocation.address.addressLocality || e.jobLocation.address.addressRegion)) || null,
                                salary: e.baseSalary?.value?.value || e.baseSalary?.value || null,
                                job_type: e.employmentType || null,
                            };
                        }
                    }
                } catch (e) { /* ignore parsing errors */ }
            }
            return null;
        }

        function findJobLinks($, base) {
            const links = new Set();
            // Ausbildung.de uses /stellen/ URLs for job postings
            $('a[href]').each((_, a) => {
                const href = $(a).attr('href');
                if (!href) return;
                if (/\/stellen\//i.test(href) || /ausbildung\.de\/stellen/i.test(href)) {
                    const abs = toAbs(href, base);
                    if (abs && !abs.includes('#') && !abs.includes('?')) {
                        links.add(abs);
                    }
                }
            });
            return [...links];
        }

        function findNextPage($, base) {
            // Look for pagination - Ausbildung.de uses specific pagination structure
            const rel = $('a[rel="next"]').attr('href');
            if (rel) return toAbs(rel, base);
            
            // Look for "Weiter" or next arrow
            const next = $('a').filter((_, el) => {
                const text = $(el).text().trim();
                return /(weiter|next|›|»|>)/i.test(text);
            }).first().attr('href');
            
            if (next) return toAbs(next, base);
            
            // Look for page numbers
            const currentPage = $('a.active, .pagination .active').text().trim();
            if (currentPage) {
                const nextPageNum = parseInt(currentPage, 10) + 1;
                const nextPageLink = $(`a:contains("${nextPageNum}")`).first().attr('href');
                if (nextPageLink) return toAbs(nextPageLink, base);
            }
            
            return null;
        }

        // HTML parsing fallback
        log.info('Using HTML parsing mode...');
        
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
                    
                    const links = findJobLinks($, request.url);
                    crawlerLog.info(`Found ${links.length} job links on page ${pageNo}`);

                    if (collectDetails) {
                        const remaining = RESULTS_WANTED - saved;
                        const toEnqueue = [];
                        
                        for (const link of links) {
                            if (saved >= RESULTS_WANTED) break;
                            if (seenUrls.has(link)) continue;
                            seenUrls.add(link);
                            toEnqueue.push(link);
                        }
                        
                        if (toEnqueue.length) {
                            await enqueueLinks({ urls: toEnqueue, userData: { label: 'DETAIL' } });
                        }
                    } else {
                        const remaining = RESULTS_WANTED - saved;
                        const toPush = [];
                        
                        for (const link of links) {
                            if (saved >= RESULTS_WANTED) break;
                            if (seenUrls.has(link)) continue;
                            seenUrls.add(link);
                            toPush.push({ url: link });
                        }
                        
                        if (toPush.length) {
                            await Dataset.pushData(toPush);
                            saved += toPush.length;
                        }
                    }

                    if (saved < RESULTS_WANTED && pageNo < MAX_PAGES) {
                        const next = findNextPage($, request.url);
                        if (next && !seenUrls.has(next)) {
                            seenUrls.add(next);
                            await enqueueLinks({ urls: [next], userData: { label: 'LIST', pageNo: pageNo + 1 } });
                        }
                    }
                    return;
                }

                if (label === 'DETAIL') {
                    if (saved >= RESULTS_WANTED) return;
                    
                    try {
                        crawlerLog.info(`Processing DETAIL: ${request.url}`);
                        
                        // Try JSON-LD first
                        const json = extractFromJsonLd($);
                        const data = json || {};
                        
                        // Fallback to HTML selectors for Ausbildung.de
                        if (!data.title) {
                            data.title = $('h1').first().text().trim() || 
                                        $('[class*="job-title"], [class*="title"]').first().text().trim() || null;
                        }
                        
                        if (!data.company) {
                            data.company = $('[class*="company"], [class*="employer"], [class*="firma"]').first().text().trim() || null;
                        }
                        
                        if (!data.location) {
                            data.location = $('[class*="location"], [class*="ort"], [class*="standort"]').first().text().trim() || null;
                        }
                        
                        // Extract bundesland (state)
                        const bundesland = $('[class*="bundesland"], [class*="state"]').first().text().trim() || null;
                        
                        // Extract beruf (profession/job type)
                        const beruf = $('[class*="beruf"], [class*="profession"], [class*="job-category"]').first().text().trim() || null;
                        
                        // Extract training type
                        const ausbildungsart = $('[class*="ausbildungsart"], [class*="training-type"]').first().text().trim() || null;
                        
                        // Extract start date
                        const start_date = $('[class*="beginn"], [class*="start"], [class*="starting"]').first().text().trim() || null;
                        
                        // Extract description
                        if (!data.description_html) {
                            const desc = $('[class*="job-description"], [class*="beschreibung"], .description, .entry-content, [class*="stellenbeschreibung"]').first();
                            data.description_html = desc && desc.length ? String(desc.html()).trim() : null;
                        }
                        
                        data.description_text = data.description_html ? cleanText(data.description_html) : null;

                        const item = {
                            title: data.title || null,
                            company: data.company || null,
                            location: data.location || null,
                            bundesland: bundesland,
                            beruf: beruf,
                            ausbildungsart: ausbildungsart,
                            date_posted: data.date_posted || null,
                            start_date: start_date,
                            description_html: data.description_html || null,
                            description_text: data.description_text || null,
                            salary: data.salary || null,
                            job_type: data.job_type || null,
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
        log.info(`Finished. Saved ${saved} items`);
    } finally {
        await Actor.exit();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
