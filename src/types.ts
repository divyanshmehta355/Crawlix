export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  delayMs: number;
  headless: boolean;
  sameDomainOnly: boolean;
  customUserAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  bravePath?: string;
}

export interface DiscoveredLink {
  href: string;
  text: string;
  isInternal: boolean;
}

export interface ExtractedImage {
  src: string;
  alt: string;
}

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageData {
  id: string;
  url: string;
  title: string;
  statusCode: number;
  statusText: string;
  depth: number;
  parentUrl?: string;
  metaDescription: string;
  favicon: string;
  canonicalUrl: string;
  openGraph: Record<string, string>;
  headings: PageHeading[];
  contentPreview: string;
  markdownContent?: string;
  internalLinksCount: number;
  externalLinksCount: number;
  links: DiscoveredLink[];
  images: ExtractedImage[];
  screenshot?: string;
  loadTimeMs: number;
  timestamp: number;
  errorMessage?: string;
}

export interface CrawlStats {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';
  pagesCrawled: number;
  pagesQueued: number;
  pagesFailed: number;
  avgLatencyMs: number;
  startTime?: number;
  endTime?: number;
  elapsedMs: number;
  activeWorkers: number;
  totalLinksFound: number;
  totalImagesFound: number;
  currentUrl?: string;
}

export interface GraphNode {
  id: string;
  url: string;
  title: string;
  statusCode: number;
  depth: number;
  linksCount: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface CrawlLog {
  id: string;
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  url?: string;
}

export type ActionType = 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'extract' | 'hover' | 'pagination';

export interface LearnedAction {
  id: string;
  type: ActionType;
  selector?: string;
  value?: string;
  fieldName?: string;
  extractType?: 'text' | 'attribute' | 'list' | 'html';
  attrName?: string;
  description?: string;
  timestamp: number;
}

export interface LearnedRecipe {
  id: string;
  name: string;
  description: string;
  targetUrl: string;
  domain: string;
  actions: LearnedAction[];
  createdAt: number;
  updatedAt: number;
  runCount: number;
}

export interface TeachingSessionState {
  isActive: boolean;
  sessionUrl: string;
  recordedActions: LearnedAction[];
}

export interface RecipeExecutionResult {
  recipeId: string;
  recipeName: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  extractedRecords: Record<string, any>[];
  stepsCompleted: number;
  totalSteps: number;
  error?: string;
  durationMs: number;
  logs: CrawlLog[];
}

export interface LoopCrawlConfig {
  id?: string;
  name?: string;
  catalogUrl: string;
  cardSelector: string;
  titleSelector?: string;
  qualityPriority: string[];
  generateButtonSelector?: string;
  serverPriority: string[];
  maxItems?: number;
  delayMs?: number;
  headless: boolean;
  enablePagination?: boolean;
  startPage?: number;
  endPage?: number;
}

export interface ExtractedDownloadLink {
  id: string;
  index: number;
  movieTitle: string;
  qualitySelected: string;
  serverName: string;
  downloadLink: string;
  cardUrl: string;
  status: 'success' | 'warning' | 'failed';
  timestamp: number;
  errorMessage?: string;
}

export interface LoopCrawlProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';
  currentPage?: number;
  totalCatalogPages?: number;
  currentIndex: number;
  totalItems: number;
  currentMovieTitle: string;
  currentStep: string;
  extractedCount: number;
  failedCount: number;
  elapsedMs: number;
}


