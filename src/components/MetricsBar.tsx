import React from 'react';
import { Layers, Clock, Zap, AlertCircle, Link2, Timer } from 'lucide-react';
import type { CrawlStats } from '../types';

interface MetricsBarProps {
  stats: CrawlStats;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ stats }) => {
  return (
    <div className="metrics-grid" id="crawl-metrics-bar">
      {/* Pages Crawled */}
      <div className="metric-card" style={{ '--metric-color': 'var(--brave-orange)' } as any}>
        <div className="metric-header">
          <span>Pages Crawled</span>
          <Layers size={16} />
        </div>
        <div className="metric-value">{stats.pagesCrawled}</div>
        <div className="metric-sub">
          {stats.activeWorkers > 0 ? `${stats.activeWorkers} active tabs` : 'Idle'}
        </div>
      </div>

      {/* In Queue */}
      <div className="metric-card" style={{ '--metric-color': 'var(--cyan-accent)' } as any}>
        <div className="metric-header">
          <span>In Queue</span>
          <Clock size={16} />
        </div>
        <div className="metric-value">{stats.pagesQueued}</div>
        <div className="metric-sub">Pending discovery</div>
      </div>

      {/* Latency */}
      <div className="metric-card" style={{ '--metric-color': 'var(--emerald-accent)' } as any}>
        <div className="metric-header">
          <span>Avg Load Latency</span>
          <Zap size={16} />
        </div>
        <div className="metric-value">
          {stats.avgLatencyMs ? `${stats.avgLatencyMs}ms` : '--'}
        </div>
        <div className="metric-sub">Brave rendering speed</div>
      </div>

      {/* Discovered Links */}
      <div className="metric-card" style={{ '--metric-color': 'var(--purple-accent)' } as any}>
        <div className="metric-header">
          <span>Total Links Found</span>
          <Link2 size={16} />
        </div>
        <div className="metric-value">{stats.totalLinksFound}</div>
        <div className="metric-sub">{stats.totalImagesFound} images extracted</div>
      </div>

      {/* Failed / Errors */}
      <div
        className="metric-card"
        style={{
          '--metric-color': stats.pagesFailed > 0 ? 'var(--rose-accent)' : 'var(--text-muted)',
        } as any}
      >
        <div className="metric-header">
          <span>Failed / Errors</span>
          <AlertCircle size={16} />
        </div>
        <div
          className="metric-value"
          style={{ color: stats.pagesFailed > 0 ? 'var(--rose-accent)' : 'inherit' }}
        >
          {stats.pagesFailed}
        </div>
        <div className="metric-sub">HTTP 4xx / 5xx / timeouts</div>
      </div>

      {/* Elapsed Time */}
      <div className="metric-card" style={{ '--metric-color': 'var(--amber-accent)' } as any}>
        <div className="metric-header">
          <span>Elapsed Time</span>
          <Timer size={16} />
        </div>
        <div className="metric-value">{formatDuration(stats.elapsedMs)}</div>
        <div className="metric-sub">Session duration</div>
      </div>
    </div>
  );
};
