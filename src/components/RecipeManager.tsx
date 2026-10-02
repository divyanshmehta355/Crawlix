import React, { useState } from 'react';
import {
  GraduationCap,
  Play,
  Trash2,
  Download,
  FileSpreadsheet,
  FileJson,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Flame,
  ChevronRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import type { LearnedRecipe, RecipeExecutionResult } from '../types';

interface RecipeManagerProps {
  recipes: LearnedRecipe[];
  onOpenTeachingStudio: () => void;
  onDeleteRecipe: (id: string) => Promise<void>;
  onExecuteRecipe: (recipe: LearnedRecipe, headless: boolean, maxPages: number) => Promise<void>;
  executionResult: RecipeExecutionResult | null;
  isExecuting: boolean;
}

export const RecipeManager: React.FC<RecipeManagerProps> = ({
  recipes,
  onOpenTeachingStudio,
  onDeleteRecipe,
  onExecuteRecipe,
  executionResult,
  isExecuting,
}) => {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [headless, setHeadless] = useState(true);
  const [maxPages, setMaxPages] = useState(2);

  const selectedRecipe = recipes.find((r) => r.id === selectedRecipeId) || recipes[0] || null;

  const handleRun = async (recipe: LearnedRecipe) => {
    setSelectedRecipeId(recipe.id);
    await onExecuteRecipe(recipe, headless, maxPages);
  };

  const handleDownloadCsv = () => {
    if (!executionResult || executionResult.extractedRecords.length === 0) return;
    const records = executionResult.extractedRecords;
    const headers = Object.keys(records[0]).filter((k) => !k.startsWith('_'));
    const csvRows = [
      headers.join(','),
      ...records.map((row) =>
        headers
          .map((h) => {
            const val = row[h] !== undefined ? String(row[h]) : '';
            return `"${val.replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${executionResult.recipeName.toLowerCase().replace(/\s+/g, '-')}-data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!executionResult || executionResult.extractedRecords.length === 0) return;
    const blob = new Blob([JSON.stringify(executionResult.extractedRecords, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${executionResult.recipeName.toLowerCase().replace(/\s+/g, '-')}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} id="recipe-manager-tab">
      {/* Top Banner */}
      <div className="glass-panel launchpad-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <GraduationCap size={22} color="var(--brave-orange)" />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800 }}>
                Learned Recipes & Automation Workflows
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              Workflows Crawlix has learned from your browser demonstrations. Replay them anytime in Brave!
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Headless Toggle */}
            <div
              className="toggle-wrapper"
              onClick={() => setHeadless(!headless)}
              style={{ background: 'var(--bg-surface-elevated)', padding: '0.4rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-surface-border)' }}
            >
              <input
                type="checkbox"
                className="toggle-input"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {headless ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <EyeOff size={14} /> Headless
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--brave-orange)' }}>
                    <Eye size={14} /> Visible Brave
                  </span>
                )}
              </span>
            </div>

            <button
              type="button"
              className="btn-primary"
              id="btn-teach-new-recipe"
              onClick={onOpenTeachingStudio}
              style={{ height: '42px', padding: '0 1.25rem' }}
            >
              <Sparkles size={16} />
              <span>Teach New Recipe</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Recipes List (Left) + Execution Results (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Saved Recipes Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Saved Workflows ({recipes.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {recipes.map((recipe) => {
              const isSelected = selectedRecipe?.id === recipe.id;
              return (
                <div
                  key={recipe.id}
                  className="glass-panel"
                  id={`recipe-card-${recipe.id}`}
                  style={{
                    padding: '1.1rem',
                    border: isSelected ? '1px solid var(--brave-orange)' : '1px solid var(--bg-surface-border)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                      {recipe.name}
                    </h4>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        background: 'rgba(255, 85, 0, 0.12)',
                        color: 'var(--brave-amber)',
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      {recipe.actions.length} steps
                    </span>
                  </div>

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
                    {recipe.description}
                  </p>

                  <div style={{ fontSize: '0.72rem', color: 'var(--cyan-accent)', fontFamily: 'var(--font-mono)', marginBottom: '0.85rem' }}>
                    {recipe.targetUrl}
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.65rem', borderTop: '1px solid var(--bg-surface-border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Executed: {recipe.runCount || 0} times
                    </span>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        id={`btn-run-recipe-${recipe.id}`}
                        disabled={isExecuting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun(recipe);
                        }}
                        style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                      >
                        {isExecuting && isSelected ? (
                          <RefreshCw className="animate-spin" size={14} />
                        ) : (
                          <Play size={14} />
                        )}
                        <span>Run Recipe</span>
                      </button>

                      <button
                        type="button"
                        className="btn-secondary btn-danger"
                        disabled={isExecuting}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete recipe "${recipe.name}"?`)) {
                            onDeleteRecipe(recipe.id);
                          }
                        }}
                        style={{ height: '32px', width: '32px', padding: 0, justifyContent: 'center' }}
                        title="Delete Recipe"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Execution Results & Structured Data Table */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '520px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--bg-surface-border)', paddingBottom: '0.75rem' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} color="var(--emerald-accent)" />
                <span>Extracted Data & Execution Results</span>
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {executionResult
                  ? `Executed: ${executionResult.recipeName} (${executionResult.durationMs}ms)`
                  : selectedRecipe
                  ? `Ready to execute "${selectedRecipe.name}"`
                  : 'Select a recipe and run it with Brave'}
              </p>
            </div>

            {executionResult && executionResult.extractedRecords.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  id="btn-download-recipe-csv"
                  onClick={handleDownloadCsv}
                  style={{ height: '34px', fontSize: '0.78rem', padding: '0 0.8rem' }}
                >
                  <FileSpreadsheet size={15} color="var(--emerald-accent)" />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  id="btn-download-recipe-json"
                  onClick={handleDownloadJson}
                  style={{ height: '34px', fontSize: '0.78rem', padding: '0 0.8rem' }}
                >
                  <FileJson size={15} color="var(--cyan-accent)" />
                  <span>Download JSON</span>
                </button>
              </div>
            )}
          </div>

          {/* Running State Indicator */}
          {isExecuting && (
            <div
              style={{
                padding: '1.25rem',
                background: 'rgba(255, 85, 0, 0.08)',
                border: '1px solid rgba(255, 85, 0, 0.3)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <RefreshCw className="animate-spin" size={24} color="var(--brave-orange)" />
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>
                  Brave is executing learned actions...
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Navigating, interacting with DOM elements, and scraping learned data points.
                </div>
              </div>
            </div>
          )}

          {/* Extracted Records Table */}
          {executionResult && executionResult.extractedRecords.length > 0 ? (
            <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--bg-surface-border)' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: '50px' }}>#</th>
                    {Object.keys(executionResult.extractedRecords[0])
                      .filter((k) => !k.startsWith('_'))
                      .map((key) => (
                        <th
                          key={key}
                          style={{
                            padding: '0.75rem',
                            color: 'var(--brave-amber)',
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {executionResult.extractedRecords.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid var(--bg-surface-border)',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}
                    >
                      <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {idx + 1}
                      </td>
                      {Object.keys(row)
                        .filter((k) => !k.startsWith('_'))
                        .map((key) => (
                          <td
                            key={key}
                            style={{
                              padding: '0.65rem 0.75rem',
                              color: 'var(--text-primary)',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={String(row[key])}
                          >
                            {String(row[key]) || <span style={{ color: 'var(--text-muted)' }}>--</span>}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !isExecuting ? (
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <Database className="empty-state-icon" size={42} />
              <h3>No recipe execution data yet</h3>
              <p>
                Click <b>"Run Recipe"</b> on any saved workflow to watch Brave extract structured data records.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
