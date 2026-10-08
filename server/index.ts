import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { CrawlerEngine, detectBravePath } from './crawler.js';
import { TeachingStudio } from './recorder.js';
import { RecipeExecutor } from './recipe-executor.js';
import { BatchLoopCrawler } from './batch-loop-crawler.js';
import { getRecipes, saveRecipe, deleteRecipe, incrementRunCount } from './recipes.js';
import type { CrawlConfig, LearnedRecipe, LoopCrawlConfig } from './types.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors());
app.use(express.json());

const crawler = new CrawlerEngine();
const teachingStudio = new TeachingStudio();
const recipeExecutor = new RecipeExecutor();
const loopCrawler = new BatchLoopCrawler();
const sseClients: Set<Response> = new Set();

function broadcastEvent(type: string, data: any) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Forward crawler events to SSE clients
crawler.on('page', (page) => broadcastEvent('page', page));
crawler.on('status', (stats) => broadcastEvent('status', stats));
crawler.on('stats:tick', (stats) => broadcastEvent('stats:tick', stats));
crawler.on('log', (log) => broadcastEvent('log', log));
crawler.on('graph', (graph) => broadcastEvent('graph', graph));
crawler.on('complete', (summary) => broadcastEvent('complete', summary));

// Forward teaching & recipe events to SSE clients
teachingStudio.on('action', (action) => broadcastEvent('teaching:action', action));
teachingStudio.on('ended', (actions) => broadcastEvent('teaching:ended', actions));
recipeExecutor.on('log', (log) => broadcastEvent('recipe:log', log));
recipeExecutor.on('complete', (res) => broadcastEvent('recipe:complete', res));

// Forward loop crawler events to SSE clients
loopCrawler.on('progress', (prog) => broadcastEvent('loop:progress', prog));
loopCrawler.on('progress:tick', (prog) => broadcastEvent('loop:progress:tick', prog));
loopCrawler.on('item_extracted', (link) => broadcastEvent('loop:item_extracted', link));
loopCrawler.on('complete', (res) => broadcastEvent('loop:complete', res));



// System Info
app.get('/api/system/browser', (_req: Request, res: Response) => {
  const bravePath = detectBravePath();
  res.json({
    browser: 'Brave Browser',
    executablePath: bravePath,
    supported: true,
  });
});

