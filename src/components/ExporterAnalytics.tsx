import React from 'react';
import { Download, FileJson, FileSpreadsheet, FileCode, CheckCircle2, AlertOctagon, BarChart3, Layers } from 'lucide-react';
import type { PageData, CrawlStats } from '../types';

interface ExporterAnalyticsProps {
  pages: PageData[];
  stats: CrawlStats;
}

export const ExporterAnalytics: React.FC<ExporterAnalyticsProps> = ({ pages, stats }) => {
  const brokenPages = pages.filter((p) => p.statusCode >= 400 || p.statusCode === 0);
  const okPages = pages.filter((p) => p.statusCode >= 200 && p.statusCode < 300);

  // Depth breakdown
  const depthCounts: Record<number, number> = {};
  pages.forEach((p) => {
    depthCounts[p.depth] = (depthCounts[p.depth] || 0) + 1;
  });

  const handleExport = (format: 'json' | 'csv' | 'markdown') => {
    window.open(`/api/crawl/export/${format}`, '_blank');
  };

  return (
    <div className="analytics-grid" id="analytics-and-exporter">
      {/* Exporter Card */}
      <div className="glass-panel export-card">
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={20} color="var(--brave-orange)" />
            Data Exporter
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
            Download complete crawl datasets in your preferred data exchange format
          </p>
        </div>

        <div className="export-buttons-list">
          {/* JSON */}
          <div className="export-download-btn" onClick={() => handleExport('json')} id="btn-export-json">
            <div className="export-info">
              <h4>
                <FileJson size={18} color="var(--cyan-accent)" />
                JSON Dataset
              </h4>
              <p>Full structured dataset with page metadata, link graphs, headings & images</p>
            </div>
            <Download size={18} color="var(--text-muted)" />
          </div>

          {/* CSV */}
          <div className="export-download-btn" onClick={() => handleExport('csv')} id="btn-export-csv">
            <div className="export-info">
              <h4>
                <FileSpreadsheet size={18} color="var(--emerald-accent)" />
                Spreadsheet CSV
              </h4>
              <p>Tabular matrix of URLs, titles, status codes, load latency & link tallies</p>
            </div>
            <Download size={18} color="var(--text-muted)" />
          </div>

          {/* Markdown */}
          <div className="export-download-btn" onClick={() => handleExport('markdown')} id="btn-export-markdown">
            <div className="export-info">
              <h4>
                <FileCode size={18} color="var(--purple-accent)" />
                Markdown Site Archive
              </h4>
              <p>Clean consolidated markdown bundle containing scraped content outlines</p>
            </div>
            <Download size={18} color="var(--text-muted)" />
          </div>
        </div>
      </div>

      {/* Crawl Health & Quality Analytics */}
      <div className="glass-panel export-card">
        <div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={20} color="var(--cyan-accent)" />
            Crawl Health & Depth Audit
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
            Integrity breakdown of discovered pages and response distributions
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Status Breakdown Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Status Code Distribution</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--emerald-accent)' }}>
                {pages.length > 0 ? `${Math.round((okPages.length / pages.length) * 100)}% Success` : '0%'}
              </span>
            </div>
            <div style={{ height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
              <div
                style={{
                  width: `${pages.length > 0 ? (okPages.length / pages.length) * 100 : 0}%`,
                  background: 'var(--emerald-accent)',
                }}
              />
              <div
                style={{
                  width: `${pages.length > 0 ? (brokenPages.length / pages.length) * 100 : 0}%`,
                  background: 'var(--rose-accent)',
                }}
              />
            </div>
          </div>

          {/* Depth Breakdown */}
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Pages Crawled by Hierarchy Depth:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {Object.entries(depthCounts).map(([depth, count]) => (
                <div
                  key={depth}
                  style={{
                    padding: '0.4rem 0.75rem',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--bg-surface-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.76rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ color: 'var(--brave-orange)', fontWeight: 700 }}>Depth {depth}:</span>{' '}
                  <span style={{ color: '#fff' }}>{count} pages</span>
                </div>
              ))}
            </div>
          </div>

          {/* Broken Links Report */}
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <AlertOctagon size={14} color={brokenPages.length > 0 ? 'var(--rose-accent)' : 'var(--emerald-accent)'} />
              <span>Issues / Broken Pages ({brokenPages.length})</span>
            </div>

            {brokenPages.length === 0 ? (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  color: '#34d399',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <CheckCircle2 size={16} />
                <span>Zero broken pages detected! Clean crawl.</span>
              </div>
            ) : (
              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {brokenPages.map((bp) => (
                  <div
                    key={bp.id}
                    style={{
                      padding: '0.4rem 0.6rem',
                      background: 'rgba(244, 63, 94, 0.08)',
                      border: '1px solid rgba(244, 63, 94, 0.2)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#f87171',
                      wordBreak: 'break-all',
                    }}
                  >
                    [{bp.statusCode || 'ERR'}] {bp.url}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
