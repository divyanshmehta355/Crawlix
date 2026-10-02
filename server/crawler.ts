import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type {
  CrawlConfig,
  CrawlLog,
  CrawlStats,
  DiscoveredLink,
  ExtractedImage,
  GraphLink,
  GraphNode,
  PageData,
  PageHeading,
} from './types.js';

interface QueueItem {
  url: string;
  depth: number;
  parentUrl?: string;
}

export function detectBravePath(): string {
  // 1. Explicit environment variables
  if (process.env.BRAVE_PATH && fs.existsSync(process.env.BRAVE_PATH)) {
    return process.env.BRAVE_PATH;
  }
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }

  // 2. Candidate paths by OS
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    // Windows
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    localAppData ? path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') : '',
    // Linux / Docker
    '/usr/bin/brave-browser',
    '/usr/bin/brave',
    '/snap/bin/brave',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    // macOS
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Check Playwright's installed browser cache in Linux Docker/Render
  try {
    const pwDir = '/ms-playwright';
    if (fs.existsSync(pwDir)) {
      const files = fs.readdirSync(pwDir);
      for (const dir of files) {
        if (dir.startsWith('chromium')) {
          const chromePath = path.join(pwDir, dir, 'chrome-linux', 'chrome');
          if (fs.existsSync(chromePath)) return chromePath;
        }
      }
    }
  } catch {}

  // On Windows, fallback to standard Brave path; on Linux/Mac, return empty to let Playwright resolve
  if (process.platform === 'win32') {
    return candidates[0] || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
  }

  return '';
}

