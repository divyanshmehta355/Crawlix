import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { EventEmitter } from 'node:events';
import { detectBravePath } from './crawler.js';
import type { CrawlLog, LearnedAction, LearnedRecipe, RecipeExecutionResult } from './types.js';

export class RecipeExecutor extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isRunning: boolean = false;

  private addLog(
    logs: CrawlLog[],
    level: CrawlLog['level'],
    message: string,
    url?: string
  ): CrawlLog {
    const log: CrawlLog = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      level,
      message,
      url,
    };
    logs.push(log);
    this.emit('log', log);
    return log;
  }

  public async execute(
    recipe: LearnedRecipe,
    options: { headless?: boolean; maxPages?: number } = {}
  ): Promise<RecipeExecutionResult> {
    if (this.isRunning) {
      throw new Error('Another recipe or crawler task is currently running.');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const logs: CrawlLog[] = [];
    const extractedRecords: Record<string, any>[] = [];
    const bravePath = detectBravePath();
    const isHeadlessEnv = process.platform === 'linux' && !process.env.DISPLAY;
    const headless = isHeadlessEnv ? true : options.headless !== false;
    const maxPages = options.maxPages || 3;

    this.addLog(logs, 'info', `Executing learned recipe: "${recipe.name}" (${recipe.actions.length} steps)`);
    this.addLog(logs, 'info', `Target: ${recipe.targetUrl} | Headless: ${headless}`);

    try {
      this.browser = await chromium.launch({
        executablePath: bravePath || undefined,
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Brave/128.0',
      });

      const page = await this.context.newPage();
      let stepsCompleted = 0;
      let currentPageNum = 1;

      // Check if recipe has pagination
      const paginationAction = recipe.actions.find((a) => a.type === 'pagination');
      const hasPagination = Boolean(paginationAction && paginationAction.selector);

      // Main loop (handles pagination if specified)
      while (currentPageNum <= (hasPagination ? maxPages : 1)) {
        if (currentPageNum > 1) {
          this.addLog(logs, 'info', `Navigating to page ${currentPageNum} via pagination...`);
          if (paginationAction?.selector) {
            await page.click(paginationAction.selector, { timeout: 10000 });
            await page.waitForTimeout(1000);
          }
        }

        // Current page extraction bucket
        const currentRecord: Record<string, any> = {
          _page: currentPageNum,
          _url: page.url(),
          _timestamp: new Date().toLocaleTimeString(),
        };

        for (let i = 0; i < recipe.actions.length; i++) {
          const action = recipe.actions[i];
          if (action.type === 'pagination') continue; // handled in outer loop

          this.addLog(logs, 'info', `[Step ${i + 1}/${recipe.actions.length}] ${action.description || action.type}`);

          try {
            switch (action.type) {
              case 'navigate': {
                const target = action.value || recipe.targetUrl;
                await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(600);
                break;
              }

              case 'click': {
                if (action.selector) {
                  await page.waitForSelector(action.selector, { timeout: 8000 });
                  await page.click(action.selector);
                  await page.waitForTimeout(500);
                }
                break;
              }

              case 'type': {
                if (action.selector && action.value !== undefined) {
                  await page.waitForSelector(action.selector, { timeout: 8000 });
                  await page.fill(action.selector, action.value);
                  await page.waitForTimeout(300);
                }
                break;
              }

              case 'scroll': {
                await page.evaluate(() => {
                  window.scrollBy({ top: 600, behavior: 'smooth' });
                });
                await page.waitForTimeout(600);
                break;
              }

              case 'wait': {
                if (action.selector) {
                  await page.waitForSelector(action.selector, { timeout: 10000 });
                } else if (action.value) {
                  const ms = parseInt(action.value, 10) || 1000;
                  await page.waitForTimeout(ms);
                }
                break;
              }

              case 'extract': {
                if (action.selector && action.fieldName) {
                  const fieldName = action.fieldName;
                  const extractType = action.extractType || 'text';

                  const extracted = await page.evaluate(
                    ({ sel, type, attr }) => {
                      if (type === 'list') {
                        const elements = document.querySelectorAll(sel);
                        return Array.from(elements).map((el) => {
                          if (attr) return el.getAttribute(attr) || '';
                          return (el.textContent || '').trim();
                        });
                      } else {
                        const el = document.querySelector(sel);
                        if (!el) return null;
                        if (attr) return el.getAttribute(attr) || '';
                        return (el.textContent || '').trim();
                      }
                    },
                    { sel: action.selector, type: extractType, attr: action.attrName }
                  );

                  currentRecord[fieldName] = extracted;
                  this.addLog(
                    logs,
                    'success',
                    `Extracted "${fieldName}": ${Array.isArray(extracted) ? `${extracted.length} items` : `"${extracted}"`}`
                  );
                }
                break;
              }
            }

            stepsCompleted++;
          } catch (stepErr: any) {
            this.addLog(logs, 'warn', `Step warning [${action.type}]: ${stepErr.message}`);
          }
        }

        // If list extraction was performed, normalize records into individual rows
        const listKeys = Object.keys(currentRecord).filter(
          (k) => !k.startsWith('_') && Array.isArray(currentRecord[k])
        );

        if (listKeys.length > 0) {
          const maxListLen = Math.max(...listKeys.map((k) => currentRecord[k].length));
          for (let r = 0; r < maxListLen; r++) {
            const row: Record<string, any> = {
              _page: currentPageNum,
              _index: r + 1,
            };
            for (const key of Object.keys(currentRecord)) {
              if (Array.isArray(currentRecord[key])) {
                row[key] = currentRecord[key][r] || '';
              } else {
                row[key] = currentRecord[key];
              }
            }
            extractedRecords.push(row);
          }
        } else {
          extractedRecords.push(currentRecord);
        }

        currentPageNum++;
      }

      this.addLog(logs, 'success', `Recipe completed! Extracted ${extractedRecords.length} records.`);

      const result: RecipeExecutionResult = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        status: 'completed',
        extractedRecords,
        stepsCompleted,
        totalSteps: recipe.actions.length,
        durationMs: Date.now() - startTime,
        logs,
      };

      this.emit('complete', result);
      return result;
    } catch (err: any) {
      this.addLog(logs, 'error', `Recipe execution failed: ${err.message}`);
      return {
        recipeId: recipe.id,
        recipeName: recipe.name,
        status: 'failed',
        extractedRecords,
        stepsCompleted: 0,
        totalSteps: recipe.actions.length,
        error: err.message,
        durationMs: Date.now() - startTime,
        logs,
      };
    } finally {
      this.isRunning = false;
      try {
        if (this.context) await this.context.close();
        if (this.browser) await this.browser.close();
      } catch {}
    }
  }
}
