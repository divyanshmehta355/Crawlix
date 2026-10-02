import React, { useState, useMemo } from 'react';
import { Search, ExternalLink, ArrowUpDown, Image as ImageIcon, Link2, Globe, FileText, ChevronRight } from 'lucide-react';
import type { PageData } from '../types';

interface PagesExplorerProps {
  pages: PageData[];
  onSelectPage: (url: string) => void;
}

export const PagesExplorer: React.FC<PagesExplorerProps> = ({ pages, onSelectPage }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '2xx' | '3xx' | '4xx' | '5xx'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'latency' | 'links' | 'depth'>('time');

  const filteredPages = useMemo(() => {
    let result = [...pages];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.url.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.metaDescription.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      if (statusFilter === '2xx') result = result.filter((p) => p.statusCode >= 200 && p.statusCode < 300);
      else if (statusFilter === '3xx') result = result.filter((p) => p.statusCode >= 300 && p.statusCode < 400);
      else if (statusFilter === '4xx') result = result.filter((p) => p.statusCode >= 400 && p.statusCode < 500);
      else if (statusFilter === '5xx') result = result.filter((p) => p.statusCode >= 500 || p.statusCode === 0);
    }

    if (sortBy === 'latency') {
      result.sort((a, b) => b.loadTimeMs - a.loadTimeMs);
    } else if (sortBy === 'links') {
      result.sort((a, b) => b.links.length - a.links.length);
    } else if (sortBy === 'depth') {
      result.sort((a, b) => a.depth - b.depth);
    } else {
      // By crawl timestamp reverse
      result.sort((a, b) => b.timestamp - a.timestamp);
    }

    return result;
  }, [pages, search, statusFilter, sortBy]);

  const getStatusClass = (code: number) => {
    if (code >= 200 && code < 300) return 'status-200';
    if (code >= 300 && code < 400) return 'status-300';
    if (code >= 400 && code < 500) return 'status-400';
    return 'status-500';
  };

  return (
    <div className="glass-panel pages-explorer-card" id="pages-explorer">
      {/* Search and Filters */}
      <div className="explorer-filters-bar">
        <div className="search-box-wrapper">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            className="search-input"
            id="input-page-search"
            placeholder="Search crawled URLs, page titles, or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="status-filter-pills">
          {(['all', '2xx', '3xx', '4xx', '5xx'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-pill ${statusFilter === filter ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter)}
            >
              {filter.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ArrowUpDown size={15} color="var(--text-muted)" />
          <select
            className="setting-input"
            id="select-sort-by"
            style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="time">Latest Crawled</option>
            <option value="latency">Highest Latency</option>
            <option value="links">Most Links</option>
            <option value="depth">Crawl Depth</option>
          </select>
        </div>
      </div>

      {/* Pages Grid */}
      {filteredPages.length === 0 ? (
        <div className="empty-state">
          <FileText className="empty-state-icon" size={40} />
          <h3>No pages match your filter</h3>
          <p>Try searching for a different keyword or start a new crawl</p>
        </div>
      ) : (
        <div className="pages-grid" id="pages-grid-list">
          {filteredPages.map((page) => (
            <div key={page.id} className="page-card" id={`page-card-${page.id}`}>
              {/* Thumbnail */}
              <div className="page-thumbnail-container" onClick={() => onSelectPage(page.url)} style={{ cursor: 'pointer' }}>
                {page.screenshot ? (
                  <img
                    src={page.screenshot}
                    alt={page.title}
                    className="page-thumbnail-img"
                    loading="lazy"
                  />
                ) : (
                  <div className="thumbnail-placeholder">
                    <Globe size={32} />
                  </div>
                )}

                <div className="page-badge-float">
                  <span className={`status-badge ${getStatusClass(page.statusCode)}`}>
                    {page.statusCode || 'ERR'} {page.statusText}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="page-card-content">
                <div
                  className="page-card-title"
                  title={page.title}
                  onClick={() => onSelectPage(page.url)}
                  style={{ cursor: 'pointer' }}
                >
                  {page.title || 'Untitled Page'}
                </div>

                <div className="page-card-url" title={page.url}>
                  {page.url}
                </div>

                {page.metaDescription && (
                  <div className="page-card-desc" title={page.metaDescription}>
                    {page.metaDescription}
                  </div>
                )}

                {/* Metadata Strip */}
                <div className="page-card-meta">
                  <div className="meta-stats">
                    <span title="Load Latency" style={{ color: 'var(--emerald-accent)', fontWeight: 600 }}>
                      ⚡ {page.loadTimeMs}ms
                    </span>
                    <span title="Internal / External Links">
                      🔗 {page.internalLinksCount + page.externalLinksCount} links
                    </span>
                    <span title="Crawl Depth">
                      📍 D:{page.depth}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="inspect-link-btn"
                    onClick={() => onSelectPage(page.url)}
                  >
                    <span>Inspect</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
