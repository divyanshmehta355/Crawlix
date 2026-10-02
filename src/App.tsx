import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Network, Grid, Terminal, BarChart2, GraduationCap, Film } from 'lucide-react';
import { Header } from './components/Header';
import { Launchpad } from './components/Launchpad';
import { MetricsBar } from './components/MetricsBar';
import { GraphView } from './components/GraphView';
import { PagesExplorer } from './components/PagesExplorer';
import { ConsoleStream } from './components/ConsoleStream';
import { ExporterAnalytics } from './components/ExporterAnalytics';
import { PageDetailModal } from './components/PageDetailModal';
import { TeachingStudioModal } from './components/TeachingStudioModal';
import { RecipeManager } from './components/RecipeManager';
import { LoopAutomator } from './components/LoopAutomator';
import type {
  CrawlConfig,
  CrawlLog,
  CrawlStats,
  ExtractedDownloadLink,
  GraphLink,
  GraphNode,
  LearnedAction,
  LearnedRecipe,
  LoopCrawlConfig,
  LoopCrawlProgress,
  PageData,
  RecipeExecutionResult,
} from './types';

const INITIAL_STATS: CrawlStats = {
  status: 'idle',
  pagesCrawled: 0,
  pagesQueued: 0,
  pagesFailed: 0,
  avgLatencyMs: 0,
  elapsedMs: 0,
  activeWorkers: 0,
  totalLinksFound: 0,
  totalImagesFound: 0,
};

const INITIAL_LOOP_PROGRESS: LoopCrawlProgress = {
  status: 'idle',
  currentIndex: 0,
  totalItems: 0,
  currentMovieTitle: '',
  currentStep: '',
  extractedCount: 0,
  failedCount: 0,
  elapsedMs: 0,
};

