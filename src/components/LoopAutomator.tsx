import React, { useState } from 'react';
import {
  Film,
  Play,
  Pause,
  Square,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  ExternalLink,
  Flame,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  Search,
} from 'lucide-react';
import type { ExtractedDownloadLink, LoopCrawlConfig, LoopCrawlProgress } from '../types';

interface LoopAutomatorProps {
  progress: LoopCrawlProgress;
  extractedLinks: ExtractedDownloadLink[];
  onStartLoop: (config: LoopCrawlConfig) => Promise<void>;
  onPauseLoop: () => Promise<void>;
  onResumeLoop: () => Promise<void>;
  onStopLoop: () => Promise<void>;
  onClearLinks: () => void;
}

export const LoopAutomator: React.FC<LoopAutomatorProps> = ({
  progress,
  extractedLinks,
  onStartLoop,
  onPauseLoop,
  onResumeLoop,
  onStopLoop,
  onClearLinks,
}) => {
  const [catalogUrl, setCatalogUrl] = useState('https://example.com/movies');
  const [cardSelector, setCardSelector] = useState('a.movie-card, .film-item a, .card a, a[href*="/movie/"]');
  const [titleSelector, setTitleSelector] = useState('h2, .title, img[alt]');
  const [qualityOrder, setQualityOrder] = useState('1080p, 720p, 480p');
  const [serverPriority, setServerPriority] = useState('FSLv2, FastServer, Mirror 1');
  const [maxItems, setMaxItems] = useState(0); // 0 = all
  const [headless, setHeadless] = useState(false); // Default to visible Brave so user sees it in action!
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isRunning = progress.status === 'running';
  const isPaused = progress.status === 'paused';

  const filteredLinks = extractedLinks.filter((item) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.movieTitle || '').toLowerCase().includes(q) ||
      (item.serverName || '').toLowerCase().includes(q) ||
      (item.qualitySelected || '').toLowerCase().includes(q) ||
      (item.downloadLink || '').toLowerCase().includes(q)
    );
  });

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalogUrl.trim() || !cardSelector.trim()) return;

    const qualities = qualityOrder.split(',').map((s) => s.trim()).filter(Boolean);
    const servers = serverPriority.split(',').map((s) => s.trim()).filter(Boolean);

    await onStartLoop({
      catalogUrl: catalogUrl.trim(),
      cardSelector: cardSelector.trim(),
      titleSelector: titleSelector.trim() || undefined,
      qualityPriority: qualities.length > 0 ? qualities : ['1080p', '720p', '480p'],
      serverPriority: servers.length > 0 ? servers : ['FSLv2', 'FastServer'],
      maxItems: Number(maxItems) || 0,
      headless,
    });
  };

  const handleCopySingle = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyAll = () => {
    const urls = extractedLinks.filter((l) => Boolean(l.downloadLink)).map((l) => l.downloadLink).join('\n');
    navigator.clipboard.writeText(urls);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExport = (format: 'txt' | 'csv' | 'json') => {
    window.open(`/api/loop/export/${format}`, '_blank');
  };

  const percentage = progress.totalItems > 0
    ? Math.round((progress.currentIndex / progress.totalItems) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} id="loop-automator-view">
      {/* Prominent Quick Access Banner when links exist */}
      {extractedLinks.length > 0 && (
        <div
          style={{
            padding: '1rem 1.4rem',
            background: 'linear-gradient(135deg, rgba(255, 85, 0, 0.16), rgba(0, 240, 255, 0.12))',
            border: '1px solid rgba(255, 85, 0, 0.45)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'var(--brave-orange)', padding: '0.45rem', borderRadius: '50%', color: '#fff', display: 'flex' }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#fff', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{extractedLinks.length} Download Links Captured in Vault</span>
                <span className="tab-badge" style={{ background: 'var(--emerald-accent)', color: '#000', fontWeight: 800 }}>
                  {extractedLinks.filter((l) => l.downloadLink && l.status !== 'failed').length} Ready
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                All links extracted from movie cards and mapped to prioritized servers.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                document.getElementById('extracted-vault')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{ height: '36px', padding: '0 1rem', fontSize: '0.82rem' }}
            >
              <ArrowDown size={15} />
              <span>Jump to Links Table</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleCopyAll}
              style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.82rem' }}
            >
              {copiedAll ? <Check size={15} /> : <Copy size={15} />}
              <span>{copiedAll ? 'Copied All!' : 'Copy All Links'}</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleExport('txt')}
              style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.82rem' }}
              title="Download IDM / JDownloader ready plain text list"
            >
              <FileText size={15} color="var(--cyan-accent)" />
              <span>Download .TXT</span>
            </button>
          </div>
        </div>
      )}

      {/* Launch & Config Card */}
      <div className="glass-panel launchpad-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isConfigCollapsed ? 0 : '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Film size={22} color="var(--brave-orange)" />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800 }}>
                Autonomous Card Loop & Download Link Extractor
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Iterates through all movie/show cards, picks best quality, generates download link, and prioritizes{' '}
              <b style={{ color: 'var(--brave-amber)' }}>FSLv2</b> server!
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsConfigCollapsed(!isConfigCollapsed)}
              style={{ height: '34px', padding: '0 0.75rem', fontSize: '0.78rem' }}
              title={isConfigCollapsed ? 'Expand Form' : 'Collapse Form'}
            >
              {isConfigCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              <span>{isConfigCollapsed ? 'Expand Settings' : 'Collapse Settings'}</span>
            </button>
            <div
              className="toggle-wrapper"
              onClick={() => !isRunning && setHeadless(!headless)}
              style={{
                background: 'var(--bg-surface-elevated)',
                padding: '0.4rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--bg-surface-border)',
              }}
            >
              <input
                type="checkbox"
                className="toggle-input"
                checked={headless}
                disabled={isRunning}
                onChange={(e) => setHeadless(e.target.checked)}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {headless ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <EyeOff size={14} /> Background Headless
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--brave-orange)', fontWeight: 600 }}>
                    <Eye size={14} /> Visible Brave Window
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
            QUICK PRESETS:
          </span>
          <button
            type="button"
            id="preset-vegamovies"
            onClick={() => {
              setCatalogUrl('https://vegamovies.gallery/');
              setCardSelector('a[href*="/download-"]');
              setQualityOrder('1080p, 720p, 480p');
              setServerPriority('FSLv2, FastServer, PixelServer');
              setMaxItems(5);
            }}
            style={{
              background: 'rgba(255, 69, 0, 0.12)',
              border: '1px solid rgba(255, 69, 0, 0.4)',
              color: 'var(--brave-orange)',
              borderRadius: '20px',
              padding: '0.3rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Film size={13} />
            Vegamovies.gallery Catalog (1080p ➔ FSLv2 Server)
          </button>
        </div>

        <form onSubmit={handleLaunch}>
          {/* Main URL Bar */}
          <div className="url-input-container">
            <div className="url-input-wrapper">
              <Film className="input-icon" size={20} />
              <input
                type="url"
                className="url-input"
                id="input-loop-catalog-url"
                value={catalogUrl}
                disabled={isRunning || isPaused}
                onChange={(e) => setCatalogUrl(e.target.value)}
                placeholder="Enter catalog URL (e.g. https://moviesite.example/movies)..."
                required
              />
            </div>

            <div className="action-buttons-group">
              {!isRunning && !isPaused ? (
                <button
                  type="submit"
                  className="btn-primary"
                  id="btn-start-loop"
                  disabled={!catalogUrl || !cardSelector}
                >
                  <Play size={18} />
                  <span>Start Movie Loop</span>
                </button>
              ) : (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      id="btn-resume-loop"
                      onClick={onResumeLoop}
                    >
                      <Play size={18} color="var(--emerald-accent)" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      id="btn-pause-loop"
                      onClick={onPauseLoop}
                    >
                      <Pause size={18} color="var(--amber-accent)" />
                      <span>Pause</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    id="btn-stop-loop"
                    onClick={onStopLoop}
                  >
                    <Square size={16} />
                    <span>Abort</span>
                  </button>
                </>
              )}

              {!isRunning && !isPaused && extractedLinks.length > 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClearLinks}
                  title="Clear extracted links"
                >
                  <RefreshCw size={15} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Configuration Grid */}
          <div className="settings-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="setting-item">
              <label>
                <span>Card Selector</span>
                <span className="val">CSS</span>
              </label>
              <input
                type="text"
                className="setting-input"
                id="input-card-selector"
                value={cardSelector}
                disabled={isRunning}
                onChange={(e) => setCardSelector(e.target.value)}
                placeholder="a.movie-card, .film-item"
                required
              />
            </div>

            <div className="setting-item">
              <label>
                <span>Quality Priority</span>
                <span className="val" style={{ color: 'var(--emerald-accent)' }}>Best First</span>
              </label>
              <input
                type="text"
                className="setting-input"
                id="input-quality-priority"
                value={qualityOrder}
                disabled={isRunning}
                onChange={(e) => setQualityOrder(e.target.value)}
                placeholder="1080p, 720p, 480p"
              />
            </div>

            <div className="setting-item">
              <label>
                <span>Server Priority</span>
                <span className="val" style={{ color: 'var(--brave-orange)' }}>FSLv2 Top</span>
              </label>
              <input
                type="text"
                className="setting-input"
                id="input-server-priority"
                value={serverPriority}
                disabled={isRunning}
                onChange={(e) => setServerPriority(e.target.value)}
                placeholder="FSLv2, FastServer, Server 1"
              />
            </div>

            <div className="setting-item">
              <label>
                <span>Max Cards to Crawl</span>
                <span className="val">{maxItems === 0 ? 'All Cards' : maxItems}</span>
              </label>
              <input
                type="number"
                min="0"
                max="500"
                className="setting-input"
                id="input-max-cards"
                value={maxItems}
                disabled={isRunning}
                onChange={(e) => setMaxItems(parseInt(e.target.value, 10) || 0)}
                placeholder="0 = All cards on page"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Real-time Progress Bar & Radar */}
      {(isRunning || isPaused || progress.status === 'completed') && (
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem 1.5rem',
            border: isRunning ? '1px solid var(--brave-orange)' : '1px solid var(--bg-surface-border)',
            background: isRunning ? 'rgba(255, 85, 0, 0.05)' : 'var(--bg-surface-glass)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {isRunning ? (
                <RefreshCw className="animate-spin" size={18} color="var(--brave-orange)" />
              ) : progress.status === 'completed' ? (
                <CheckCircle2 size={18} color="var(--emerald-accent)" />
              ) : (
                <Clock size={18} color="var(--amber-accent)" />
              )}
              <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fff' }}>
                {progress.currentMovieTitle || 'Processing Cards...'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                Item {progress.currentIndex} of {progress.totalItems} ({percentage}%)
              </span>
              <span style={{ color: 'var(--emerald-accent)', fontWeight: 700 }}>
                {progress.extractedCount} links extracted
              </span>
            </div>
          </div>

          {/* Progress Bar Track */}
          <div style={{ height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${percentage}%`,
                background: 'var(--brave-gradient)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--cyan-accent)', marginTop: '0.4rem', fontFamily: 'var(--font-mono)' }}>
            ⚡ {progress.currentStep}
          </div>
        </div>
      )}

      {/* Extracted Download Links Vault */}
      <div className="glass-panel" id="extracted-vault" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--bg-surface-border)', paddingBottom: '0.85rem' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} color="var(--brave-orange)" />
              <span>Extracted Download Links Vault</span>
              <span className="tab-badge">{extractedLinks.length}</span>
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              All download links resolved via automated quality selection and FSLv2 server routing
            </p>
          </div>

          {extractedLinks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                id="btn-copy-all-links"
                onClick={handleCopyAll}
                style={{ height: '36px', padding: '0 0.95rem', fontSize: '0.8rem' }}
              >
                {copiedAll ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedAll ? 'All Copied!' : 'Copy All Links'}</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                id="btn-export-txt"
                onClick={() => handleExport('txt')}
                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem' }}
                title="Download plain .TXT (JDownloader / IDM ready)"
              >
                <FileText size={15} color="var(--cyan-accent)" />
                <span>Download .TXT</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                id="btn-export-csv"
                onClick={() => handleExport('csv')}
                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem' }}
              >
                <FileSpreadsheet size={15} color="var(--emerald-accent)" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                id="btn-export-json"
                onClick={() => handleExport('json')}
                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem' }}
              >
                <FileJson size={15} color="var(--amber-accent)" />
                <span>JSON</span>
              </button>
            </div>
          )}
        </div>

        {/* Search Bar when links exist */}
        {extractedLinks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--bg-surface-elevated)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-surface-border)' }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search extracted titles, qualities, servers, or URLs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none',
                width: '100%',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Links Table */}
        {extractedLinks.length === 0 ? (
          <div className="empty-state" style={{ padding: '4rem 1rem' }}>
            <Film className="empty-state-icon" size={42} />
            <h3>No links extracted yet</h3>
            <p>
              Enter a catalog URL above and click <b>"Start Movie Loop"</b>. Crawlix will visit each card, pick 1080p, and capture the FSLv2 download links.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--bg-surface-border)' }}>
                  <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '45px' }}>#</th>
                  <th style={{ padding: '0.75rem', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Movie / Show Title</th>
                  <th style={{ padding: '0.75rem', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, width: '100px' }}>Quality</th>
                  <th style={{ padding: '0.75rem', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, width: '120px' }}>Server</th>
                  <th style={{ padding: '0.75rem', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Direct Download Link</th>
                  <th style={{ padding: '0.75rem', color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, width: '90px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLinks.map((item, idx) => (
                  <tr
                    key={item.id || idx}
                    style={{
                      borderBottom: '1px solid var(--bg-surface-border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}
                  >
                    <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.index}
                    </td>

                    <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#fff', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.movieTitle}>
                      {item.movieTitle}
                    </td>

                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          background: (item.qualitySelected || '').includes('1080')
                            ? 'rgba(16, 185, 129, 0.18)'
                            : 'rgba(0, 240, 255, 0.15)',
                          color: (item.qualitySelected || '').includes('1080')
                            ? '#34d399'
                            : '#38bdf8',
                        }}
                      >
                        {item.qualitySelected || 'Auto'}
                      </span>
                    </td>

                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: (item.serverName || '').toLowerCase().includes('fslv2')
                            ? 'rgba(255, 85, 0, 0.2)'
                            : 'rgba(255, 255, 255, 0.08)',
                          color: (item.serverName || '').toLowerCase().includes('fslv2')
                            ? 'var(--brave-amber)'
                            : 'var(--text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        {(item.serverName || '').toLowerCase().includes('fslv2') && <Flame size={12} />}
                        {item.serverName || 'Direct'}
                      </span>
                    </td>

                    <td style={{ padding: '0.65rem 0.75rem', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.downloadLink ? (
                        <a
                          href={item.downloadLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: 'var(--cyan-accent)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                          }}
                          title={item.downloadLink}
                        >
                          {item.downloadLink}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--rose-accent)', fontSize: '0.75rem' }}>
                          Failed: {item.errorMessage || 'Link not found'}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      {item.downloadLink && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleCopySingle(item.id, item.downloadLink)}
                            style={{ height: '28px', width: '28px', padding: 0, justifyContent: 'center' }}
                            title="Copy download link"
                          >
                            {copiedId === item.id ? <Check size={13} color="var(--emerald-accent)" /> : <Copy size={13} />}
                          </button>
                          <a
                            href={item.downloadLink}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary"
                            style={{ height: '28px', width: '28px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                            title="Open direct link"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
