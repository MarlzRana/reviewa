import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface PlanMetadata {
	cwd: string;
	abs_path: string;
	created_at: string;
}

export function readPlanMetadataFile(metadataDir: string, filename: string): PlanMetadata | null {
	try {
		const metaPath = path.join(metadataDir, filename);
		return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
	} catch {
		return null;
	}
}

export function extractPlanTitle(absPath: string): string {
	try {
		const content = fs.readFileSync(absPath, 'utf-8');
		const newlineIndex = content.indexOf('\n');
		const firstLine = (newlineIndex === -1 ? content : content.slice(0, newlineIndex)).trim();
		const planMatch = firstLine.match(/^#\s+Plan:\s+(.+)$/);
		if (planMatch) {
			return planMatch[1].trim();
		}
		const headingMatch = firstLine.match(/^#\s*(.+)$/);
		if (headingMatch) {
			return headingMatch[1].trim();
		}
	} catch {
		// File missing or unreadable
	}
	return path.basename(absPath);
}

export function isRelevantPlanMetadata(metadata: { cwd?: string }): boolean {
	if (!metadata.cwd) {
		return false;
	}

	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (!workspaceFolder) {
		return false;
	}

	const normalizedCwd = metadata.cwd.endsWith('/') ? metadata.cwd : metadata.cwd + '/';
	const normalizedWorkspace = workspaceFolder.endsWith('/') ? workspaceFolder : workspaceFolder + '/';
	return normalizedCwd.startsWith(normalizedWorkspace);
}
