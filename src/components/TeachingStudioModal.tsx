import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  X,
  Play,
  Square,
  Plus,
  Trash2,
  MousePointerClick,
  FileEdit,
  Globe,
  Clock,
  Database,
  ArrowRight,
  Flame,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import type { LearnedAction, LearnedRecipe } from '../types';

interface TeachingStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRecipe: (recipe: LearnedRecipe) => Promise<void>;
  liveActions: LearnedAction[];
  setLiveActions: React.Dispatch<React.SetStateAction<LearnedAction[]>>;
}

export const TeachingStudioModal: React.FC<TeachingStudioModalProps> = ({
  isOpen,
  onClose,
  onSaveRecipe,
  liveActions,
  setLiveActions,
}) => {
  const [startUrl, setStartUrl] = useState('https://news.ycombinator.com');
  const [isRecording, setIsRecording] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipeDesc, setRecipeDesc] = useState('');
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualType, setManualType] = useState<LearnedAction['type']>('extract');
  const [manualSelector, setManualSelector] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualFieldName, setManualFieldName] = useState('');
  const [manualExtractType, setManualExtractType] = useState<'text' | 'list'>('text');
  const [saving, setSaving] = useState(false);

  // Sync state with server
  useEffect(() => {
    if (isOpen) {
      fetch('/api/teaching/state')
        .then((res) => res.json())
        .then((state) => {
          setIsRecording(state.isActive);
          if (state.recordedActions && state.recordedActions.length > 0) {
            setLiveActions(state.recordedActions);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, setLiveActions]);

  if (!isOpen) return null;

  const handleStartTeaching = async () => {
    if (!startUrl.trim()) return;
    setLiveActions([]);
    try {
      const res = await fetch('/api/teaching/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl: startUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRecording(true);
        if (!recipeName) {
          try {
            const host = new URL(startUrl).hostname;
            setRecipeName(`${host} Scrape Flow`);
          } catch {}
        }
      }
    } catch (err: any) {
      alert(`Failed to launch Brave: ${err.message}`);
    }
  };

  const handleStopTeaching = async () => {
    try {
      const res = await fetch('/api/teaching/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsRecording(false);
        if (data.recordedActions) {
          setLiveActions(data.recordedActions);
        }
      }
    } catch (err: any) {
      setIsRecording(false);
    }
  };

  const handleDeleteAction = (index: number) => {
    setLiveActions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddManualAction = () => {
    if (manualType === 'extract' && !manualFieldName.trim()) {
      alert('Please specify a Field Name for extraction');
      return;
    }

    const action: LearnedAction = {
      id: `manual-${Date.now()}`,
      type: manualType,
      selector: manualSelector.trim() || undefined,
      value: manualValue.trim() || undefined,
      fieldName: manualFieldName.trim() || undefined,
      extractType: manualType === 'extract' ? manualExtractType : undefined,
      description:
        manualType === 'extract'
          ? `Extract "${manualFieldName}" from ${manualSelector}`
          : `${manualType.toUpperCase()} on ${manualSelector || manualValue}`,
      timestamp: Date.now(),
    };

    setLiveActions((prev) => [...prev, action]);
    setShowAddManual(false);
    setManualSelector('');
    setManualValue('');
    setManualFieldName('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeName.trim()) {
      alert('Please enter a Recipe Name');
      return;
    }
    if (liveActions.length === 0) {
      alert('Please record or add at least one action step.');
      return;
    }

    setSaving(true);
    let domain = 'example.com';
    try {
      domain = new URL(startUrl).hostname;
    } catch {}

    const recipe: LearnedRecipe = {
      id: `recipe-${Date.now()}`,
      name: recipeName.trim(),
      description: recipeDesc.trim() || `Workflow learned on ${new Date().toLocaleDateString()}`,
      targetUrl: startUrl.trim(),
      domain,
      actions: liveActions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
    };

    try {
      await onSaveRecipe(recipe);
      if (isRecording) {
        await handleStopTeaching();
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const getActionIcon = (type: LearnedAction['type']) => {
    switch (type) {
      case 'navigate':
        return <Globe size={16} color="var(--cyan-accent)" />;
      case 'click':
        return <MousePointerClick size={16} color="var(--brave-orange)" />;
      case 'type':
        return <FileEdit size={16} color="var(--amber-accent)" />;
      case 'wait':
        return <Clock size={16} color="var(--text-muted)" />;
      case 'extract':
        return <Database size={16} color="var(--emerald-accent)" />;
      default:
        return <ArrowRight size={16} color="var(--purple-accent)" />;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="teaching-studio-overlay">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '960px', height: '90vh' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span className="brave-badge">
                <Flame size={14} />
                <span>Brave Studio</span>
              </span>
              {isRecording ? (
                <span
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  <span className="status-dot running" style={{ background: '#ef4444' }} />
                  Watching & Learning...
                </span>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Interactive Demonstration & Recording
                </span>
              )}
            </div>
            <h3>🎓 Teach Crawlix: Demonstration Studio</h3>
            <p>
              Launch a live Brave session, interact naturally, and Crawlix will learn the exact steps & fields
            </p>
          </div>

          <button type="button" className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Studio Content */}
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Left Panel: Target URL & Live Browser Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="detail-section">
              <h4>1. Target URL to Demonstrate On</h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="url"
                  className="setting-input"
                  id="teaching-target-url"
                  value={startUrl}
                  disabled={isRecording}
                  onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ flex: 1, padding: '0.65rem 0.85rem' }}
                />

                {!isRecording ? (
                  <button
                    type="button"
                    className="btn-primary"
                    id="btn-launch-teaching"
                    onClick={handleStartTeaching}
                    style={{ height: '42px', padding: '0 1rem' }}
                  >
                    <Play size={16} />
                    <span>Launch Brave</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary btn-danger"
                    id="btn-stop-teaching"
                    onClick={handleStopTeaching}
                    style={{ height: '42px', padding: '0 1rem' }}
                  >
                    <Square size={15} />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>
            </div>

            {/* In-Page Guidance */}
            <div
              style={{
                background: isRecording ? 'rgba(255, 85, 0, 0.08)' : 'var(--bg-surface-elevated)',
                border: `1px solid ${isRecording ? 'rgba(255, 85, 0, 0.3)' : 'var(--bg-surface-border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                fontSize: '0.8rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--brave-orange)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <HelpCircle size={15} />
                <span>How to show Crawlix what to do:</span>
              </div>
              <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li><b>Normal Clicks & Typing:</b> Just click links, buttons, and type into search boxes in the Brave window.</li>
                <li><b>Extract Specific Fields:</b> In the Brave window, click the floating <b>"🎯 Pick Field to Extract"</b> button, then click any element on the page (e.g. title, price) and name it!</li>
                <li><b>Pagination:</b> Click <b>"⏭️ Next Page Button"</b> on the in-page toolbar, then click the next page button.</li>
              </ul>
            </div>

            {/* Save Recipe Form */}
            <form onSubmit={handleSave} className="detail-section" style={{ marginTop: 'auto' }}>
              <h4>3. Save as Reusable Recipe</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recipe Name</label>
                  <input
                    type="text"
                    className="setting-input"
                    id="input-recipe-name"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    placeholder="e.g. Hacker News Top Scraper"
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Description (Optional)</label>
                  <input
                    type="text"
                    className="setting-input"
                    id="input-recipe-desc"
                    value={recipeDesc}
                    onChange={(e) => setRecipeDesc(e.target.value)}
                    placeholder="What this workflow accomplishes..."
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  id="btn-save-learned-recipe"
                  disabled={saving || liveActions.length === 0}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.4rem' }}
                >
                  <CheckCircle size={16} />
                  <span>Save Learned Recipe ({liveActions.length} steps)</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Panel: Live Action Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                2. Learned Steps Timeline ({liveActions.length})
              </h4>

              <button
                type="button"
                className="btn-secondary"
                id="btn-add-manual-step"
                onClick={() => setShowAddManual(!showAddManual)}
                style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.75rem' }}
              >
                <Plus size={13} />
                <span>Add Step</span>
              </button>
            </div>

            {/* Manual Step Form */}
            {showAddManual && (
              <div
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--brave-orange)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="setting-input"
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    style={{ width: '110px' }}
                  >
                    <option value="extract">Extract</option>
                    <option value="click">Click</option>
                    <option value="type">Type</option>
                    <option value="wait">Wait</option>
                    <option value="scroll">Scroll</option>
                    <option value="pagination">Pagination</option>
                  </select>

                  <input
                    type="text"
                    className="setting-input"
                    placeholder="CSS Selector (e.g. .titleline > a)"
                    value={manualSelector}
                    onChange={(e) => setManualSelector(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>

                {manualType === 'extract' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="setting-input"
                      placeholder="Field Name (e.g. title, price)"
                      value={manualFieldName}
                      onChange={(e) => setManualFieldName(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <select
                      className="setting-input"
                      value={manualExtractType}
                      onChange={(e) => setManualExtractType(e.target.value as any)}
                      style={{ width: '130px' }}
                    >
                      <option value="text">Single Text</option>
                      <option value="list">List of Elements</option>
                    </select>
                  </div>
                )}

                {manualType === 'type' && (
                  <input
                    type="text"
                    className="setting-input"
                    placeholder="Text value to type into input"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowAddManual(false)}
                    style={{ height: '30px', padding: '0 0.75rem', fontSize: '0.75rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddManualAction}
                    style={{ height: '30px', padding: '0 0.75rem', fontSize: '0.75rem' }}
                  >
                    Insert Step
                  </button>
                </div>
              </div>
            )}

            {/* Actions List */}
            <div
              style={{
                flex: 1,
                maxHeight: '440px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                paddingRight: '0.4rem',
              }}
            >
              {liveActions.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--bg-surface-border)',
                  }}
                >
                  <GraduationCap size={36} color="var(--brave-orange)" style={{ margin: '0 auto 0.5rem' }} />
                  <p>No actions recorded yet.</p>
                  <p style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                    Click <b>"Launch Brave"</b> to start interacting or add steps manually.
                  </p>
                </div>
              ) : (
                liveActions.map((action, idx) => (
                  <div
                    key={action.id || idx}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--bg-surface-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          width: '18px',
                        }}
                      >
                        #{idx + 1}
                      </span>
                      {getActionIcon(action.type)}
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {action.description || action.type}
                        </div>
                        {action.selector && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--cyan-accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {action.selector}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {action.type}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAction(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                        title="Remove step"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
