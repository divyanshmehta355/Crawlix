import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { EventEmitter } from 'node:events';
import { detectBravePath } from './crawler.js';
import type {
  ExtractedDownloadLink,
  LoopCrawlConfig,
  LoopCrawlProgress,
} from './types.js';

export class BatchLoopCrawler extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private pausePromise: Promise<void> | null = null;
  private resolvePause: (() => void) | null = null;
  private shouldAbort: boolean = false;

  private progress: LoopCrawlProgress = {
    status: 'idle',
    currentPage: 1,
    totalCatalogPages: 1,
    currentIndex: 0,
    totalItems: 0,
    currentMovieTitle: '',
    currentStep: '',
    extractedCount: 0,
    failedCount: 0,
    elapsedMs: 0,
  };

  private extractedLinks: ExtractedDownloadLink[] = [];
  private startTime: number = 0;
  private intervalTimer: NodeJS.Timeout | null = null;

  public getProgress(): LoopCrawlProgress {
    if (this.isRunning && this.startTime) {
      this.progress.elapsedMs = Date.now() - this.startTime;
    }
    return { ...this.progress };
  }

  public getExtractedLinks(): ExtractedDownloadLink[] {
    return [...this.extractedLinks];
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.progress.status = 'paused';
    this.pausePromise = new Promise((resolve) => {
      this.resolvePause = resolve;
    });
    this.emit('progress', this.getProgress());
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.progress.status = 'running';
    if (this.resolvePause) {
      this.resolvePause();
      this.resolvePause = null;
      this.pausePromise = null;
    }
    this.emit('progress', this.getProgress());
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.shouldAbort = true;
    this.isPaused = false;
    if (this.resolvePause) {
      this.resolvePause();
      this.resolvePause = null;
    }
    this.progress.status = 'stopped';
    await this.cleanup();
    this.emit('progress', this.getProgress());
    this.emit('complete', { links: this.extractedLinks });
  }

  private async cleanup(): Promise<void> {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    } catch {}
  }

  /**
   * Constructs catalog pagination URLs (e.g. /page/2/ -> /page/3/)
   */
  private buildCatalogPageUrl(baseUrl: string, pageNum: number): string {
    if (baseUrl.includes('{page}')) {
      return baseUrl.replace(/\{page\}/gi, String(pageNum));
    }
    if (/\/page\/\d+\/?/i.test(baseUrl)) {
      return baseUrl.replace(/\/page\/\d+\/?/i, `/page/${pageNum}/`);
    }
    const clean = baseUrl.replace(/\/+$/, '');
    return pageNum === 1 ? clean + '/' : `${clean}/page/${pageNum}/`;
  }

  /**
   * Safely evaluates JavaScript inside a Playwright page, retrying if an ad redirect or
   * unexpected navigation momentarily destroys the execution context.
   */
  private async safeEvaluate<R>(
    page: Page,
    pageFunction: (...args: any[]) => R | Promise<R>,
    arg?: any
  ): Promise<R> {
    let lastError: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (page.isClosed()) throw new Error('Target page was closed');
        return await page.evaluate(pageFunction, arg);
      } catch (err: any) {
        lastError = err;
        const msg = (err.message || '').toLowerCase();
        if (
          msg.includes('execution context was destroyed') ||
          msg.includes('target closed') ||
          msg.includes('navigation') ||
          msg.includes('frame was detached')
        ) {
          console.log(`[Crawlix] Context navigation detected (attempt ${attempt + 1}/4), stabilizing...`);
          await page.waitForTimeout(1000);
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  /**
   * Fast direct token resolver: decodes atob tokens directly without browser overhead
   */
  private async resolveGatewayDirect(
    gatewayUrl: string,
    referer: string,
    serverPriority: string[]
  ): Promise<{ serverName: string; link: string } | null> {
    try {
      const res = await fetch(gatewayUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Referer: referer || 'https://vegamovies.gallery/',
        },
      });
      const html = await res.text();
      let targetHtml = html;

      // Decode atob(atob('...')) token script if present
      const scriptMatch = html.match(/atob\(atob\('([^']+)'\)\)/);
      if (scriptMatch && scriptMatch[1]) {
        try {
          const d1 = Buffer.from(scriptMatch[1], 'base64').toString('utf8');
          const tokenUrl = Buffer.from(d1, 'base64').toString('utf8');
          const tokenRes = await fetch(tokenUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              Referer: gatewayUrl,
            },
          });
          targetHtml = await tokenRes.text();
        } catch {}
      }

      // Parse server links
      const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const matches = [...targetHtml.matchAll(linkRegex)];

      for (const sName of serverPriority) {
        const regex = new RegExp(`\\b${sName}\\b`, 'i');
        const match = matches.find((m) => regex.test(m[2]) || regex.test(m[1]));
        if (match && match[1] && !match[1].startsWith('javascript:')) {
          return {
            serverName: match[2].replace(/<[^>]+>/g, '').trim() || sName,
            link: match[1],
          };
        }
      }

      // Fallback: look for Cloudflare R2 or direct storage
      const r2Match = matches.find(
        (m) =>
          m[1].includes('r2.cloudflarestorage.com') ||
          m[1].includes('.r2.dev') ||
          m[1].includes('pixeldrain')
      );
      if (r2Match && r2Match[1]) {
        return {
          serverName: r2Match[2].replace(/<[^>]+>/g, '').trim() || 'Direct Cloud R2',
          link: r2Match[1],
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  public async startLoop(config: LoopCrawlConfig): Promise<ExtractedDownloadLink[]> {
    if (this.isRunning) {
      throw new Error('A loop crawl is already active.');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.shouldAbort = false;
    this.extractedLinks = [];
    this.startTime = Date.now();

    this.progress = {
      status: 'running',
      currentPage: 1,
      totalCatalogPages: 1,
      currentIndex: 0,
      totalItems: 0,
      currentMovieTitle: 'Loading target page...',
      currentStep: 'Initializing Brave Browser...',
      extractedCount: 0,
      failedCount: 0,
      elapsedMs: 0,
    };
    this.emit('progress', this.getProgress());

    const bravePath = detectBravePath();
    const isHeadlessEnv = process.platform === 'linux' && !process.env.DISPLAY;
    const headless = isHeadlessEnv ? true : config.headless !== false;
    const qualityPriority = config.qualityPriority && config.qualityPriority.length > 0
      ? config.qualityPriority
      : ['1080p', '720p', '480p'];
    const serverPriority = config.serverPriority && config.serverPriority.length > 0
      ? config.serverPriority
      : ['FSLv2', 'FastServer', 'Server 1'];

    try {
      this.browser = await chromium.launch({
        executablePath: bravePath || undefined,
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-networking',
          '--disable-breakpad',
          '--disable-extensions',
          '--disable-blink-features=AutomationControlled',
          '--js-flags=--max-old-space-size=256',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Brave/128.0',
      });

      // Anti-bot stealth: remove automated flags
      await this.context.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          // @ts-ignore
          window.chrome = { runtime: {} };
        } catch {}
      });

      // Conserve memory on cloud hosts and block redirect scripts that destroy execution contexts
      await this.context.route('**/*', (route) => {
        const type = route.request().resourceType();
        const url = route.request().url().toLowerCase();

        if (['image', 'media', 'font'].includes(type)) {
          return route.abort();
        }

        // Block aggressive ad networks & redirect trackers that destroy the page execution context
        if (
          url.includes('adsterra') ||
          url.includes('monetag') ||
          url.includes('popads') ||
          url.includes('exoclick') ||
          url.includes('propellerads') ||
          url.includes('ad-maven') ||
          url.includes('llvpn.com') ||
          url.includes('alwingulla') ||
          url.includes('highperformancegate') ||
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('histats') ||
          url.includes('doubleclick')
        ) {
          return route.abort();
        }

        return route.continue();
      });

      const activeAllowedPages = new Set<Page>();

      // Handle pesky popup tabs that ad networks on streaming/movie sites spawn
      this.context.on('page', async (popup) => {
        try {
          await popup.waitForTimeout(400);
          if (!activeAllowedPages.has(popup)) {
            await popup.close();
          }
        } catch {}
      });

      this.intervalTimer = setInterval(() => {
        if (this.isRunning && this.progress.status === 'running') {
          this.progress.elapsedMs = Date.now() - this.startTime;
          this.emit('progress:tick', this.getProgress());
        }
      }, 1000);

      const catalogPage = await this.context.newPage();
      activeAllowedPages.add(catalogPage);

      // Check if target URL is already a single movie/series post (e.g. contains '/download-')
      const isSinglePostUrl = config.catalogUrl.includes('/download-');

      // Determine catalog page range
      let startPage = 1;
      let endPage = 1;

      if (!isSinglePostUrl) {
        if (config.enablePagination || (config.startPage !== undefined && config.endPage !== undefined)) {
          startPage = Math.max(1, config.startPage || 1);
          endPage = Math.max(startPage, config.endPage || startPage);
        } else {
          // Check if URL has a page number embedded e.g. /page/2/
          const pageMatch = config.catalogUrl.match(/\/page\/(\d+)\/?/i);
          const detectedPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;
          startPage = detectedPage;
          endPage = detectedPage;
        }
      }

      const totalCatalogPages = isSinglePostUrl ? 1 : (endPage - startPage + 1);
      this.progress.totalCatalogPages = totalCatalogPages;
      this.progress.currentPage = startPage;
      this.emit('progress', this.getProgress());

      let overallItemIndex = 0;

      // Outer loop: iterate across catalog pages
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        if (this.shouldAbort) break;

        let cardsOnPage: { url: string; title: string }[] = [];

        if (isSinglePostUrl) {
          // Direct single post URL (e.g. specific series/movie)
          this.progress.currentPage = 1;
          this.progress.totalCatalogPages = 1;
          this.progress.currentStep = `Target recognized as direct movie/series. Loading: ${config.catalogUrl}`;
          this.emit('progress', this.getProgress());

          try {
            await catalogPage.goto(config.catalogUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          } catch (err: any) {
            console.log(`[Crawlix] Target page initial goto warning: ${err.message}`);
          }
          await catalogPage.waitForTimeout(1000);

          const pageTitle = await catalogPage.evaluate(() => {
            const h1 = document.querySelector('h1.entry-title, h1');
            if (h1 && h1.textContent) return h1.textContent.trim().replace(/\s+/g, ' ');
            return document.title.replace(/\s+/g, ' ').trim();
          });
          cardsOnPage = [{ url: config.catalogUrl, title: pageTitle || 'Web Series / Movie' }];
        } else {
          // Dynamic catalog page URL
          const currentCatalogUrl = this.buildCatalogPageUrl(config.catalogUrl, pageNum);
          this.progress.currentPage = pageNum;
          this.progress.currentStep = `[Catalog Page ${pageNum}/${endPage}] Navigating to: ${currentCatalogUrl}`;
          this.emit('progress', this.getProgress());

          try {
            await catalogPage.goto(currentCatalogUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          } catch (err: any) {
            console.log(`[Crawlix] Catalog page ${pageNum} goto warning: ${err.message}`);
          }
          await catalogPage.waitForTimeout(1500);

          this.progress.currentStep = `[Catalog Page ${pageNum}/${endPage}] Discovering movie/show cards matching "${config.cardSelector}"...`;
          this.emit('progress', this.getProgress());

          const rawCards = await catalogPage.evaluate(
            ({ sel, titleSel }) => {
              const elements = document.querySelectorAll(sel);
              const results: { url: string; title: string }[] = [];

              elements.forEach((el) => {
                let href = '';
                if (el.tagName.toLowerCase() === 'a') {
                  href = (el as HTMLAnchorElement).href;
                } else {
                  const a = el.querySelector('a[href]');
                  if (a) href = (a as HTMLAnchorElement).href;
                }

                if (!href || href.startsWith('javascript:')) return;

                let title = '';
                if (titleSel) {
                  const titleEl = el.querySelector(titleSel);
                  if (titleEl) title = (titleEl.textContent || '').trim();
                }

                if (!title) {
                  const img = el.querySelector('img[alt]');
                  if (img) title = (img.getAttribute('alt') || '').trim();
                }

                if (!title) {
                  title = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
                }

                results.push({ url: href, title: title || 'Untitled Movie/Show' });
              });

              return results;
            },
            { sel: config.cardSelector, titleSel: config.titleSelector }
          );

          // Deduplicate cards on this page
          const seenUrls = new Set<string>();
          const uniqueOnPage: { url: string; title: string }[] = [];
          for (const card of rawCards) {
            if (!seenUrls.has(card.url)) {
              seenUrls.add(card.url);
              uniqueOnPage.push(card);
            }
          }

          cardsOnPage = config.maxItems && config.maxItems > 0
            ? uniqueOnPage.slice(0, config.maxItems)
            : uniqueOnPage;

          if (cardsOnPage.length === 0) {
            console.log(`[Crawlix] No movie cards found on catalog page ${pageNum}.`);
            if (pageNum === startPage && totalCatalogPages === 1) {
              throw new Error(
                `No movie cards found matching selector "${config.cardSelector}". Please verify the card selector.`
              );
            }
            continue;
          }
        }

        this.progress.totalItems += cardsOnPage.length;
        this.emit('progress', this.getProgress());

        // Inner loop: process each card on this catalog page
        for (let i = 0; i < cardsOnPage.length; i++) {
          if (this.shouldAbort) break;

          if (this.isPaused && this.pausePromise) {
            await this.pausePromise;
          }

          overallItemIndex++;
          this.progress.currentIndex = overallItemIndex;
          const card = cardsOnPage[i];
          this.progress.currentMovieTitle = card.title;
          const pagePrefix = totalCatalogPages > 1 ? `[Page ${pageNum}/${endPage}] ` : '';
          this.progress.currentStep = `${pagePrefix}[Item ${i + 1}/${cardsOnPage.length}] Opening: ${card.title.slice(0, 40)}...`;
          this.emit('progress', this.getProgress());

          let moviePage: Page | null = null;
          try {
            moviePage = await this.context.newPage();
            activeAllowedPages.add(moviePage);

            await moviePage.addInitScript(() => {
              try {
                window.close = () => { console.log('[Crawlix] Blocked script window.close()'); };
                window.onbeforeunload = null;
              } catch {}
            });

            moviePage.on('popup', async (popup) => {
              try {
                await popup.waitForTimeout(300);
                await popup.close();
              } catch {}
            });

            // Navigate to movie/series detail page
            try {
              await moviePage.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
            } catch (navErr: any) {
              if (navErr.message?.includes('timeout') && !moviePage.isClosed()) {
                console.log(`[Crawlix] Soft timeout for ${card.url}, proceeding with current DOM state`);
              } else {
                throw navErr;
              }
            }
            await moviePage.waitForTimeout(1000);

            // Retrieve full clean title if available
            const realTitle = await this.safeEvaluate(moviePage, () => {
              const h1 = document.querySelector('h1.entry-title, h1');
              if (h1 && h1.textContent) return h1.textContent.trim().replace(/\s+/g, ' ');
              return '';
            }).catch(() => '');
            if (realTitle) {
              card.title = realTitle;
              this.progress.currentMovieTitle = realTitle;
              this.emit('progress', this.getProgress());
            }

            // Sub-step 1: Pick Quality (Best available: 1080p > 720p > 480p)
            this.progress.currentStep = `${pagePrefix}[Item ${i + 1}/${cardsOnPage.length}] Finding best quality (${qualityPriority.join(' > ')})...`;
            this.emit('progress', this.getProgress());

            let qualityFound = '1080p';
            let downloadPageUrl = '';

            // Look for quality block in entry content (ignoring header/category navigation links)
            const qualityTarget = await this.safeEvaluate(moviePage, (priorities) => {
              const contentRoot = document.querySelector('.entry-content, main, article') || document.body;
              const headings = Array.from(contentRoot.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, p'));

              for (const q of priorities) {
                const regex = new RegExp(`\\b${q}\\b`, 'i');
                for (const h of headings) {
                  const txt = (h.textContent || '').trim();
                  if (regex.test(txt) && !h.closest('header, nav, footer, .sidebar, .widget, ul.menu')) {
                    // Search siblings for download landing anchor
                    let next = h.nextElementSibling;
                    let depth = 0;
                    while (next && depth < 6) {
                      const anchors = Array.from(next.querySelectorAll('a[href]'));
                      if (next.tagName.toLowerCase() === 'a') anchors.unshift(next as HTMLAnchorElement);

                      const validAnchors = anchors.filter((a) => {
                        const href = (a as HTMLAnchorElement).href;
                        return (
                          href &&
                          (href.includes('nexdrive') || href.includes('vcloud') || href.includes('fastdl') || href.includes('drive')) &&
                          !href.includes('/movies-by-quality/') &&
                          !href.includes('/category/') &&
                          !href.includes('/tag/')
                        );
                      });

                      if (validAnchors.length > 0) {
                        // Prioritize V-Cloud / Resumable for FSLv2 direct links
                        const vcloudAnchor = validAnchors.find((a) => /v-cloud|vcloud|resumable/i.test(a.textContent || ''));
                        const chosen = vcloudAnchor || validAnchors[0];
                        return { quality: q, link: (chosen as HTMLAnchorElement).href };
                      }
                      next = next.nextElementSibling;
                      depth++;
                    }
                  }
                }
              }

              // Fallback: search for any anchor linking to nexdrive or vcloud
              const allAnchors = Array.from(contentRoot.querySelectorAll('a[href]'));
              for (const q of priorities) {
                const regex = new RegExp(`\\b${q}\\b`, 'i');
                const match = allAnchors.find((a) => {
                  const href = (a as HTMLAnchorElement).href;
                  const text = a.textContent || '';
                  return (
                    (regex.test(text) || regex.test(href)) &&
                    (href.includes('nexdrive') || href.includes('vcloud') || href.includes('fastdl')) &&
                    !href.includes('/movies-by-quality/') &&
                    !href.includes('/category/')
                  );
                });
                if (match) {
                  return { quality: q, link: (match as HTMLAnchorElement).href };
                }
              }

              // Global fallback for any nexdrive landing link
              const genericNex = allAnchors.find((a) => (a as HTMLAnchorElement).href?.includes('nexdrive'));
              if (genericNex) {
                return { quality: '1080p', link: (genericNex as HTMLAnchorElement).href };
              }

              return null;
            }, qualityPriority);

            if (qualityTarget) {
              qualityFound = qualityTarget.quality;
              downloadPageUrl = qualityTarget.link;
            }

            // Navigate to download landing page (e.g. nexdrive.fit)
            if (downloadPageUrl && downloadPageUrl !== moviePage.url()) {
              this.progress.currentStep = `${pagePrefix}[Item ${i + 1}/${cardsOnPage.length}] Navigating to landing page (${downloadPageUrl.slice(0, 45)}...)...`;
              this.emit('progress', this.getProgress());
              await moviePage.goto(downloadPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await moviePage.waitForTimeout(1200);
            }

            // Sub-step 2: Discover All Episode Links (Web Series) or Single Item (Movie)
            const episodeCandidates = await this.safeEvaluate(moviePage, () => {
              const anchors = Array.from(document.querySelectorAll('a[href]'));
              const gatewayAnchors = anchors.filter((a) => {
                const href = (a as HTMLAnchorElement).href || '';
                // Exclude hashes, javascript, same-domain landing pages, and social/ad links
                if (!href || href.includes('#') || href.startsWith('javascript:')) return false;
                if (href.includes('nexdrive.fit') || href.includes('vegamovies')) return false;
                if (href.includes('t.me') || href.includes('telegram') || href.includes('whatsapp') || href.includes('category')) return false;

                // Strictly match download gateway providers
                return (
                  href.includes('vcloud.') ||
                  href.includes('hubcloud.') ||
                  href.includes('fastdl.') ||
                  href.includes('vegadrive.') ||
                  href.includes('fastserver')
                );
              });

              // Filter out duplicate gateway URLs
              const seen = new Set<string>();
              const uniqueGateways = gatewayAnchors.filter((a) => {
                const href = (a as HTMLAnchorElement).href;
                if (seen.has(href)) return false;
                seen.add(href);
                return true;
              });

              if (uniqueGateways.length === 0) return [];

              return uniqueGateways.map((a, idx) => {
                let label = '';
                let prev = a.closest('p, div, li, h3, h4, h5')?.previousElementSibling;
                for (let k = 0; k < 3 && prev; k++) {
                  const txt = (prev.textContent || '').trim();
                  if (/episode|ep\s*\d+|e0\d+|-\s*\d+\s*-/i.test(txt)) {
                    label = txt.replace(/[-:_]/g, ' ').replace(/\s+/g, ' ').trim();
                    break;
                  }
                  prev = prev.previousElementSibling;
                }
                if (!label) {
                  const aText = (a.textContent || '').trim();
                  if (/episode|ep\s*\d+/i.test(aText)) {
                    label = aText;
                  } else if (uniqueGateways.length > 1) {
                    label = `Episode ${idx + 1}`;
                  }
                }
                return {
                  url: (a as HTMLAnchorElement).href,
                  label,
                };
              });
            });

            const itemsToProcess = episodeCandidates.length > 0
              ? episodeCandidates
              : [{ url: moviePage.url(), label: '' }];
            const isSeries = itemsToProcess.length > 1;

            if (isSeries) {
              this.progress.currentStep = `${pagePrefix}[Item ${i + 1}/${cardsOnPage.length}] 📺 Found ${itemsToProcess.length} episodes for "${card.title}". Extracting all episodes...`;
              this.emit('progress', this.getProgress());
            }

            // Sub-step 3: Iterate through each episode (or single movie)
            for (let epIdx = 0; epIdx < itemsToProcess.length; epIdx++) {
              if (this.shouldAbort) break;

              const ep = itemsToProcess[epIdx];
              const epTag = ep.label ? `[${ep.label}]` : '';
              this.progress.currentStep = `${pagePrefix}Resolving download link ${epTag}...`;
              this.emit('progress', this.getProgress());

              let finalServerName = 'Direct Cloud';
              let finalDownloadLink = '';

              // 1. Attempt fast token decode direct resolution first
              const directResult = await this.resolveGatewayDirect(ep.url, moviePage.url(), serverPriority);
              if (directResult && directResult.link) {
                finalServerName = directResult.serverName;
                finalDownloadLink = directResult.link;
              } else {
                // 2. Browser fallback: navigate to gateway and evaluate token or generate button
                try {
                  await moviePage.goto(ep.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
                  await moviePage.waitForTimeout(1000);

                  const tokenUrl = await this.safeEvaluate(moviePage, () => {
                    const scripts = Array.from(document.querySelectorAll('script')).map((s) => s.textContent || '');
                    const match = scripts.find((s) => s.includes('atob(atob('));
                    if (match) {
                      const b64 = match.match(/atob\(atob\('([^']+)'\)\)/);
                      if (b64 && b64[1]) {
                        try {
                          return atob(atob(b64[1]));
                        } catch {}
                      }
                    }
                    return null;
                  });

                  if (tokenUrl) {
                    await moviePage.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
                    await moviePage.waitForTimeout(1200);
                  } else {
                    const genClicked = await this.safeEvaluate(moviePage, () => {
                      const btn = document.querySelector('#download, button[id*="download"], .btn-success') as HTMLElement;
                      if (btn) {
                        btn.click();
                        return true;
                      }
                      return false;
                    });
                    if (genClicked) {
                      await moviePage.waitForTimeout(2500);
                    }
                  }

                  // Extract priority server link
                  const serverResult = await this.safeEvaluate(moviePage, (priorities) => {
                    const clickables = Array.from(document.querySelectorAll('a[href]'));
                    for (const sName of priorities) {
                      const regex = new RegExp(`\\b${sName}\\b`, 'i');
                      const match = clickables.find((el) =>
                        regex.test(el.textContent || '') ||
                        regex.test(el.getAttribute('href') || '')
                      );
                      if (match) {
                        const href = (match as HTMLAnchorElement).href;
                        if (href && !href.startsWith('javascript:')) {
                          return { serverName: sName, link: href };
                        }
                      }
                    }

                    const directStorage = clickables.find((el) => {
                      const h = (el as HTMLAnchorElement).href || '';
                      return h.includes('r2.cloudflarestorage.com') || h.includes('.r2.dev') || h.includes('pixeldrain');
                    });
                    if (directStorage) {
                      return {
                        serverName: (directStorage.textContent || 'Cloudflare R2').trim().slice(0, 30),
                        link: (directStorage as HTMLAnchorElement).href,
                      };
                    }

                    return null;
                  }, serverPriority);

                  if (serverResult) {
                    finalServerName = serverResult.serverName;
                    finalDownloadLink = serverResult.link;
                  }
                } catch (browserResErr) {
                  console.log(`[Crawlix] Browser resolution error for ${ep.url}:`, browserResErr);
                }
              }

              const isValidDownload =
                Boolean(finalDownloadLink) &&
                finalDownloadLink.startsWith('http') &&
                !finalDownloadLink.includes('#') &&
                !finalDownloadLink.includes('nexdrive.fit') &&
                finalDownloadLink !== card.url &&
                finalDownloadLink !== ep.url;

              if (isValidDownload) {
                const itemTitle = ep.label ? `${card.title} - ${ep.label}` : card.title;
                const extractedItem: ExtractedDownloadLink = {
                  id: `link-${Date.now()}-${pageNum}-${i}-${epIdx}`,
                  index: this.extractedLinks.length + 1,
                  movieTitle: itemTitle,
                  qualitySelected: qualityFound,
                  serverName: finalServerName || 'FSLv2 Server',
                  downloadLink: finalDownloadLink,
                  cardUrl: card.url,
                  status: 'success',
                  timestamp: Date.now(),
                };

                this.extractedLinks.push(extractedItem);
                this.progress.extractedCount = this.extractedLinks.length;
                this.emit('item_extracted', extractedItem);
                this.emit('progress', this.getProgress());
              }

              if (config.delayMs && config.delayMs > 0) {
                await new Promise((r) => setTimeout(r, config.delayMs));
              }
            }
          } catch (itemErr: any) {
            this.progress.failedCount++;
            const failedItem: ExtractedDownloadLink = {
              id: `err-${Date.now()}-${pageNum}-${i}`,
              index: this.extractedLinks.length + 1,
              movieTitle: card.title,
              qualitySelected: 'Failed',
              serverName: 'N/A',
              downloadLink: '',
              cardUrl: card.url,
              status: 'failed',
              timestamp: Date.now(),
              errorMessage: itemErr.message,
            };
            this.extractedLinks.push(failedItem);
            this.emit('item_extracted', failedItem);
          } finally {
            if (moviePage) {
              activeAllowedPages.delete(moviePage);
              try {
                if (!moviePage.isClosed()) {
                  await moviePage.close();
                }
              } catch {}
            }
          }
        }

        if (isSinglePostUrl) {
          break;
        }
      }

      this.progress.status = 'completed';
      const pageInfo = totalCatalogPages > 1 ? ` across ${totalCatalogPages} catalog pages` : '';
      this.progress.currentStep = `Finished! Extracted download links for ${this.extractedLinks.length} items${pageInfo}.`;
      await this.cleanup();
      this.emit('progress', this.getProgress());
      this.emit('complete', { links: this.extractedLinks });
      return this.extractedLinks;
    } catch (err: any) {
      this.progress.status = 'error';
      this.progress.currentStep = `Crawl failed: ${err.message}`;
      await this.cleanup();
      this.emit('progress', this.getProgress());
      throw err;
    }
  }
}
