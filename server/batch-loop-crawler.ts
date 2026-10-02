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
      currentIndex: 0,
      totalItems: 0,
      currentMovieTitle: 'Loading catalog page...',
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

      // Conserve memory on cloud hosts (Render 512MB RAM): block heavy media/images/fonts
      await this.context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font'].includes(type)) {
          return route.abort();
        }
        return route.continue();
      });

      const activeAllowedPages = new Set<Page>();

      // Handle pesky popup tabs that ad networks on streaming/movie sites spawn
      this.context.on('page', async (popup) => {
        try {
          // Wait brief moment to confirm if this page was created by Crawlix or an ad script
          await popup.waitForTimeout(400);
          if (!activeAllowedPages.has(popup)) {
            // It is an unrequested popup ad / new window: close it
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

      // Step 1: Open catalog page
      this.progress.currentStep = `Navigating to catalog: ${config.catalogUrl}`;
      this.emit('progress', this.getProgress());

      try {
        await catalogPage.goto(config.catalogUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      } catch (err: any) {
        console.log(`[Crawlix] Catalog page initial goto warning: ${err.message}`);
      }
      await catalogPage.waitForTimeout(1500);

      // Step 2: Query all cards matching selector
      this.progress.currentStep = `Discovering movie/show cards matching "${config.cardSelector}"...`;
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

            // Extract title
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

      // Deduplicate cards by URL
      const uniqueCards: { url: string; title: string }[] = [];
      const seenUrls = new Set<string>();
      for (const card of rawCards) {
        if (!seenUrls.has(card.url)) {
          seenUrls.add(card.url);
          uniqueCards.push(card);
        }
      }

      const totalToCrawl = config.maxItems && config.maxItems > 0
        ? uniqueCards.slice(0, config.maxItems)
        : uniqueCards;

      this.progress.totalItems = totalToCrawl.length;
      this.emit('progress', this.getProgress());

      if (totalToCrawl.length === 0) {
        throw new Error(
          `No movie cards found matching selector "${config.cardSelector}". Please verify the card selector.`
        );
      }

      // Step 3: Loop over each card
      for (let i = 0; i < totalToCrawl.length; i++) {
        if (this.shouldAbort) break;

        if (this.isPaused && this.pausePromise) {
          await this.pausePromise;
        }

        const card = totalToCrawl[i];
        this.progress.currentIndex = i + 1;
        this.progress.currentMovieTitle = card.title;
        this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Opening movie card...`;
        this.emit('progress', this.getProgress());

        let moviePage: Page | null = null;
        try {
          moviePage = await this.context.newPage();
          activeAllowedPages.add(moviePage);

          // Prevent rogue redirect scripts on movie page from killing the window
          await moviePage.addInitScript(() => {
            try {
              window.close = () => { console.log('[Crawlix] Blocked script window.close()'); };
            } catch {}
          });

          // Auto-close ad popups spawned from this movie page
          moviePage.on('popup', async (popup) => {
            try {
              await popup.waitForTimeout(300);
              await popup.close();
            } catch {}
          });

          // Navigate to movie detail page
          try {
            await moviePage.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
          } catch (navErr: any) {
            if (navErr.message?.includes('timeout') && !moviePage.isClosed()) {
              console.log(`[Crawlix] Soft timeout for ${card.url}, proceeding with current DOM state`);
            } else {
              throw navErr;
            }
          }
          await moviePage.waitForTimeout(800);

          // Sub-step 1: Pick Quality (Best available: 1080p > 720p > 480p)
          this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Finding best quality (${qualityPriority.join(' > ')})...`;
          this.emit('progress', this.getProgress());

          let qualityFound = '1080p';
          let downloadPageUrl = '';

          // Look for quality block on movie page (e.g. 1080p heading followed by Download Now or nexdrive link)
          const qualityTarget = await moviePage.evaluate((priorities) => {
            // Check headings and find the corresponding download button right after it
            for (const q of priorities) {
              const regex = new RegExp(`\\b${q}\\b`, 'i');
              const headings = Array.from(document.querySelectorAll('h3, h4, h5, p, div'));
              for (const h of headings) {
                if (regex.test(h.textContent || '') && (h.textContent || '').includes('WEB-DL') || regex.test(h.textContent || '')) {
                  // Find next sibling or parent anchor
                  let next = h.nextElementSibling;
                  while (next) {
                    const a = next.tagName.toLowerCase() === 'a' ? next : next.querySelector('a[href]');
                    if (a) {
                      const href = (a as HTMLAnchorElement).href;
                      if (href && (href.includes('nexdrive') || href.includes('vcloud') || href.includes('fastdl') || href.includes('drive') || a.textContent?.includes('Download'))) {
                        return { quality: q, link: href };
                      }
                    }
                    next = next.nextElementSibling;
                  }
                }
              }
            }

            // Fallback: look for any quality link directly
            for (const q of priorities) {
              const regex = new RegExp(`\\b${q}\\b`, 'i');
              const clickables = Array.from(document.querySelectorAll('a[href]'));
              const match = clickables.find((el) => regex.test(el.textContent || '') || regex.test(el.getAttribute('href') || ''));
              if (match) {
                return { quality: q, link: (match as HTMLAnchorElement).href };
              }
            }

            return null;
          }, qualityPriority);

          if (qualityTarget) {
            qualityFound = qualityTarget.quality;
            downloadPageUrl = qualityTarget.link;
          }

          // If a download page URL was found (e.g. nexdrive.fit), navigate there!
          if (downloadPageUrl && downloadPageUrl !== moviePage.url()) {
            this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Navigating to landing page (${downloadPageUrl.slice(0, 45)}...)...`;
            this.emit('progress', this.getProgress());
            await moviePage.goto(downloadPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await moviePage.waitForTimeout(1000);
          }

          // Sub-step 2: If on an intermediary server landing page (e.g. nexdrive), look for V-Cloud or Fast Server
          const vcloudLink = await moviePage.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            // Look for V-Cloud, Fast Server, or direct link
            const vcloud = anchors.find((a) =>
              /v-cloud|vcloud|fast server/i.test(a.textContent || '') ||
              (a as HTMLAnchorElement).href.includes('vcloud.fit') ||
              (a as HTMLAnchorElement).href.includes('hubcloud')
            );
            if (vcloud) return (vcloud as HTMLAnchorElement).href;
            return null;
          });

          if (vcloudLink) {
            this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Navigating to V-Cloud server gateway...`;
            this.emit('progress', this.getProgress());
            await moviePage.goto(vcloudLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await moviePage.waitForTimeout(1000);
          }

          // Sub-step 3: Generate Download Link (V-Cloud token generator)
          this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Generating download tokens & servers...`;
          this.emit('progress', this.getProgress());

          // Check if V-Cloud has atob token script directly to jump straight to server list
          const tokenUrl = await moviePage.evaluate(() => {
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
            this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Bypassing generator directly to server list...`;
            this.emit('progress', this.getProgress());
            await moviePage.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await moviePage.waitForTimeout(1500);
          } else {
            // Otherwise click Generate Download Link button
            const genClicked = await moviePage.evaluate(() => {
              const btn = document.querySelector('#download, button[id*="download"], .btn-success, button:has-text("Generate")') as HTMLElement;
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

          // Sub-step 4: Extract Top Priority Server (FSLv2 Server)
          this.progress.currentStep = `[${i + 1}/${totalToCrawl.length}] Resolving top server link (${serverPriority[0] || 'FSLv2'})...`;
          this.emit('progress', this.getProgress());

          const serverResult = await moviePage.evaluate((priorities) => {
            const clickables = Array.from(document.querySelectorAll('a[href]'));

            // 1. Prioritize FSLv2 specifically
            for (const sName of priorities) {
              const regex = new RegExp(`\\b${sName}\\b`, 'i');
              const match = clickables.find((el) =>
                regex.test(el.textContent || '') ||
                regex.test(el.getAttribute('href') || '') ||
                regex.test(el.className)
              );
              if (match) {
                const href = (match as HTMLAnchorElement).href;
                if (href && !href.startsWith('javascript:')) {
                  return {
                    serverName: sName,
                    link: href,
                  };
                }
              }
            }

            // 2. Look for Cloudflare R2 direct storage links or direct media files (.mkv, .mp4)
            const directStorage = clickables.find((el) => {
              const h = (el as HTMLAnchorElement).href || '';
              return h.includes('r2.cloudflarestorage.com') || h.includes('.r2.dev') || h.includes('pixeldrain') || h.includes('hubcloud');
            });
            if (directStorage) {
              return {
                serverName: (directStorage.textContent || 'Direct Cloud').trim().slice(0, 30),
                link: (directStorage as HTMLAnchorElement).href,
              };
            }

            // 3. Fallback: find any link that says "Download"
            const fallbackLink = clickables.find((el) => {
              const text = (el.textContent || '').toLowerCase();
              const href = (el as HTMLAnchorElement).href || '';
              return (
                (text.includes('download') || text.includes('server')) &&
                href &&
                !href.startsWith('javascript:') &&
                !href.includes('t.me') &&
                !href.includes('google.com')
              );
            });

            if (fallbackLink) {
              return {
                serverName: (fallbackLink.textContent || 'Mirror Server').trim().slice(0, 30),
                link: (fallbackLink as HTMLAnchorElement).href || '',
              };
            }

            return null;
          }, serverPriority);

          const finalServerName = serverResult?.serverName || 'Direct / Fallback';
          const finalDownloadLink = serverResult?.link || moviePage.url();

          const extractedItem: ExtractedDownloadLink = {
            id: `link-${Date.now()}-${i}`,
            index: i + 1,
            movieTitle: card.title,
            qualitySelected: qualityFound,
            serverName: finalServerName,
            downloadLink: finalDownloadLink,
            cardUrl: card.url,
            status: finalDownloadLink && finalDownloadLink !== card.url ? 'success' : 'warning',
            timestamp: Date.now(),
          };

          this.extractedLinks.push(extractedItem);
          this.progress.extractedCount = this.extractedLinks.length;
          this.emit('item_extracted', extractedItem);
          this.emit('progress', this.getProgress());

          // Respect delay between items
          if (config.delayMs && config.delayMs > 0) {
            await new Promise((r) => setTimeout(r, config.delayMs));
          }
        } catch (itemErr: any) {
          this.progress.failedCount++;
          const failedItem: ExtractedDownloadLink = {
            id: `err-${Date.now()}-${i}`,
            index: i + 1,
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

      this.progress.status = 'completed';
      this.progress.currentStep = `Finished! Extracted download links for ${this.extractedLinks.length} items.`;
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
