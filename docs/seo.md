# Repository and search visibility

The primary search target is the [AppUnpack GitHub repository](https://github.com/samalyxx/appunpack). Finding that repository in Google is separate from finding its GitHub Pages website or finding it in GitHub's own search.

## GitHub repository visibility

- The repository's About description identifies it as a local Android APK decompiler and reverse-engineering CLI, naming JADX, split analysis and MCP.
- Relevant topics include `android-reverse-engineering`, `apk-decompiler`, `apk-analysis`, `jadx`, `apktool`, `ghidra` and `mcp-server`. These place the project in relevant GitHub topic collections.
- The README starts with a descriptive heading and the actual product explanation before illustrations and demo credits. Installation, output contracts, evidence, limits and releases remain readable on GitHub.
- Links shared from profiles, demos or relevant write-ups should point directly to `https://github.com/samalyxx/appunpack` when the repository is the intended destination. Useful documentation and real adoption help people evaluate the project; fabricated stars and irrelevant link placement do not.

On 2026-10-23, the public GitHub repository page returned HTTP 200, with no `X-Robots-Tag` or robots meta directive. Its generated title and description contained the project description, and `og:url` pointed to the repository. No repository-level technical indexing prohibition was observed.

The Google query `site:github.com/samalyxx/appunpack AppUnpack` returned no matching documents in the observed search. A [`site:` query](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site) is not an exhaustive index report and cannot establish an indexing ban or a penalty. GitHub's own `appunpack in:name` search did return the repository. Its creation date was 2026-10-20.

GitHub controls the repository page's HTML head, crawl rules and canonical handling. Adding a sitemap or verification tag to this project's website does not verify or submit the `github.com` repository URL. The website's Search Console reports apply only to that website and must not be used as evidence of the repository's Google indexing status. There is no guaranteed ranking or deadline.

## Supporting website

The public project website is [samalyxx.github.io/appunpack](https://samalyxx.github.io/appunpack/). It gives search engines a dedicated page about AppUnpack's Android APK reverse-engineering workflow, with links to the GitHub repository, setup instructions and releases.

## Included metadata

- A descriptive page title, meta description and one main heading identify the project and its actual purpose.
- Each page has its own canonical URL under `https://samalyxx.github.io/appunpack/`.
- Open Graph and social-card metadata describe the page when it is shared.
- Crawlable HTML explains APK decompilation, decoded resources, local analysis, MCP integration and the limits of IPA metadata support.
- `sitemap.xml` lists the homepage and two practical guides: [APK decompilation](https://samalyxx.github.io/appunpack/guides/decompile-apk/) and [split APK/XAPK analysis](https://samalyxx.github.io/appunpack/guides/split-apk-xapk/). The guides have article and breadcrumb metadata, and link to each other, the homepage and the source documentation.
- The repository description and relevant GitHub topics help people find the project on GitHub.

The README uses the same product name, clear headings, descriptive image alternatives and a practical quick start. Keep the website, package metadata and README consistent when capabilities change.

Google reads `robots.txt` at the [host root](https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt), `https://samalyxx.github.io/robots.txt`. A file under `/appunpack/robots.txt` cannot set crawling rules for this project site. The project does not require a robots exclusion rule; verify the host's root rules if crawling is blocked.

## Visibility audit on 2026-10-23

The public homepage, sitemap and social image returned HTTP 200. The homepage had crawlable static HTML, an indexing-permitted robots meta tag and no `X-Robots-Tag` response header. Existing canonical and social metadata were present. These checks did not identify a technical indexing prohibition; they do not establish that Google has indexed the page.

GitHub's repository search returned `samalyxx/appunpack` for `appunpack in:name`. The repository was created on 2026-10-20. Finding a new repository by its name and ranking for a broad competitive phrase are different checks. The GitHub topic page in the reported Google result is a collection of repositories, not an individual project's search position.

The changes add the two crawlable guides, internal and README links, a complete sitemap and clearer APK-decompiler metadata. They also correct Python prerequisites and split-set wording. The repository description and topics now include relevant terms such as `android-reverse-engineering`, `apk-decompiler` and `mcp-server`. Topic classification helps discovery on GitHub; it does not guarantee placement in Google or GitHub search.

## Google Search Console

Google decides whether and when a page is indexed. Valid metadata, a sitemap and a public repository cannot guarantee indexing, ranking or traffic. See Google's [SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

After the Pages deployment is public:

1. Open [Google Search Console](https://search.google.com/search-console/) with your Google account and add the URL-prefix property `https://samalyxx.github.io/appunpack/`.
2. Use one of the [ownership verification methods](https://support.google.com/webmasters/answer/9008080) offered for that property. The homepage includes the owner's public verification meta tag. Preserve it to maintain verification. If another owner needs to verify access, use that owner's exact token and Google's verification instructions.
3. Submit `https://samalyxx.github.io/appunpack/sitemap.xml` in the property's Sitemaps report. Google's [sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview) explains why a sitemap helps discovery but does not guarantee crawling or indexing.
4. Inspect the homepage URL with URL Inspection. Check the live URL and request indexing if the interface permits it.
5. Review indexing and search-performance reports after Google has had time to crawl the page. Correct reported problems and keep useful documentation current.

Search Console ownership verification requires the repository owner's Google account. It is a separate action from publishing the site. An indexing request is a request, not a promise of inclusion in search results.

## Maintaining discoverability

Use accurate [GitHub topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics), keep release notes and installation steps current, and link to the project from relevant documentation or profiles you control. Preserve working canonical and sitemap URLs if the site moves to a custom domain. There is no need to add keyword lists, fabricated ratings, download counts or indexing promises.