export class CrawlerEngine extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private pausePromise: Promise<void> | null = null;
  private resolvePause: (() => void) | null = null;
  private shouldAbort: boolean = false;

  private queue: QueueItem[] = [];
  private visitedUrls: Set<string> = new Set();
  private queuedUrls: Set<string> = new Set();

  private pages: Map<string, PageData> = new Map();
  private graphNodes: Map<string, GraphNode> = new Map();
  private graphLinks: GraphLink[] = [];
  private logs: CrawlLog[] = [];

  private stats: CrawlStats = {
    status: 'idle',
    pagesCrawled: 0,
    pagesQueued: 0,
    pagesFailed: 0,
    avgLatencyMs: 0,
    elapsedMs: 0,
    activeWorkers: 0,
    totalLinksFound: 0,
    totalImagesFound: 0,
  };

  private latencies: number[] = [];
  private startHost: string = '';
  private config: CrawlConfig | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public getStats(): CrawlStats {
    if (this.stats.status === 'running' && this.stats.startTime) {
      this.stats.elapsedMs = Date.now() - this.stats.startTime;
    }
    return { ...this.stats };
  }

  public getPages(): PageData[] {
    return Array.from(this.pages.values());
  }

  public getPageById(id: string): PageData | undefined {
    return this.pages.get(id);
  }

  public getGraphData(): { nodes: GraphNode[]; links: GraphLink[] } {
    return {
      nodes: Array.from(this.graphNodes.values()),
      links: [...this.graphLinks],
    };
  }

  public getLogs(): CrawlLog[] {
    return [...this.logs];
  }

  public getConfig(): CrawlConfig | null {
    return this.config;
  }

  private addLog(level: CrawlLog['level'], message: string, url?: string) {
    const log: CrawlLog = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      level,
      message,
      url,
    };
    this.logs.push(log);
    if (this.logs.length > 500) {
      this.logs.shift();
    }
    this.emit('log', log);
  }

  private normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
    try {
      const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      parsed.hash = '';
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      parsed.pathname = pathname;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private isAllowedDomain(targetUrl: string): boolean {
    if (!this.config?.sameDomainOnly) return true;
    try {
      const parsed = new URL(targetUrl);
      return parsed.hostname === this.startHost;
    } catch {
      return false;
    }
  }

  public async start(config: CrawlConfig): Promise<void> {
    if (this.isRunning) {
      throw new Error('A crawl is already in progress.');
    }

    this.config = config;
    this.isRunning = true;
    this.isPaused = false;
    this.shouldAbort = false;
    this.queue = [];
    this.visitedUrls.clear();
    this.queuedUrls.clear();
    this.pages.clear();
    this.graphNodes.clear();
    this.graphLinks = [];
    this.logs = [];
    this.latencies = [];

    const normalizedStartUrl = this.normalizeUrl(config.startUrl);
    if (!normalizedStartUrl) {
      this.isRunning = false;
      throw new Error('Invalid start URL provided.');
    }

    try {
      this.startHost = new URL(normalizedStartUrl).hostname;
    } catch (e: any) {
      this.isRunning = false;
      throw new Error(`Failed to parse start URL host: ${e.message}`);
    }

    this.stats = {
      status: 'running',
      pagesCrawled: 0,
      pagesQueued: 1,
      pagesFailed: 0,
      avgLatencyMs: 0,
      startTime: Date.now(),
      elapsedMs: 0,
      activeWorkers: 0,
      totalLinksFound: 0,
      totalImagesFound: 0,
      currentUrl: normalizedStartUrl,
    };

    this.queue.push({ url: normalizedStartUrl, depth: 0 });
    this.queuedUrls.add(normalizedStartUrl);

    // Initial graph root node
    const rootNode: GraphNode = {
      id: normalizedStartUrl,
      url: normalizedStartUrl,
      title: 'Target Origin',
      statusCode: 0,
      depth: 0,
      linksCount: 0,
    };
    this.graphNodes.set(normalizedStartUrl, rootNode);

    const braveExecutable = config.bravePath || detectBravePath();
    this.addLog('info', `Initializing Brave Browser from: ${braveExecutable}`);
    this.addLog('info', `Crawl parameters: Max Pages: ${config.maxPages}, Max Depth: ${config.maxDepth}, Concurrency: ${config.concurrency}, Headless: ${config.headless}`);

    // Launch Brave
    try {
      this.browser = await chromium.launch({
        executablePath: braveExecutable,
        headless: config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: {
          width: config.viewportWidth || 1280,
          height: config.viewportHeight || 800,
        },
        userAgent:
          config.customUserAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Brave/128.0',
      });

      this.addLog('success', 'Brave Browser launched successfully!');
    } catch (err: any) {
      this.isRunning = false;
      this.stats.status = 'error';
      this.addLog('error', `Failed to launch Brave: ${err.message}`);
      throw err;
    }

    this.emit('status', this.getStats());

    // Timer for elapsed time tracking
    this.intervalTimer = setInterval(() => {
      if (this.isRunning && this.stats.status === 'running') {
        this.stats.elapsedMs = Date.now() - (this.stats.startTime || Date.now());
        this.emit('stats:tick', this.getStats());
      }
    }, 1000);

    // Run crawler loop in background
    this.runCrawlerLoop().catch((err) => {
      this.addLog('error', `Crawl worker error: ${err.message}`);
    });
  }

  public pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.stats.status = 'paused';
    this.pausePromise = new Promise((resolve) => {
      this.resolvePause = resolve;
    });
    this.addLog('warn', 'Crawl paused by user.');
    this.emit('status', this.getStats());
  }

  public resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.stats.status = 'running';
    if (this.resolvePause) {
      this.resolvePause();
      this.resolvePause = null;
      this.pausePromise = null;
    }
    this.addLog('info', 'Crawl resumed.');
    this.emit('status', this.getStats());
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.shouldAbort = true;
    this.isPaused = false;
    if (this.resolvePause) {
      this.resolvePause();
      this.resolvePause = null;
    }
    this.addLog('warn', 'Stopping crawl and releasing Brave Browser...');
    await this.cleanup();
    this.stats.status = 'stopped';
    this.stats.endTime = Date.now();
    this.emit('status', this.getStats());
    this.emit('complete', { stats: this.getStats() });
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
    } catch (e: any) {
      // Ignore cleanup error
    }
  }

  private async runCrawlerLoop(): Promise<void> {
    const concurrency = Math.max(1, Math.min(this.config?.concurrency || 2, 5));
    const activePromises: Set<Promise<void>> = new Set();

    while (
      !this.shouldAbort &&
      this.queue.length > 0 &&
      this.pages.size < (this.config?.maxPages || 20)
    ) {
      if (this.isPaused && this.pausePromise) {
        await this.pausePromise;
      }

      if (this.shouldAbort) break;

      while (activePromises.size < concurrency && this.queue.length > 0) {
        if (this.pages.size + activePromises.size >= (this.config?.maxPages || 20)) {
          break;
        }

        const nextItem = this.queue.shift();
        if (!nextItem) break;

        if (this.visitedUrls.has(nextItem.url)) {
          continue;
        }

        this.visitedUrls.add(nextItem.url);
        this.stats.pagesQueued = this.queue.length;

        const workerPromise = this.crawlPage(nextItem)
          .catch((err) => {
            this.addLog('error', `Worker error crawling ${nextItem.url}: ${err.message}`);
          })
          .finally(() => {
            activePromises.delete(workerPromise);
            this.stats.activeWorkers = activePromises.size;
            this.stats.pagesQueued = this.queue.length;
            this.emit('status', this.getStats());
          });

        activePromises.add(workerPromise);
        this.stats.activeWorkers = activePromises.size;
        this.emit('status', this.getStats());

        // Respect crawl delay
        if (this.config?.delayMs && this.config.delayMs > 0) {
          await new Promise((r) => setTimeout(r, this.config!.delayMs));
        }
      }

      if (activePromises.size > 0) {
        await Promise.race(activePromises);
      } else if (this.queue.length === 0) {
        break;
      }
    }

    // Wait for all remaining in-flight workers
    await Promise.all(activePromises);

    this.addLog(
      'success',
      `Crawl completed! Crawled ${this.pages.size} pages. Found ${this.stats.totalLinksFound} links.`
    );
    this.stats.status = 'completed';
    this.stats.endTime = Date.now();
    await this.cleanup();
    this.emit('status', this.getStats());
    this.emit('complete', { stats: this.getStats(), totalPages: this.pages.size });
  }

  private async crawlPage(item: QueueItem): Promise<void> {
    if (!this.context || this.shouldAbort) return;

    const startTime = Date.now();
    this.stats.currentUrl = item.url;
    this.addLog('info', `Visiting [Depth ${item.depth}]: ${item.url}`, item.url);

    let page: Page | null = null;
    let statusCode = 200;
    let statusText = 'OK';
    let errorMessage: string | undefined;

    try {
      page = await this.context.newPage();

      // Intercept errors and console if helpful
      page.on('pageerror', (err) => {
        // Suppress noisy client runtime exceptions unless debugging
      });

      const response = await page.goto(item.url, {
        waitUntil: 'domcontentloaded',
        timeout: 25000,
      });

      if (response) {
        statusCode = response.status();
        statusText = response.statusText();
      }

      // Small pause for client SPA rendering (React/Vue/Angular dynamic content)
      await page.waitForTimeout(600);

      // Extract comprehensive page data
      const pageInfo = await page.evaluate(() => {
        const title = document.title || '';
        const metaDesc =
          document.querySelector('meta[name="description"]')?.getAttribute('content') ||
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
          '';

        const canonical =
          document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

        // Favicon
        const faviconElem =
          document.querySelector('link[rel="icon"]') ||
          document.querySelector('link[rel="shortcut icon"]');
        const favicon = faviconElem?.getAttribute('href') || '/favicon.ico';

        // OpenGraph
        const og: Record<string, string> = {};
        document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
          const prop = el.getAttribute('property');
          const content = el.getAttribute('content');
          if (prop && content) {
            og[prop] = content;
          }
        });

        // Headings
        const headings: PageHeading[] = [];
        document.querySelectorAll('h1, h2, h3').forEach((h) => {
          const text = (h.textContent || '').trim();
          if (text) {
            const level = parseInt(h.tagName.substring(1), 10);
            headings.push({ level, text });
          }
        });

        // Text summary
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        const removeTags = ['script', 'style', 'noscript', 'svg', 'iframe'];
        removeTags.forEach((tag) => {
          bodyClone.querySelectorAll(tag).forEach((el) => el.remove());
        });
        const fullText = (bodyClone.innerText || bodyClone.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        const contentPreview = fullText.slice(0, 400);

        // Simple Markdown conversion of main content
        const markdownLines: string[] = [];
        const contentElements = document.querySelectorAll('h1, h2, h3, h4, p, li, pre');
        contentElements.forEach((el) => {
          const tag = el.tagName.toLowerCase();
          const txt = (el.textContent || '').trim();
          if (!txt) return;
          if (tag === 'h1') markdownLines.push(`\n# ${txt}\n`);
          else if (tag === 'h2') markdownLines.push(`\n## ${txt}\n`);
          else if (tag === 'h3') markdownLines.push(`\n### ${txt}\n`);
          else if (tag === 'li') markdownLines.push(`* ${txt}`);
          else if (tag === 'pre') markdownLines.push(`\`\`\`\n${txt}\n\`\`\``);
          else markdownLines.push(`\n${txt}\n`);
        });

        // Discovered links
        const rawLinks: { href: string; text: string }[] = [];
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = a.getAttribute('href');
          const text = (a.textContent || '').trim().replace(/\s+/g, ' ');
          if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            rawLinks.push({ href, text });
          }
        });

        // Discovered images
        const rawImages: ExtractedImage[] = [];
        document.querySelectorAll('img[src]').forEach((img) => {
          const src = img.getAttribute('src');
          const alt = (img.getAttribute('alt') || '').trim();
          if (src && !src.startsWith('data:')) {
            rawImages.push({ src, alt });
          }
        });

        return {
          title,
          metaDesc,
          canonical,
          favicon,
          og,
          headings,
          contentPreview,
          markdownContent: markdownLines.join('\n').slice(0, 10000),
          rawLinks,
          rawImages,
        };
      });

      // Capture screenshot thumbnail
      let screenshot: string | undefined;
      try {
        const screenshotBuf = await page.screenshot({
          type: 'jpeg',
          quality: 55,
        });
        screenshot = `data:image/jpeg;base64,${screenshotBuf.toString('base64')}`;
      } catch (e) {
        // Screenshot optional
      }

      const loadTimeMs = Date.now() - startTime;
      this.latencies.push(loadTimeMs);
      this.stats.avgLatencyMs = Math.round(
        this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      );

      // Process and normalize links
      const links: DiscoveredLink[] = [];
      let internalCount = 0;
      let externalCount = 0;

      for (const raw of pageInfo.rawLinks) {
        const norm = this.normalizeUrl(raw.href, item.url);
        if (!norm) continue;

        let isInternal = false;
        try {
          const parsed = new URL(norm);
          isInternal = parsed.hostname === this.startHost;
        } catch {
          isInternal = false;
        }

        if (isInternal) {
          internalCount++;
          // Queue internal links if within depth limit and not yet queued/visited
          if (
            item.depth + 1 <= (this.config?.maxDepth || 3) &&
            !this.visitedUrls.has(norm) &&
            !this.queuedUrls.has(norm)
          ) {
            this.queue.push({
              url: norm,
              depth: item.depth + 1,
              parentUrl: item.url,
            });
            this.queuedUrls.add(norm);
          }
        } else {
          externalCount++;
        }

        links.push({
          href: norm,
          text: raw.text || norm,
          isInternal,
        });

        // Add edge to graph if internal or direct external reference
        if (isInternal && !this.graphLinks.some((l) => l.source === item.url && l.target === norm)) {
          this.graphLinks.push({
            source: item.url,
            target: norm,
          });
        }
      }

      // Process images
      const images: ExtractedImage[] = [];
      for (const img of pageInfo.rawImages) {
        try {
          const absSrc = new URL(img.src, item.url).href;
          images.push({ src: absSrc, alt: img.alt });
        } catch {
          // ignore invalid image src
        }
      }

      const pageId = Math.random().toString(36).substring(2, 9);
      const pageData: PageData = {
        id: pageId,
        url: item.url,
        title: pageInfo.title || item.url,
        statusCode,
        statusText,
        depth: item.depth,
        parentUrl: item.parentUrl,
        metaDescription: pageInfo.metaDesc,
        favicon: pageInfo.favicon,
        canonicalUrl: pageInfo.canonical,
        openGraph: pageInfo.og,
        headings: pageInfo.headings,
        contentPreview: pageInfo.contentPreview,
        markdownContent: pageInfo.markdownContent,
        internalLinksCount: internalCount,
        externalLinksCount: externalCount,
        links,
        images,
        screenshot,
        loadTimeMs,
        timestamp: Date.now(),
      };

      this.pages.set(item.url, pageData);
      this.stats.pagesCrawled = this.pages.size;
      this.stats.totalLinksFound += links.length;
      this.stats.totalImagesFound += images.length;

      // Update graph node
      const node: GraphNode = {
        id: item.url,
        url: item.url,
        title: pageInfo.title || item.url,
        statusCode,
        depth: item.depth,
        linksCount: links.length,
      };
      this.graphNodes.set(item.url, node);

      this.addLog(
        statusCode >= 400 ? 'warn' : 'success',
        `Crawled [${statusCode} ${statusText}] ${pageInfo.title.slice(0, 30)} (${loadTimeMs}ms) - Found ${links.length} links`,
        item.url
      );

      this.emit('page', pageData);
      this.emit('graph', { node, links: this.graphLinks.filter((l) => l.source === item.url) });
    } catch (err: any) {
      errorMessage = err.message || 'Navigation failed';
      this.stats.pagesFailed++;
      const loadTimeMs = Date.now() - startTime;

      const failedPage: PageData = {
        id: Math.random().toString(36).substring(2, 9),
        url: item.url,
        title: 'Error: ' + errorMessage,
        statusCode: 0,
        statusText: 'Failed',
        depth: item.depth,
        parentUrl: item.parentUrl,
        metaDescription: '',
        favicon: '',
        canonicalUrl: '',
        openGraph: {},
        headings: [],
        contentPreview: '',
        internalLinksCount: 0,
        externalLinksCount: 0,
        links: [],
        images: [],
        loadTimeMs,
        timestamp: Date.now(),
        errorMessage,
      };

      this.pages.set(item.url, failedPage);
      this.stats.pagesCrawled = this.pages.size;

      const node: GraphNode = {
        id: item.url,
        url: item.url,
        title: 'Failed',
        statusCode: 500,
        depth: item.depth,
        linksCount: 0,
      };
      this.graphNodes.set(item.url, node);

      this.addLog('error', `Failed to crawl ${item.url}: ${errorMessage}`, item.url);
      this.emit('page', failedPage);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          // ignore
        }
      }
    }
  }
}
