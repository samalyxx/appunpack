# Website and search visibility

The public project website is [samalyxx.github.io/appunpack](https://samalyxx.github.io/appunpack/). It gives search engines a dedicated page about AppUnpack's Android APK reverse-engineering workflow, with links to the GitHub repository, setup instructions and releases.

## Included metadata

- A descriptive page title, meta description and one main heading identify the project and its actual purpose.
- A canonical URL points to `https://samalyxx.github.io/appunpack/`.
- Open Graph and social-card metadata describe the page when it is shared.
- Crawlable HTML explains APK decompilation, decoded resources, local analysis, MCP integration and the limits of IPA metadata support.
- `sitemap.xml` lists the canonical project page. README and website links connect installation guides, verification evidence and release downloads.
- The repository description and relevant GitHub topics help people find the project on GitHub.

The README uses the same product name, clear headings, descriptive image alternatives and a practical quick start. Keep the website, package metadata and README consistent when capabilities change.

Google reads `robots.txt` at the [host root](https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt), `https://samalyxx.github.io/robots.txt`. A file under `/appunpack/robots.txt` cannot set crawling rules for this project site. The project does not require a robots exclusion rule; verify the host's root rules if crawling is blocked.

## Google Search Console

Google decides whether and when a page is indexed. Valid metadata, a sitemap and a public repository cannot guarantee indexing, ranking or traffic. See Google's [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

After the Pages deployment is public:

1. Open [Google Search Console](https://search.google.com/search-console/) with your Google account and add the URL-prefix property `https://samalyxx.github.io/appunpack/`.
2. Use one of the [ownership verification methods](https://support.google.com/webmasters/answer/9008080) offered for that property. For an HTML-file or meta-tag method, add the exact token Google supplies to the site and redeploy. No verification token is included in this repository.
3. Submit `https://samalyxx.github.io/appunpack/sitemap.xml` in the property's Sitemaps report. Google's [sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview) explains why a sitemap helps discovery but does not guarantee crawling or indexing.
4. Inspect the homepage URL with URL Inspection. Check the live URL and request indexing if the interface permits it.
5. Review indexing and search-performance reports after Google has had time to crawl the page. Correct reported problems and keep useful documentation current.

Search Console ownership verification requires the repository owner's Google account. It is a separate action from publishing the site. An indexing request is a request, not a promise of inclusion in search results.

## Maintaining discoverability

Use accurate [GitHub topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics), keep release notes and installation steps current, and link to the project from relevant documentation or profiles you control. Preserve working canonical and sitemap URLs if the site moves to a custom domain. There is no need to add keyword lists, fabricated ratings, download counts or indexing promises.
