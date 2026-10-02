import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, ArrowDownCircle, Check, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { CrawlLog } from '../types';

interface ConsoleStreamProps {
  logs: CrawlLog[];
  onClearLogs?: () => void;
  onSelectPage?: (url: string) => void;
}

export const ConsoleStream: React.FC<ConsoleStreamProps> = ({ logs, onClearLogs, onSelectPage }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'success' | 'warn' | 'error'>('all');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'all') return true;
    return log.level === filterLevel;
  });

  const getLogIcon = (level: CrawlLog['level']) => {
    switch (level) {
      case 'success':
        return <Check size={14} color="var(--emerald-accent)" />;
      case 'warn':
        return <AlertTriangle size={14} color="var(--amber-accent)" />;
      case 'error':
        return <XCircle size={14} color="var(--rose-accent)" />;
      default:
        return <Info size={14} color="var(--cyan-accent)" />;
    }
  };

  return (
    <div className="console-card" id="console-stream-view">
      <div className="console-header">
        <div className="console-title">
          <Terminal size={17} color="var(--brave-orange)" />
          <span>Brave Automation Runtime Stream</span>
          <span className="tab-badge">{filteredLogs.length} events</span>
        </div>

        <div className="console-controls">
          <div className="status-filter-pills">
            {(['all', 'info', 'success', 'warn', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`filter-pill ${filterLevel === lvl ? 'active' : ''}`}
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => setFilterLevel(lvl)}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`btn-secondary ${autoScroll ? 'active' : ''}`}
            id="btn-toggle-autoscroll"
            style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem' }}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Autoscroll Active' : 'Autoscroll Paused'}
          >
            <ArrowDownCircle size={14} color={autoScroll ? 'var(--cyan-accent)' : 'inherit'} />
            <span>Auto-scroll</span>
          </button>

          {onClearLogs && (
            <button
              type="button"
              className="btn-secondary"
              id="btn-clear-console"
              style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem' }}
              onClick={onClearLogs}
              title="Clear Console Output"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="console-body" id="console-logs-body">
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
            Awaiting browser automation events...
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className={`log-entry ${log.level}`}>
              <span className="log-time">[{log.time}]</span>
              <span style={{ display: 'flex', alignItems: 'center' }}>{getLogIcon(log.level)}</span>
              <span className="log-msg">
                {log.message}
                {log.url && onSelectPage && (
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--cyan-accent)',
                      textDecoration: 'underline',
                      marginLeft: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                    onClick={() => onSelectPage(log.url!)}
                  >
                    inspect
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
