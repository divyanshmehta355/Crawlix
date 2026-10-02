import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { EventEmitter } from 'node:events';
import { detectBravePath } from './crawler.js';
import type { LearnedAction, TeachingSessionState } from './types.js';

export class TeachingStudio extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: TeachingSessionState = {
    isActive: false,
    sessionUrl: '',
    recordedActions: [],
  };

  public getState(): TeachingSessionState {
    return {
      isActive: this.state.isActive,
      sessionUrl: this.state.sessionUrl,
      recordedActions: [...this.state.recordedActions],
    };
  }

  public async startSession(startUrl: string, customBravePath?: string): Promise<void> {
    if (this.state.isActive) {
      await this.stopSession();
    }

    const bravePath = customBravePath || detectBravePath();
    this.state = {
      isActive: true,
      sessionUrl: startUrl,
      recordedActions: [],
    };

    // Initial navigation action
    const initAction: LearnedAction = {
      id: `act-${Date.now()}-nav`,
      type: 'navigate',
      value: startUrl,
      description: `Navigate to ${startUrl}`,
      timestamp: Date.now(),
    };
    this.state.recordedActions.push(initAction);
    this.emit('action', initAction);

    if (process.platform === 'linux' && !process.env.DISPLAY) {
      throw new Error(
        'Interactive Teaching Studio requires a desktop screen to display the visible browser. On cloud servers, please use the Autonomous Crawler or Movie Loop Automator.'
      );
    }

    // Launch visible Brave window for interactive teaching
    this.browser = await chromium.launch({
      executablePath: bravePath || undefined,
      headless: false, // Visible so the user can show it what to do!
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,850',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1240, height: 760 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Brave/128.0',
    });

    // Expose Node recording hook to the browser window
    await this.context.exposeFunction('__crawlix_record_action', (rawAction: any) => {
      const action: LearnedAction = {
        id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: rawAction.type,
        selector: rawAction.selector,
        value: rawAction.value,
        fieldName: rawAction.fieldName,
        extractType: rawAction.extractType || 'text',
        description: rawAction.description || `${rawAction.type.toUpperCase()} on ${rawAction.selector || rawAction.value}`,
        timestamp: Date.now(),
      };

      this.state.recordedActions.push(action);
      this.emit('action', action);
    });

    // Injected recording and floating toolbar script
    await this.context.addInitScript(() => {
      // Avoid duplicate injection
      if ((window as any).__crawlix_injected) return;
      (window as any).__crawlix_injected = true;

      let isExtractMode = false;
      let isPaginationMode = false;

      // Smart CSS selector generator
      function getCssSelector(el: HTMLElement): string {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
        if (el.id) return `#${el.id}`;
        
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-qa');
        if (testId) return `[data-testid="${testId}"]`;

        if (el.tagName.toLowerCase() === 'input' && el.getAttribute('name')) {
          return `input[name="${el.getAttribute('name')}"]`;
        }

        const className = typeof el.className === 'string' ? el.className.trim() : '';
        if (className) {
          const firstClass = className.split(/\s+/)[0];
          if (firstClass && !firstClass.includes(':') && document.querySelectorAll(`.${firstClass}`).length === 1) {
            return `.${firstClass}`;
          }
        }

        // Tag + text or structural fallback
        let path = el.tagName.toLowerCase();
        let parent = el.parentElement;
        if (parent && parent.tagName.toLowerCase() !== 'body') {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            path = `${path}:nth-of-type(${index})`;
          }
          return `${getCssSelector(parent)} > ${path}`;
        }
        return path;
      }

      // Floating In-Page Studio Toolbar
      function createOverlayToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = '__crawlix_toolbar';
        toolbar.style.cssText = `
          position: fixed;
          top: 12px;
          right: 16px;
          z-index: 2147483647;
          background: rgba(15, 19, 29, 0.95);
          backdrop-filter: blur(12px);
          border: 2px solid #ff5500;
          border-radius: 12px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.8);
          font-family: system-ui, -apple-system, sans-serif;
          color: #ffffff;
          font-size: 12px;
          user-select: none;
        `;

        const badge = document.createElement('div');
        badge.innerHTML = `<span style="font-size:14px; margin-right:4px;">🦁</span><b style="color:#ff8400;">Crawlix Learning</b>`;

        // Extract Mode Button
        const extractBtn = document.createElement('button');
        extractBtn.innerText = '🎯 Pick Field to Extract';
        extractBtn.style.cssText = `
          background: #1e2538;
          border: 1px solid #334155;
          color: #f8fafc;
          padding: 5px 9px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 11px;
        `;
        extractBtn.onclick = (e) => {
          e.stopPropagation();
          isExtractMode = !isExtractMode;
          isPaginationMode = false;
          extractBtn.style.background = isExtractMode ? '#10b981' : '#1e2538';
          extractBtn.innerText = isExtractMode ? '🟢 Click Element on Page' : '🎯 Pick Field to Extract';
        };

        // Pagination Mode Button
        const pageBtn = document.createElement('button');
        pageBtn.innerText = '⏭️ Next Page Button';
        pageBtn.style.cssText = `
          background: #1e2538;
          border: 1px solid #334155;
          color: #f8fafc;
          padding: 5px 9px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 11px;
        `;
        pageBtn.onclick = (e) => {
          e.stopPropagation();
          isPaginationMode = !isPaginationMode;
          isExtractMode = false;
          pageBtn.style.background = isPaginationMode ? '#00f0ff' : '#1e2538';
          pageBtn.innerText = isPaginationMode ? '🔵 Click Next Page Button' : '⏭️ Next Page Button';
        };

        toolbar.appendChild(badge);
        toolbar.appendChild(extractBtn);
        toolbar.appendChild(pageBtn);

        document.documentElement.appendChild(toolbar);
      }

      // Highlight Box on hover
      let hoverBox = document.createElement('div');
      hoverBox.id = '__crawlix_hover_box';
      hoverBox.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 2px dashed #00f0ff;
        background: rgba(0, 240, 255, 0.12);
        z-index: 2147483646;
        display: none;
        transition: all 0.05s ease;
      `;
      document.documentElement.appendChild(hoverBox);

      document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (!target || target.closest('#__crawlix_toolbar')) return;
        const rect = target.getBoundingClientRect();
        hoverBox.style.display = 'block';
        hoverBox.style.top = `${rect.top + window.scrollY}px`;
        hoverBox.style.left = `${rect.left + window.scrollX}px`;
        hoverBox.style.width = `${rect.width}px`;
        hoverBox.style.height = `${rect.height}px`;
        hoverBox.style.borderColor = isExtractMode ? '#10b981' : isPaginationMode ? '#00f0ff' : '#ff5500';
      });

      document.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('#__crawlix_toolbar')) return;
        hoverBox.style.display = 'none';
      });

      // Capture Click
      document.addEventListener(
        'click',
        (e) => {
          const target = e.target as HTMLElement;
          if (!target || target.closest('#__crawlix_toolbar')) return;

          const selector = getCssSelector(target);

          // If in Extract Mode: prompt for field name and record extraction
          if (isExtractMode) {
            e.preventDefault();
            e.stopPropagation();
            const fieldName = prompt(
              `Enter field name for extracted data (e.g., title, price, author):`,
              'field_' + Math.floor(Math.random() * 100)
            );
            if (fieldName) {
              (window as any).__crawlix_record_action({
                type: 'extract',
                selector,
                fieldName: fieldName.trim(),
                extractType: 'text',
                description: `Extract "${fieldName.trim()}" from ${selector}`,
              });
            }
            isExtractMode = false;
            const btn = document.querySelector('#__crawlix_toolbar button') as HTMLButtonElement;
            if (btn) {
              btn.style.background = '#1e2538';
              btn.innerText = '🎯 Pick Field to Extract';
            }
            return;
          }

          // If in Pagination Mode: mark as next page button
          if (isPaginationMode) {
            e.preventDefault();
            e.stopPropagation();
            (window as any).__crawlix_record_action({
              type: 'pagination',
              selector,
              description: `Pagination / Next Page via ${selector}`,
            });
            isPaginationMode = false;
            return;
          }

          // Standard Action: Record Click
          const textPreview = (target.textContent || '').trim().slice(0, 30);
          (window as any).__crawlix_record_action({
            type: 'click',
            selector,
            description: `Click "${textPreview || selector}"`,
          });
        },
        true
      );

      // Capture Input Typing
      document.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (!target || target.closest('#__crawlix_toolbar')) return;
        if (['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())) {
          const selector = getCssSelector(target);
          (window as any).__crawlix_record_action({
            type: 'type',
            selector,
            value: target.value,
            description: `Type "${target.value}" into ${selector}`,
          });
        }
      });

      // Inject floating toolbar once DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createOverlayToolbar);
      } else {
        createOverlayToolbar();
      }
    });

    // Open first page
    this.page = await this.context.newPage();

    // Listen for navigation in this tab
    this.page.on('framenavigated', (frame) => {
      if (frame === this.page?.mainFrame()) {
        const newUrl = frame.url();
        if (newUrl && newUrl !== 'about:blank' && newUrl !== startUrl) {
          const navAction: LearnedAction = {
            id: `act-${Date.now()}-nav`,
            type: 'navigate',
            value: newUrl,
            description: `Navigate to ${newUrl}`,
            timestamp: Date.now(),
          };
          this.state.recordedActions.push(navAction);
          this.emit('action', navAction);
        }
      }
    });

    // Close handler if user closes Brave window manually
    this.page.on('close', () => {
      this.state.isActive = false;
      this.emit('ended', this.state.recordedActions);
    });

    await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  public addManualAction(action: Omit<LearnedAction, 'id' | 'timestamp'>): LearnedAction {
    const fullAction: LearnedAction = {
      ...action,
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };
    this.state.recordedActions.push(fullAction);
    this.emit('action', fullAction);
    return fullAction;
  }

  public async stopSession(): Promise<LearnedAction[]> {
    this.state.isActive = false;
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

    const recorded = [...this.state.recordedActions];
    this.emit('ended', recorded);
    return recorded;
  }
}
