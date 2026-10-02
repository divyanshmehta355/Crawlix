import React from 'react';
import { Compass, Flame, Play, Pause, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { CrawlStats } from '../types';

interface HeaderProps {
  stats: CrawlStats;
  onOpenTeachingStudio: () => void;
}

export const Header: React.FC<HeaderProps> = ({ stats, onOpenTeachingStudio }) => {

  const getStatusBadge = () => {
    switch (stats.status) {
      case 'running':
        return (
          <div className="status-indicator" id="header-status-running">
            <span className="status-dot running" />
            <span style={{ color: 'var(--emerald-accent)' }}>Crawling... ({stats.activeWorkers} workers)</span>
          </div>
        );
      case 'paused':
        return (
          <div className="status-indicator" id="header-status-paused">
            <span className="status-dot paused" />
            <span style={{ color: 'var(--amber-accent)' }}>Paused</span>
          </div>
        );
      case 'completed':
        return (
          <div className="status-indicator" id="header-status-completed">
            <span className="status-dot completed" />
            <span style={{ color: 'var(--cyan-accent)' }}>Crawl Complete</span>
          </div>
        );
      case 'stopped':
        return (
          <div className="status-indicator" id="header-status-stopped">
            <span className="status-dot" />
            <span>Stopped</span>
          </div>
        );
      default:
        return (
          <div className="status-indicator" id="header-status-idle">
            <span className="status-dot" />
            <span>Engine Ready</span>
          </div>
        );
    }
  };

  return (
    <header className="crawlix-header">
      <div className="header-container">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <Compass size={24} color="#ffffff" />
          </div>
          <div className="brand-text">
            <h1>Crawlix</h1>
            <span className="brand-tagline">Autonomous Web Crawler & Graph Mapper</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            type="button"
            className="btn-primary"
            id="header-btn-teach"
            onClick={onOpenTeachingStudio}
            style={{ height: '36px', padding: '0 0.95rem', fontSize: '0.8rem' }}
          >
            <span>🎓 Teach Crawlix</span>
          </button>

          <div className="brave-badge" title="Running with system Brave Browser automation">
            <Flame size={14} />
            <span>Brave Engine Active</span>
            <ShieldCheck size={13} style={{ color: '#10b981' }} />
          </div>

          {getStatusBadge()}
        </div>
      </div>
    </header>
  );
};
