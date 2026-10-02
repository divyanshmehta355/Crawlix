import fs from 'node:fs';
import path from 'node:path';
import type { LearnedRecipe } from './types.js';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const RECIPES_FILE = path.join(DATA_DIR, 'recipes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const DEFAULT_RECIPES: LearnedRecipe[] = [
  {
    id: 'hn-top-stories',
    name: 'Hacker News Top Stories & Scores',
    description: 'Extracts article titles, links, points, and authors from the front page.',
    targetUrl: 'https://news.ycombinator.com',
    domain: 'news.ycombinator.com',
    actions: [
      {
        id: 'act-1',
        type: 'navigate',
        value: 'https://news.ycombinator.com',
        description: 'Navigate to Hacker News',
        timestamp: Date.now(),
      },
      {
        id: 'act-2',
        type: 'wait',
        selector: '.titleline',
        description: 'Wait for story rows to load',
        timestamp: Date.now(),
      },
      {
        id: 'act-3',
        type: 'extract',
        fieldName: 'title',
        selector: '.titleline > a',
        extractType: 'list',
        description: 'Extract list of story headlines',
        timestamp: Date.now(),
      },
      {
        id: 'act-4',
        type: 'extract',
        fieldName: 'score',
        selector: '.score',
        extractType: 'list',
        description: 'Extract story points',
        timestamp: Date.now(),
      },
      {
        id: 'act-5',
        type: 'extract',
        fieldName: 'author',
        selector: '.hnuser',
        extractType: 'list',
        description: 'Extract authors',
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    runCount: 0,
  },
  {
    id: 'example-com-recipe',
    name: 'Example Domain Overview & Link Checker',
    description: 'Demonstrates headline extraction and more info link clicking.',
    targetUrl: 'https://example.com',
    domain: 'example.com',
    actions: [
      {
        id: 'ex-1',
        type: 'navigate',
        value: 'https://example.com',
        description: 'Open Example Domain',
        timestamp: Date.now(),
      },
      {
        id: 'ex-2',
        type: 'extract',
        fieldName: 'headline',
        selector: 'h1',
        extractType: 'text',
        description: 'Extract page heading',
        timestamp: Date.now(),
      },
      {
        id: 'ex-3',
        type: 'extract',
        fieldName: 'description',
        selector: 'p',
        extractType: 'text',
        description: 'Extract paragraph body',
        timestamp: Date.now(),
      },
      {
        id: 'ex-4',
        type: 'click',
        selector: 'a[href]',
        description: 'Click "More information..." link',
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    runCount: 0,
  },
];

export function getRecipes(): LearnedRecipe[] {
  ensureDataDir();
  if (!fs.existsSync(RECIPES_FILE)) {
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(DEFAULT_RECIPES, null, 2), 'utf-8');
    return DEFAULT_RECIPES;
  }
  try {
    const raw = fs.readFileSync(RECIPES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return DEFAULT_RECIPES;
  }
}

export function saveRecipe(recipe: LearnedRecipe): LearnedRecipe {
  ensureDataDir();
  const recipes = getRecipes();
  const index = recipes.findIndex((r) => r.id === recipe.id);
  recipe.updatedAt = Date.now();
  if (index >= 0) {
    recipes[index] = recipe;
  } else {
    recipe.createdAt = Date.now();
    recipe.runCount = 0;
    recipes.unshift(recipe);
  }
  fs.writeFileSync(RECIPES_FILE, JSON.stringify(recipes, null, 2), 'utf-8');
  return recipe;
}

export function deleteRecipe(id: string): boolean {
  ensureDataDir();
  const recipes = getRecipes();
  const filtered = recipes.filter((r) => r.id !== id);
  if (filtered.length !== recipes.length) {
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  }
  return false;
}

export function incrementRunCount(id: string): void {
  ensureDataDir();
  const recipes = getRecipes();
  const found = recipes.find((r) => r.id === id);
  if (found) {
    found.runCount = (found.runCount || 0) + 1;
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(recipes, null, 2), 'utf-8');
  }
}
