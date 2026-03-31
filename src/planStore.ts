import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PLAN_METADATA_DIR, GEMINI_PLAN_METADATA_DIR } from './types';
import { PlanMetadata, readPlanMetadataFile, isRelevantPlanMetadata } from './planUtils';

export type PlanSource = 'claude' | 'gemini';

export interface PlanEntry {
	name: string;
	absPath: string;
	createdAt: string;
	source: PlanSource;
	sessionDetected: boolean;
}

export class PlanStore implements vscode.Disposable {
	private readonly plans = new Map<string, PlanEntry>();
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	add(entry: PlanEntry): void {
		this.plans.set(entry.absPath, entry);
		this._onDidChange.fire();
	}

	getBySource(source: PlanSource): PlanEntry[] {
		return Array.from(this.plans.values())
			.filter(p => p.source === source)
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
			files = fs.readdirSync(metadataDir).filter(f => f.endsWith('.json'));
		} catch {
			return;
		}

		for (const filename of files) {
			const metadata = readPlanMetadataFile(metadataDir, filename);
			if (metadata && isRelevantPlanMetadata(metadata)) {
				this.plans.set(metadata.abs_path, this.toEntry(metadata, source, false));
			}
		}
	}

	toEntry(metadata: PlanMetadata, source: PlanSource, sessionDetected: boolean): PlanEntry {
		return {
			name: path.basename(metadata.abs_path),
			absPath: metadata.abs_path,
			createdAt: metadata.created_at,
			source,
			sessionDetected,
		};
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