// SSE Endpoint
app.get('/api/crawl/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial payload
  res.write(`event: init\ndata: ${JSON.stringify({ stats: crawler.getStats() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Start Crawl
app.post('/api/crawl/start', async (req: Request, res: Response) => {
  try {
    const config: CrawlConfig = {
      startUrl: req.body.startUrl || 'https://example.com',
      maxPages: Number(req.body.maxPages) || 20,
      maxDepth: Number(req.body.maxDepth) || 3,
      concurrency: Number(req.body.concurrency) || 2,
      delayMs: Number(req.body.delayMs) ?? 300,
      headless: req.body.headless !== false,
      sameDomainOnly: req.body.sameDomainOnly !== false,
      customUserAgent: req.body.customUserAgent,
      viewportWidth: req.body.viewportWidth,
      viewportHeight: req.body.viewportHeight,
    };

    crawler.start(config).catch(() => {});
    res.json({ success: true, message: 'Crawl started', stats: crawler.getStats() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Pause Crawl
app.post('/api/crawl/pause', (_req: Request, res: Response) => {
  crawler.pause();
  res.json({ success: true, stats: crawler.getStats() });
});

// Resume Crawl
app.post('/api/crawl/resume', (_req: Request, res: Response) => {
  crawler.resume();
  res.json({ success: true, stats: crawler.getStats() });
});

// Stop Crawl
app.post('/api/crawl/stop', async (_req: Request, res: Response) => {
  await crawler.stop();
  res.json({ success: true, stats: crawler.getStats() });
});

// Get Stats
app.get('/api/crawl/status', (_req: Request, res: Response) => {
  res.json({
    stats: crawler.getStats(),
    config: crawler.getConfig(),
  });
});

// Get Pages
app.get('/api/crawl/pages', (req: Request, res: Response) => {
  let pages = crawler.getPages();
  const q = (req.query.q as string)?.toLowerCase();
  const statusFilter = req.query.status as string;

  if (q) {
    pages = pages.filter(
      (p) =>
        p.url.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.metaDescription.toLowerCase().includes(q)
    );
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === '2xx') pages = pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
    else if (statusFilter === '3xx') pages = pages.filter((p) => p.statusCode >= 300 && p.statusCode < 400);
    else if (statusFilter === '4xx') pages = pages.filter((p) => p.statusCode >= 400 && p.statusCode < 500);
    else if (statusFilter === '5xx') pages = pages.filter((p) => p.statusCode >= 500 || p.statusCode === 0);
  }

  res.json({ pages });
});

// Get Page by ID or URL
app.get('/api/crawl/pages/:id', (req: Request, res: Response) => {
  const pages = crawler.getPages();
  const found = pages.find((p) => p.id === req.params.id || p.url === req.params.id);
  if (!found) {
    return res.status(404).json({ error: 'Page not found' });
  }
  res.json({ page: found });
});

// Get Graph Data
app.get('/api/crawl/graph', (_req: Request, res: Response) => {
  res.json(crawler.getGraphData());
});

// Get Logs
app.get('/api/crawl/logs', (_req: Request, res: Response) => {
  res.json({ logs: crawler.getLogs() });
});

// Export Data
app.get('/api/crawl/export/:format', (req: Request, res: Response) => {
  const { format } = req.params;
  const pages = crawler.getPages();
  const stats = crawler.getStats();
  const graph = crawler.getGraphData();

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-data.json"');
    return res.send(
      JSON.stringify(
        {
          meta: { crawler: 'Crawlix', browser: 'Brave', exportedAt: new Date().toISOString(), stats },
          pages,
          graph,
        },
        null,
        2
      )
    );
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-pages.csv"');
    const headers = [
      'URL',
      'Title',
      'Status Code',
      'Depth',
      'Load Time (ms)',
      'Internal Links',
      'External Links',
      'Images Count',
      'Meta Description',
    ];
    const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
    const rows = pages.map((p) =>
      [
        escapeCsv(p.url),
        escapeCsv(p.title),
        p.statusCode,
        p.depth,
        p.loadTimeMs,
        p.internalLinksCount,
        p.externalLinksCount,
        p.images.length,
        escapeCsv(p.metaDescription),
      ].join(',')
    );
    return res.send([headers.join(','), ...rows].join('\n'));
  }

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-archive.md"');
    const mdHeader = `# Crawlix Site Crawl Archive\n\n- **Target**: ${crawler.getConfig()?.startUrl || 'N/A'}\n- **Pages Crawled**: ${pages.length}\n- **Browser**: Brave Browser\n- **Exported**: ${new Date().toLocaleString()}\n\n---\n\n`;
    const mdPages = pages
      .map(
        (p) =>
          `## [${p.title || 'Untitled'}](${p.url})\n\n- **Status**: ${p.statusCode} (${p.statusText})\n- **Depth**: ${p.depth}\n- **Load Time**: ${p.loadTimeMs}ms\n- **Meta Description**: ${p.metaDescription || 'None'}\n\n### Extracted Headings\n${p.headings.map((h) => `${'  '.repeat(h.level - 1)}- ${h.text}`).join('\n') || 'No headings'}\n\n### Content Preview\n${p.contentPreview || 'No preview available'}\n\n---\n`
      )
      .join('\n');
    return res.send(mdHeader + mdPages);
  }

  res.status(400).json({ error: 'Unsupported format. Use json, csv, or markdown' });
});

// --- TEACHING STUDIO ENDPOINTS ---

