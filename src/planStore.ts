import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PLAN_METADATA_DIR, GEMINI_PLAN_METADATA_DIR } from './types';
import {
  PlanMetadata,
  readPlanMetadataFile,
  isRelevantPlanMetadata,
  extractPlanTitle,
} from './planUtils';

export type PlanSource = 'claude' | 'gemini';

export interface PlanEntry {
  name: string;
  absPath: string;
  metadataPath: string;
  createdAt: string;
  source: PlanSource;
  sessionDetected: boolean;
}

export class PlanStore implements vscode.Disposable {
  private readonly plans = new Map<string, PlanEntry>();
  private readonly planFileWatchers = new Map<string, fs.FSWatcher>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  add(entry: PlanEntry): void {
    this.plans.set(entry.absPath, entry);
    this.startPlanFileWatcher(entry);
    this._onDidChange.fire();
  }

  remove(metadataPath: string): void {
    for (const [absPath, entry] of this.plans) {
      if (entry.metadataPath === metadataPath) {
        this.plans.delete(absPath);
        const watcher = this.planFileWatchers.get(absPath);
        if (watcher) {
          watcher.close();
          this.planFileWatchers.delete(absPath);
        }
        this._onDidChange.fire();
        return;
      }
    }
  }

  private startPlanFileWatcher(entry: PlanEntry): void {
    const existing = this.planFileWatchers.get(entry.absPath);
    if (existing) {
      existing.close();
      this.planFileWatchers.delete(entry.absPath);
    }

    try {
      // fs.watch emits 'rename' for creation, deletion, and renames — check existsSync to confirm deletion
      const watcher = fs.watch(entry.absPath, (eventType) => {
        if (eventType === 'rename' && !fs.existsSync(entry.absPath)) {
          try {
            fs.unlinkSync(entry.metadataPath);
          } catch {
            /* already gone */
          }
          watcher.close();
          this.planFileWatchers.delete(entry.absPath);
        }
      });
      this.planFileWatchers.set(entry.absPath, watcher);
    } catch {
      // Plan file doesn't exist or can't be watched
    }
  }

  getBySource(source: PlanSource): PlanEntry[] {
    return Array.from(this.plans.values())
      .filter((p) => p.source === source)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  scanExisting(): void {
    this.scanDirectory(PLAN_METADATA_DIR, 'claude');
    this.scanDirectory(GEMINI_PLAN_METADATA_DIR, 'gemini');
    this._onDidChange.fire();
  }

  private scanDirectory(metadataDir: string, source: PlanSource): void {
    let files: string[];
    try {
      files = fs.readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
    } catch {
      return;
    }

    for (const filename of files) {
      const metadata = readPlanMetadataFile(metadataDir, filename);
      if (metadata && isRelevantPlanMetadata(metadata)) {
        // Delete plan metadata for deleted plans
        if (!fs.existsSync(metadata.abs_path)) {
          try {
            fs.unlinkSync(path.join(metadataDir, filename));
          } catch {
            /* ignore */
          }
          continue;
        }
        const metadataPath = path.join(metadataDir, filename);
        const entry = this.toEntry(metadata, source, false, metadataPath);
        this.plans.set(metadata.abs_path, entry);
        this.startPlanFileWatcher(entry);
      }
    }
  }

  toEntry(
    metadata: PlanMetadata,
    source: PlanSource,
    sessionDetected: boolean,
    metadataPath: string,
  ): PlanEntry {
    return {
      name: extractPlanTitle(metadata.abs_path),
      absPath: metadata.abs_path,
      metadataPath,
      createdAt: metadata.created_at,
      source,
      sessionDetected,
    };
  }

  dispose(): void {
    for (const watcher of this.planFileWatchers.values()) {
      watcher.close();
    }
    this.planFileWatchers.clear();
    this._onDidChange.dispose();
  }
}