export const App: React.FC = () => {
  const [stats, setStats] = useState<CrawlStats>(INITIAL_STATS);
  const [pages, setPages] = useState<PageData[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [activeTab, setActiveTab] = useState<'loop' | 'recipes' | 'graph' | 'pages' | 'console' | 'analytics'>('loop');
  const [selectedPageUrl, setSelectedPageUrl] = useState<string | null>(null);

  // Teaching & Recipe States
  const [recipes, setRecipes] = useState<LearnedRecipe[]>([]);
  const [isTeachingOpen, setIsTeachingOpen] = useState(false);
  const [liveActions, setLiveActions] = useState<LearnedAction[]>([]);
  const [executionResult, setExecutionResult] = useState<RecipeExecutionResult | null>(null);
  const [isExecutingRecipe, setIsExecutingRecipe] = useState(false);

  // Batch Movie Loop States
  const [loopProgress, setLoopProgress] = useState<LoopCrawlProgress>(INITIAL_LOOP_PROGRESS);
  const [extractedLinks, setExtractedLinks] = useState<ExtractedDownloadLink[]>([]);



  // Load initial data and connect SSE
  useEffect(() => {
    // Fetch initial status
    fetch('/api/crawl/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
      })
      .catch(() => {});

    // Fetch initial pages
    fetch('/api/crawl/pages')
      .then((res) => res.json())
      .then((data) => {
        if (data.pages) setPages(data.pages);
      })
      .catch(() => {});

    // Fetch initial graph
    fetch('/api/crawl/graph')
      .then((res) => res.json())
      .then((data) => {
        if (data.nodes) setGraphNodes(data.nodes);
        if (data.links) setGraphLinks(data.links);
      })
      .catch(() => {});

    // Fetch initial logs
    fetch('/api/crawl/logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
      })
      .catch(() => {});

    // Fetch initial recipes
    fetch('/api/recipes')
      .then((res) => res.json())
      .then((data) => {
        if (data.recipes) setRecipes(data.recipes);
      })
      .catch(() => {});

    // Setup SSE
    const evtSource = new EventSource('/api/crawl/events');

    evtSource.addEventListener('status', (e) => {
      try {
        const newStats = JSON.parse(e.data);
        setStats(newStats);
      } catch {}
    });

    evtSource.addEventListener('stats:tick', (e) => {
      try {
        const newStats = JSON.parse(e.data);
        setStats(newStats);
      } catch {}
    });

    evtSource.addEventListener('page', (e) => {
      try {
        const page: PageData = JSON.parse(e.data);
        setPages((prev) => {
          const index = prev.findIndex((p) => p.url === page.url);
          if (index >= 0) {
            const next = [...prev];
            next[index] = page;
            return next;
          }
          return [page, ...prev];
        });
      } catch {}
    });

    evtSource.addEventListener('graph', (e) => {
      try {
        const { node, links }: { node: GraphNode; links: GraphLink[] } = JSON.parse(e.data);
        setGraphNodes((prev) => {
          if (prev.some((n) => n.id === node.id)) {
            return prev.map((n) => (n.id === node.id ? node : n));
          }
          return [...prev, node];
        });

        if (links && links.length > 0) {
          setGraphLinks((prev) => {
            const newLinks = links.filter(
              (l) => !prev.some((existing) => existing.source === l.source && existing.target === l.target)
            );
            return [...prev, ...newLinks];
          });
        }
      } catch {}
    });

    evtSource.addEventListener('log', (e) => {
      try {
        const log: CrawlLog = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-400), log]);
      } catch {}
    });

    evtSource.addEventListener('complete', () => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ff5500', '#00f0ff', '#10b981', '#ff8400'],
      });
    });

    // Teaching & Recipe SSE listeners
    evtSource.addEventListener('teaching:action', (e) => {
      try {
        const action: LearnedAction = JSON.parse(e.data);
        setLiveActions((prev) => [...prev, action]);
      } catch {}
    });

    evtSource.addEventListener('teaching:ended', (e) => {
      try {
        const actions: LearnedAction[] = JSON.parse(e.data);
        if (actions) setLiveActions(actions);
      } catch {}
    });

    evtSource.addEventListener('recipe:log', (e) => {
      try {
        const log: CrawlLog = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-400), log]);
      } catch {}
    });

    evtSource.addEventListener('recipe:complete', (e) => {
      try {
        const res: RecipeExecutionResult = JSON.parse(e.data);
        setExecutionResult(res);
        setIsExecutingRecipe(false);
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#ff5500', '#10b981', '#00f0ff'],
        });
      } catch {}
    });

    // Fetch initial loop progress and links
    fetch('/api/loop/progress')
      .then((res) => res.json())
      .then((data) => {
        if (data.progress) setLoopProgress(data.progress);
        if (data.links) setExtractedLinks(data.links);
      })
      .catch(() => {});

    // Loop Crawler SSE listeners
    evtSource.addEventListener('loop:progress', (e) => {
      try {
        const prog: LoopCrawlProgress = JSON.parse(e.data);
        setLoopProgress(prog);
      } catch {}
    });

    evtSource.addEventListener('loop:progress:tick', (e) => {
      try {
        const prog: LoopCrawlProgress = JSON.parse(e.data);
        setLoopProgress(prog);
      } catch {}
    });

    evtSource.addEventListener('loop:item_extracted', (e) => {
      try {
        const link: ExtractedDownloadLink = JSON.parse(e.data);
        setExtractedLinks((prev) => {
          const idx = prev.findIndex((l) => l.id === link.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = link;
            return next;
          }
          return [...prev, link];
        });
      } catch {}
    });

    evtSource.addEventListener('loop:complete', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.links && Array.isArray(data.links)) {
          setExtractedLinks(data.links);
        }
      } catch {}

      // Re-fetch to guarantee 100% sync of all extracted links
      fetch('/api/loop/progress')
        .then((res) => res.json())
        .then((data) => {
          if (data.links) setExtractedLinks(data.links);
          if (data.progress) setLoopProgress(data.progress);
        })
        .catch(() => {});

      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 },
        colors: ['#ff5500', '#10b981', '#00f0ff', '#f59e0b'],
      });
    });

    return () => {
      evtSource.close();
    };
  }, []);

  // Continuous auto-sync while loop is running
  useEffect(() => {
    if (loopProgress.status === 'running') {
      const syncTimer = setInterval(() => {
        fetch('/api/loop/progress')
          .then((res) => res.json())
          .then((data) => {
            if (data.links && data.links.length > 0) {
              setExtractedLinks(data.links);
            }
          })
          .catch(() => {});
      }, 2000);
      return () => clearInterval(syncTimer);
    }
  }, [loopProgress.status]);

  // Crawl Actions
  const handleStart = async (config: CrawlConfig) => {
    // Clear previous view state on new crawl
    setPages([]);
    setGraphNodes([]);
    setGraphLinks([]);
    setLogs([]);

    await fetch('/api/crawl/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  };

  const handlePause = async () => {
    await fetch('/api/crawl/pause', { method: 'POST' });
  };

  const handleResume = async () => {
    await fetch('/api/crawl/resume', { method: 'POST' });
  };

  const handleStop = async () => {
    await fetch('/api/crawl/stop', { method: 'POST' });
  };

  const handleClear = () => {
    setPages([]);
    setGraphNodes([]);
    setGraphLinks([]);
    setLogs([]);
    setStats(INITIAL_STATS);
  };

  // Recipe Handlers
  const handleSaveRecipe = async (recipe: LearnedRecipe) => {
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe),
    });
    const data = await res.json();
    if (data.recipe) {
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.id === data.recipe.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.recipe;
          return next;
        }
        return [data.recipe, ...prev];
      });
      setActiveTab('recipes');
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  };

  const handleExecuteRecipe = async (recipe: LearnedRecipe, headless: boolean, maxPages: number) => {
    setIsExecutingRecipe(true);
    setExecutionResult(null);
    await fetch('/api/recipes/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipeId: recipe.id,
        headless,
        maxPages,
      }),
    });
  };

  // Movie Loop Handlers
  const handleStartLoop = async (config: LoopCrawlConfig) => {
    setExtractedLinks([]);
    await fetch('/api/loop/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  };

  const handlePauseLoop = async () => {
    await fetch('/api/loop/pause', { method: 'POST' });
  };

  const handleResumeLoop = async () => {
    await fetch('/api/loop/resume', { method: 'POST' });
  };

  const handleStopLoop = async () => {
    await fetch('/api/loop/stop', { method: 'POST' });
  };

  const handleClearLoopLinks = () => {
    setExtractedLinks([]);
    setLoopProgress(INITIAL_LOOP_PROGRESS);
  };

  const selectedPage = pages.find((p) => p.url === selectedPageUrl) || null;

  return (
    <div className="crawlix-app">
      <Header
        stats={stats}
        onOpenTeachingStudio={() => setIsTeachingOpen(true)}
      />

      <main className="crawlix-main">
        {/* Launchpad Control Panel */}
        <Launchpad
          stats={stats}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onClear={handleClear}
        />

        {/* Live Metrics Ribbon */}
        <MetricsBar stats={stats} />

        {/* Views Container */}
        <div className="dashboard-container">
          <div className="tabs-navigation">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'loop' ? 'active' : ''}`}
              id="tab-btn-loop"
              onClick={() => setActiveTab('loop')}
              style={{
                borderColor: activeTab === 'loop' ? 'var(--brave-orange)' : 'transparent',
                background: activeTab === 'loop' ? 'rgba(255, 85, 0, 0.12)' : 'transparent',
              }}
            >
              <Film className="tab-icon" size={17} color="var(--brave-orange)" />
              <span style={{ fontWeight: 700 }}>🎬 Movie Loop & Links</span>
              <span className="tab-badge" style={{ background: 'var(--brave-orange)', color: '#fff' }}>
                {extractedLinks.length}
              </span>
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'recipes' ? 'active' : ''}`}
              id="tab-btn-recipes"
              onClick={() => setActiveTab('recipes')}
            >
              <GraduationCap className="tab-icon" size={17} color="var(--cyan-accent)" />
              <span>🎓 Teach & Recipes</span>
              <span className="tab-badge">{recipes.length}</span>
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
              id="tab-btn-graph"
              onClick={() => setActiveTab('graph')}
            >
              <Network className="tab-icon" size={17} />
              <span>Link Network Graph</span>
              <span className="tab-badge">{graphNodes.length}</span>
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'pages' ? 'active' : ''}`}
              id="tab-btn-pages"
              onClick={() => setActiveTab('pages')}
            >
              <Grid className="tab-icon" size={17} />
              <span>Crawled Pages</span>
              <span className="tab-badge">{pages.length}</span>
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`}
              id="tab-btn-console"
              onClick={() => setActiveTab('console')}
            >
              <Terminal className="tab-icon" size={17} />
              <span>Brave Console Stream</span>
              <span className="tab-badge">{logs.length}</span>
            </button>

            <button
              type="button"
              className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              id="tab-btn-analytics"
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart2 className="tab-icon" size={17} />
              <span>Analytics & Exporter</span>
            </button>
          </div>

          {/* Active Tab Views */}
          {activeTab === 'loop' && (
            <LoopAutomator
              progress={loopProgress}
              extractedLinks={extractedLinks}
              onStartLoop={handleStartLoop}
              onPauseLoop={handlePauseLoop}
              onResumeLoop={handleResumeLoop}
              onStopLoop={handleStopLoop}
              onClearLinks={handleClearLoopLinks}
            />
          )}

          {activeTab === 'recipes' && (
            <RecipeManager
              recipes={recipes}
              onOpenTeachingStudio={() => setIsTeachingOpen(true)}
              onDeleteRecipe={handleDeleteRecipe}
              onExecuteRecipe={handleExecuteRecipe}
              executionResult={executionResult}
              isExecuting={isExecutingRecipe}
            />
          )}


          {activeTab === 'graph' && (
            <GraphView
              nodes={graphNodes}
              links={graphLinks}
              pages={pages}
              onSelectNode={(url) => setSelectedPageUrl(url)}
            />
          )}

          {activeTab === 'pages' && (
            <PagesExplorer
              pages={pages}
              onSelectPage={(url) => setSelectedPageUrl(url)}
            />
          )}

          {activeTab === 'console' && (
            <ConsoleStream
              logs={logs}
              onClearLogs={() => setLogs([])}
              onSelectPage={(url) => setSelectedPageUrl(url)}
            />
          )}

          {activeTab === 'analytics' && (
            <ExporterAnalytics pages={pages} stats={stats} />
          )}
        </div>
      </main>

      {/* Page Inspector Modal */}
      {selectedPage && (
        <PageDetailModal
          page={selectedPage}
          onClose={() => setSelectedPageUrl(null)}
        />
      )}

      {/* Teaching Studio Demonstration Modal */}
      <TeachingStudioModal
        isOpen={isTeachingOpen}
        onClose={() => setIsTeachingOpen(false)}
        onSaveRecipe={handleSaveRecipe}
        liveActions={liveActions}
        setLiveActions={setLiveActions}
      />
    </div>
  );
};

export default App;

