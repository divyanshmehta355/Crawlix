import React, { useState } from 'react';
import { Play, Pause, Square, Globe, Settings2, Sparkles, RefreshCw, Eye, EyeOff } from 'lucide-react';
import type { CrawlConfig, CrawlStats } from '../types';

interface LaunchpadProps {
  stats: CrawlStats;
  onStart: (config: CrawlConfig) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: () => Promise<void>;
  onClear: () => void;
}

const PRESETS = [
  { label: 'Example Domain', url: 'https://example.com' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'Playwright', url: 'https://playwright.dev' },
  { label: 'Books Scrape Demo', url: 'http://books.toscrape.com' },
];

export const Launchpad: React.FC<LaunchpadProps> = ({
  stats,
  onStart,
  onPause,
  onResume,
  onStop,
  onClear,
}) => {
  const [url, setUrl] = useState('https://example.com');
  const [maxPages, setMaxPages] = useState(15);
  const [maxDepth, setMaxDepth] = useState(2);
  const [concurrency, setConcurrency] = useState(2);
  const [delayMs, setDelayMs] = useState(300);
  const [headless, setHeadless] = useState(true);
  const [sameDomainOnly, setSameDomainOnly] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  const isRunning = stats.status === 'running';
  const isPaused = stats.status === 'paused';

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    try {
      await onStart({
        startUrl: url.trim(),
        maxPages,
        maxDepth,
        concurrency,
        delayMs,
        headless,
        sameDomainOnly,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel launchpad-card" id="crawl-launchpad">
      <div className="launchpad-header">
        <div className="launchpad-title-group">
          <h2>
            <Sparkles size={20} color="var(--brave-orange)" />
            Crawl Launchpad
          </h2>
          <p>Target any web application or site with dynamic Brave browser automation</p>
        </div>

        <button
          type="button"
          className="btn-secondary"
          id="btn-toggle-settings"
          onClick={() => setShowSettings(!showSettings)}
          style={{ height: '38px', fontSize: '0.8rem' }}
        >
          <Settings2 size={16} />
          <span>{showSettings ? 'Hide Options' : 'Crawl Options'}</span>
        </button>
      </div>

      <form onSubmit={handleLaunch}>
        <div className="url-input-container">
          <div className="url-input-wrapper">
            <Globe className="input-icon" size={20} />
            <input
              id="crawl-url-input"
              type="url"
              className="url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com or any web app..."
              disabled={isRunning || isPaused}
              required
            />
          </div>

          <div className="action-buttons-group">
            {!isRunning && !isPaused ? (
              <button
                type="submit"
                id="btn-start-crawl"
                className="btn-primary"
                disabled={loading || !url}
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <Play size={18} />}
                <span>Start Crawl</span>
              </button>
            ) : (
              <>
                {isPaused ? (
                  <button
                    type="button"
                    id="btn-resume-crawl"
                    className="btn-secondary"
                    onClick={onResume}
                  >
                    <Play size={18} color="var(--emerald-accent)" />
                    <span>Resume</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-pause-crawl"
                    className="btn-secondary"
                    onClick={onPause}
                  >
                    <Pause size={18} color="var(--amber-accent)" />
                    <span>Pause</span>
                  </button>
                )}

                <button
                  type="button"
                  id="btn-stop-crawl"
                  className="btn-secondary btn-danger"
                  onClick={onStop}
                >
                  <Square size={16} />
                  <span>Abort</span>
                </button>
              </>
            )}

            {!isRunning && !isPaused && stats.pagesCrawled > 0 && (
              <button
                type="button"
                id="btn-clear-results"
                className="btn-secondary"
                onClick={onClear}
                title="Clear current crawl session"
              >
                <RefreshCw size={16} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Preset chips */}
        <div className="preset-chips">
          <span className="preset-label">Quick Presets:</span>
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className="preset-chip"
              disabled={isRunning || isPaused}
              onClick={() => setUrl(preset.url)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Collapsible settings */}
        {showSettings && (
          <div className="settings-grid" id="crawl-settings-drawer">
            <div className="setting-item">
              <label htmlFor="setting-max-pages">
                <span>Max Pages</span>
                <span className="val">{maxPages}</span>
              </label>
              <input
                id="setting-max-pages"
                type="range"
                min="5"
                max="100"
                step="5"
                value={maxPages}
                disabled={isRunning}
                onChange={(e) => setMaxPages(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="setting-item">
              <label htmlFor="setting-max-depth">
                <span>Max Depth</span>
                <span className="val">{maxDepth}</span>
              </label>
              <input
                id="setting-max-depth"
                type="range"
                min="1"
                max="5"
                step="1"
                value={maxDepth}
                disabled={isRunning}
                onChange={(e) => setMaxDepth(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="setting-item">
              <label htmlFor="setting-concurrency">
                <span>Parallel Tabs</span>
                <span className="val">{concurrency}</span>
              </label>
              <input
                id="setting-concurrency"
                type="range"
                min="1"
                max="4"
                step="1"
                value={concurrency}
                disabled={isRunning}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="setting-item">
              <label htmlFor="setting-delay">
                <span>Crawl Delay</span>
                <span className="val">{delayMs}ms</span>
              </label>
              <input
                id="setting-delay"
                type="range"
                min="0"
                max="2000"
                step="100"
                value={delayMs}
                disabled={isRunning}
                onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
              />
            </div>

            <div className="setting-item">
              <label>Headless Mode</label>
              <div className="toggle-wrapper" onClick={() => !isRunning && setHeadless(!headless)}>
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={headless}
                  disabled={isRunning}
                  onChange={(e) => setHeadless(e.target.checked)}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {headless ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <EyeOff size={14} /> Background Headless
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--brave-orange)' }}>
                      <Eye size={14} /> Visible Brave Window
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="setting-item">
              <label>Domain Boundary</label>
              <div className="toggle-wrapper" onClick={() => !isRunning && setSameDomainOnly(!sameDomainOnly)}>
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={sameDomainOnly}
                  disabled={isRunning}
                  onChange={(e) => setSameDomainOnly(e.target.checked)}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {sameDomainOnly ? 'Same Host Only' : 'Follow All Domains'}
                </span>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
