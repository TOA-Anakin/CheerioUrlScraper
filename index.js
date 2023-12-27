const { load } = require('cheerio');
const fs = require("fs/promises");
const os = require("os");

async function getPagesToCrawlRobots(baseUrl) {
    const robotsUrl = `${baseUrl}/robots.txt`;
    let response;
    let result = {
        allow: [],
        disallow: [],
    };

    try {
        response = await fetch(robotsUrl);
    } catch (error) {
        console.error(`Fetch function failed\nError: ${error.message}`);
        return result;
    }

    if (!response.ok) {
        console.error(`Unable to fetch the URL: ${robotsUrl}\nStatus: ${response.status}`);
        return result;
    }

    const robotsTxt = await response.text();

    robotsTxt.split(os.EOL).forEach(line => {
        if (line.startsWith('Allow:')) {
            const path = line.split(': ')[1];
            result.allow.push(`${baseUrl}${path}`);
        } else if (line.startsWith('Disallow:')) {
            const path = line.split(': ')[1];
            result.disallow.push(`${baseUrl}${path}`);
        }
    });

    console.info(`Allowing: ${result.allow}`);
    console.info(`Disallowing: ${result.disallow}`);

    return result;
}

async function scrapeOnpageLinks(url, robots) {
    const onsiteLinks = [];
    let response, urlObj, errorObj;

    try {
        urlObj = new URL(url);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return false;
    }

    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    try {
        response = await fetch(url);
    } catch (error) {
        errorObj
        console.error(`Fetch function failed\nError: ${error.message}`);
        return false;
    }

    if (!response.ok) {
        console.error(`Unable to fetch the URL: ${url}\nStatus: ${response.status}`);
        return false;
    }

    const html = await response.text();
    const $ = load(html);

    const el_a = $('a[href]:not([rel="author"]):not([rel="nofollow"])');
    el_a.each((_, a) => {
        let href = $(a).attr('href');

        if (href.trim() === '' || href.startsWith('#')) {
            return;
        }

        if (href.startsWith('/')) {
            href = `${baseUrl}${href}`;
        }

        onsiteLinks.push(href);
    })

    // console.log('onsiteLinks', onsiteLinks);
    const filteredOnsiteLinks = onsiteLinks.filter((link) => {
        return (!robots.disallow.includes(link));
    })

    return filteredOnsiteLinks;
}

async function crawlSites() {
    const pagesToCrawl = (await fs.readFile("input.txt", "utf-8")).split(os.EOL) ?? [];
    const ignoredUrls = (await fs.readFile("ignore.txt", "utf-8")).split(os.EOL) ?? [];
    const pagesToCrawlRobots = {};
    const pagesCrawled = [];
    const discoveredLinks = new Set();

    if (pagesToCrawl.length === 1 && pagesToCrawl[0] === '') {
        console.error("No URLs found in input.txt");
        return;
    }

    while (pagesToCrawl.length !== 0) {
        const pageToCrawl = pagesToCrawl.pop();

        if (ignoredUrls.includes(pageToCrawl)) {
            console.info(`Ignoring page: ${pageToCrawl}`);
            continue;
        }

        console.info(`Crawling page: ${pageToCrawl}`);

        try {
            pageToCrawlObj = new URL(pageToCrawl);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            continue;
        }

        const pageToCrawlBase = `${pageToCrawlObj.protocol}//${pageToCrawlObj.host}`;

        if (!pagesToCrawlRobots[pageToCrawlBase]) {
            pagesToCrawlRobots[pageToCrawlBase] = await getPagesToCrawlRobots(pageToCrawlBase);
        }

        const onpageLinks = await scrapeOnpageLinks(pageToCrawl, pagesToCrawlRobots[pageToCrawlBase]);
        if (onpageLinks === false) {
            console.error(`Error while scraping links from ${pageToCrawl}`);
            continue;
        } else {
            onpageLinks.forEach(url => {
                discoveredLinks.add(url);
                if (!pagesCrawled.includes(url) && url !== pageToCrawl) {
                    pagesToCrawl.push(url);
                }
            })
            console.log(`${onpageLinks.length} URLs found`);
        }

        pagesCrawled.push(pageToCrawl);
        console.log(`${discoveredLinks.size} URLs discovered so far`);

        const csvContent = [...discoveredLinks].join(os.EOL);
        await fs.writeFile("output.txt", csvContent);
    }
}

// =================================================================================================

crawlSites();