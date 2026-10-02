import React, { useState } from 'react';
import { X, ExternalLink, Globe, Image as ImageIcon, Link2, ListOrdered, FileText, Camera } from 'lucide-react';
import type { PageData } from '../types';

interface PageDetailModalProps {
  page: PageData | null;
  onClose: () => void;
}

export const PageDetailModal: React.FC<PageDetailModalProps> = ({ page, onClose }) => {
  const [activeTab, setActiveTab] = useState<'content' | 'screenshot' | 'headings' | 'links' | 'images'>('content');

  if (!page) return null;

  return (
    <div className="modal-overlay" onClick={onClose} id="page-detail-modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title" style={{ maxWidth: '85%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className={`status-badge status-${page.statusCode >= 200 && page.statusCode < 300 ? '200' : '400'}`}>
                {page.statusCode} {page.statusText}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Depth: {page.depth}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--emerald-accent)' }}>⚡ {page.loadTimeMs}ms</span>
            </div>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {page.title || 'Untitled Page'}
            </h3>
            <p>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cyan-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <span>{page.url}</span>
                <ExternalLink size={12} />
              </a>
            </p>
          </div>

          <button type="button" className="close-btn" onClick={onClose} title="Close Modal">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ padding: '0 1.5rem', borderBottom: '1px solid var(--bg-surface-border)', display: 'flex', gap: '0.4rem', background: 'var(--bg-surface-elevated)' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}
          >
            <FileText size={15} />
            <span>Extracted Content</span>
          </button>

          {page.screenshot && (
            <button
              type="button"
              className={`tab-btn ${activeTab === 'screenshot' ? 'active' : ''}`}
              onClick={() => setActiveTab('screenshot')}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}
            >
              <Camera size={15} />
              <span>Brave Viewport</span>
            </button>
          )}

          <button
            type="button"
            className={`tab-btn ${activeTab === 'headings' ? 'active' : ''}`}
            onClick={() => setActiveTab('headings')}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}
          >
            <ListOrdered size={15} />
            <span>Headings ({page.headings.length})</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'links' ? 'active' : ''}`}
            onClick={() => setActiveTab('links')}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}
          >
            <Link2 size={15} />
            <span>Discovered Links ({page.links.length})</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => setActiveTab('images')}
            style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}
          >
            <ImageIcon size={15} />
            <span>Images ({page.images.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Metadata Bar */}
          {page.metaDescription && (
            <div style={{ background: 'var(--bg-surface-elevated)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: '#fff', marginRight: '0.4rem' }}>Meta Description:</span>
              {page.metaDescription}
            </div>
          )}

          {/* Tab 1: Extracted Content */}
          {activeTab === 'content' && (
            <div className="detail-section">
              <h4>Structured Markdown / Text Content</h4>
              <div className="content-markdown-box">
                {page.markdownContent || page.contentPreview || 'No readable text content found on this page.'}
              </div>
            </div>
          )}

          {/* Tab 2: Screenshot */}
          {activeTab === 'screenshot' && page.screenshot && (
            <div className="detail-section">
              <h4>Captured Brave Browser Viewport</h4>
              <img src={page.screenshot} alt={page.title} className="modal-screenshot-view" />
            </div>
          )}

          {/* Tab 3: Headings */}
          {activeTab === 'headings' && (
            <div className="detail-section">
              <h4>Page Heading Outline</h4>
              {page.headings.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No H1-H3 headings found on this page.</div>
              ) : (
                <div className="headings-list">
                  {page.headings.map((h, i) => (
                    <div key={i} className="heading-tag" style={{ paddingLeft: `${(h.level - 1) * 1.2}rem` }}>
                      <span className="heading-lvl">H{h.level}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{h.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Links */}
          {activeTab === 'links' && (
            <div className="detail-section">
              <h4>Outbound Hyperlinks ({page.links.length})</h4>
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {page.links.map((link, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                      <span style={{ fontWeight: 600, color: '#fff', marginRight: '0.5rem' }}>{link.text || 'Link'}</span>
                      <span style={{ color: 'var(--cyan-accent)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                        {link.href}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '999px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        background: link.isInternal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                        color: link.isInternal ? '#34d399' : 'var(--text-muted)',
                      }}
                    >
                      {link.isInternal ? 'Internal' : 'External'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 5: Images */}
          {activeTab === 'images' && (
            <div className="detail-section">
              <h4>Discovered Images ({page.images.length})</h4>
              {page.images.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No image elements detected.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.85rem' }}>
                  {page.images.map((img, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.5rem',
                        border: '1px solid var(--bg-surface-border)',
                      }}
                    >
                      <img
                        src={img.src}
                        alt={img.alt || 'Extracted image'}
                        style={{ width: '100%', height: '110px', objectFit: 'contain', background: '#0a0d14', borderRadius: 'var(--radius-sm)' }}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {img.alt || 'No alt text'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