// Start Interactive Teaching Session (Opens Visible Brave)
app.post('/api/teaching/start', async (req: Request, res: Response) => {
  try {
    const { startUrl, bravePath } = req.body;
    if (!startUrl) {
      return res.status(400).json({ error: 'startUrl is required' });
    }
    await teachingStudio.startSession(startUrl, bravePath);
    res.json({ success: true, message: 'Teaching session launched in Brave', state: teachingStudio.getState() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop Interactive Teaching Session
app.post('/api/teaching/stop', async (_req: Request, res: Response) => {
  try {
    const recordedActions = await teachingStudio.stopSession();
    res.json({ success: true, recordedActions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Teaching Session State
app.get('/api/teaching/state', (_req: Request, res: Response) => {
  res.json(teachingStudio.getState());
});

// Add Manual Action to Current Session
app.post('/api/teaching/action', (req: Request, res: Response) => {
  try {
    const action = teachingStudio.addManualAction(req.body);
    res.json({ success: true, action });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- RECIPES STORE & EXECUTOR ENDPOINTS ---

// Get All Saved Recipes
app.get('/api/recipes', (_req: Request, res: Response) => {
  res.json({ recipes: getRecipes() });
});

// Save or Update Recipe
app.post('/api/recipes', (req: Request, res: Response) => {
  try {
    const recipe: LearnedRecipe = req.body;
    if (!recipe.name || !recipe.actions || !Array.isArray(recipe.actions)) {
      return res.status(400).json({ error: 'Recipe requires a name and an actions array.' });
    }
    if (!recipe.id) {
      recipe.id = `recipe-${Date.now()}`;
    }
    const saved = saveRecipe(recipe);
    res.json({ success: true, recipe: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Recipe
app.delete('/api/recipes/:id', (req: Request, res: Response) => {
  const deleted = deleteRecipe(req.params.id);
  res.json({ success: deleted });
});

// Execute Recipe with Brave
app.post('/api/recipes/execute', async (req: Request, res: Response) => {
  try {
    const { recipeId, customRecipe, headless, maxPages } = req.body;
    let targetRecipe: LearnedRecipe | undefined;

    if (customRecipe) {
      targetRecipe = customRecipe;
    } else if (recipeId) {
      targetRecipe = getRecipes().find((r) => r.id === recipeId);
    }

    if (!targetRecipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    if (targetRecipe.id) {
      incrementRunCount(targetRecipe.id);
    }

    // Run recipe execution
    recipeExecutor
      .execute(targetRecipe, { headless: headless !== false, maxPages: Number(maxPages) || 3 })
      .catch(() => {});

    res.json({ success: true, message: 'Recipe execution started in Brave' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- BATCH LOOP AUTOMATION ENDPOINTS ---

// Start Loop Crawl
app.post('/api/loop/start', async (req: Request, res: Response) => {
  try {
    const config: LoopCrawlConfig = {
      catalogUrl: req.body.catalogUrl,
      cardSelector: req.body.cardSelector || 'a.movie-card, .film-item a, .card a, a[href*="/movie/"]',
      titleSelector: req.body.titleSelector,
      qualityPriority: req.body.qualityPriority || ['1080p', '720p', '480p'],
      generateButtonSelector: req.body.generateButtonSelector,
      serverPriority: req.body.serverPriority || ['FSLv2', 'FastServer', 'Server 1'],
      maxItems: Number(req.body.maxItems) || 0,
      delayMs: Number(req.body.delayMs) ?? 800,
      headless: req.body.headless !== false,
      enablePagination: Boolean(req.body.enablePagination),
      startPage: req.body.startPage ? Number(req.body.startPage) : undefined,
      endPage: req.body.endPage ? Number(req.body.endPage) : undefined,
    };

    if (!config.catalogUrl) {
      return res.status(400).json({ error: 'catalogUrl is required' });
    }

    loopCrawler.startLoop(config).catch(() => {});
    res.json({ success: true, message: 'Loop crawl started in Brave', progress: loopCrawler.getProgress() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pause Loop Crawl
app.post('/api/loop/pause', (_req: Request, res: Response) => {
  loopCrawler.pause();
  res.json({ success: true, progress: loopCrawler.getProgress() });
});

// Resume Loop Crawl
app.post('/api/loop/resume', (_req: Request, res: Response) => {
  loopCrawler.resume();
  res.json({ success: true, progress: loopCrawler.getProgress() });
});

// Stop Loop Crawl
app.post('/api/loop/stop', async (_req: Request, res: Response) => {
  await loopCrawler.stop();
  res.json({ success: true, progress: loopCrawler.getProgress() });
});

// Get Loop Progress & Links
app.get('/api/loop/progress', (_req: Request, res: Response) => {
  res.json({
    progress: loopCrawler.getProgress(),
    links: loopCrawler.getExtractedLinks(),
  });
});

// Export Loop Links (TXT, CSV, JSON)
app.get('/api/loop/export/:format', (req: Request, res: Response) => {
  const { format } = req.params;
  const links = loopCrawler.getExtractedLinks();

  if (format === 'txt') {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-download-links.txt"');
    const textOutput = links
      .filter((l) => Boolean(l.downloadLink) && l.status === 'success' && !l.downloadLink.includes('#') && !l.downloadLink.includes('nexdrive.fit'))
      .map((l) => l.downloadLink)
      .join('\n');
    return res.send(textOutput);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-download-links.csv"');
    const headers = ['#', 'Movie / Show Title', 'Quality Selected', 'Server', 'Download Link', 'Source Card URL', 'Status'];
    const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
    const rows = links.map((l) =>
      [
        l.index,
        escapeCsv(l.movieTitle),
        escapeCsv(l.qualitySelected),
        escapeCsv(l.serverName),
        escapeCsv(l.downloadLink),
        escapeCsv(l.cardUrl),
        l.status,
      ].join(',')
    );
    return res.send([headers.join(','), ...rows].join('\n'));
  }

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="crawlix-download-links.json"');
    return res.send(JSON.stringify(links, null, 2));
  }

  res.status(400).json({ error: 'Unsupported format. Use txt, csv, or json' });
});

// Production Static Serving (Single-Port Deployment)
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req: Request, res: Response, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`🕷️ Crawlix API server listening on http://localhost:${PORT}`);
  console.log(`🦁 Brave automation ready!`);
});


