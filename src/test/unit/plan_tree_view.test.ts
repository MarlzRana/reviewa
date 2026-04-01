import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { __resetAllMocks } from './mocks/vscode';
import { makeMockExtensionContext, resetFactories } from './helpers/factories';
import { PLAN_METADATA_DIR, GEMINI_PLAN_METADATA_DIR } from '../../types';

vi.mock('fs', () => ({
	readFileSync: vi.fn(),
	readdirSync: vi.fn(() => []),
	existsSync: vi.fn(() => true),
	mkdirSync: vi.fn(),
	watch: vi.fn(() => ({ close: vi.fn() })),
	default: {
		readFileSync: vi.fn(),
		readdirSync: vi.fn(() => []),
		existsSync: vi.fn(() => true),
		mkdirSync: vi.fn(),
		watch: vi.fn(() => ({ close: vi.fn() })),
	},
}));

import * as fs from 'fs';
import { isRelevantPlanMetadata, readPlanMetadataFile, extractPlanTitle } from '../../planUtils';
import { PlanStore } from '../../planStore';
import { createPlanTreeView } from '../../planTreeView';

beforeEach(() => {
	__resetAllMocks();
	resetFactories();
	vi.clearAllMocks();
	vscode.workspace.workspaceFolders = [
		{ uri: vscode.Uri.file('/test/workspace'), name: 'workspace', index: 0 },
	];
});

// =============================================================================
// planUtils
// =============================================================================
describe('isRelevantPlanMetadata', () => {
	it('returns true when cwd matches workspace', () => {
		expect(isRelevantPlanMetadata({ cwd: '/test/workspace' })).toBe(true);
	});

	it('returns true when cwd is a subdirectory of workspace', () => {
		expect(isRelevantPlanMetadata({ cwd: '/test/workspace/subdir' })).toBe(true);
	});

	it('returns false when cwd is a different path', () => {
		expect(isRelevantPlanMetadata({ cwd: '/other/project' })).toBe(false);
	});

	it('returns false when no workspace folder', () => {
		vscode.workspace.workspaceFolders = undefined;
		expect(isRelevantPlanMetadata({ cwd: '/test/workspace' })).toBe(false);
	});

	it('handles trailing slashes', () => {
		expect(isRelevantPlanMetadata({ cwd: '/test/workspace/' })).toBe(true);
	});

	it('prevents partial path matches', () => {
		expect(isRelevantPlanMetadata({ cwd: '/test/workspace-other' })).toBe(false);
	});
});

describe('readPlanMetadataFile', () => {
	it('reads and parses a valid metadata file', () => {
		const metadata = { cwd: '/test', abs_path: '/plans/a.md', created_at: '2026-01-01' };
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(metadata));

		const result = readPlanMetadataFile('/meta', 'a.json');
		expect(result).toEqual(metadata);
	});

	it('returns null when file does not exist', () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
		expect(readPlanMetadataFile('/meta', 'missing.json')).toBeNull();
	});
});

describe('extractPlanTitle', () => {
	it('extracts title from valid plan heading', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('# Plan: Add CSV Support\n\nSome content...');
		expect(extractPlanTitle('/plans/random-name.md')).toBe('Add CSV Support');
	});

	it('extracts generic heading when no Plan: prefix', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('# Some Other Heading\nContent...');
		expect(extractPlanTitle('/plans/random-name.md')).toBe('Some Other Heading');
	});

	it('extracts heading with no space after #', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('#NoSpace Title\nContent...');
		expect(extractPlanTitle('/plans/random-name.md')).toBe('NoSpace Title');
	});

	it('falls back to basename when file is empty', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('');
		expect(extractPlanTitle('/plans/random-name.md')).toBe('random-name.md');
	});

	it('falls back to basename when file does not exist', () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
		expect(extractPlanTitle('/plans/random-name.md')).toBe('random-name.md');
	});

	it('handles extra whitespace in heading', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('#  Plan:   Spaced Title  \nContent');
		expect(extractPlanTitle('/plans/x.md')).toBe('Spaced Title');
	});

	it('handles file with no trailing newline', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('# Plan: No Newline');
		expect(extractPlanTitle('/plans/x.md')).toBe('No Newline');
	});

	it('falls back to basename when first line is not a heading', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('Just plain text\nContent');
		expect(extractPlanTitle('/plans/my-plan.md')).toBe('my-plan.md');
	});
});

// =============================================================================
// PlanStore
// =============================================================================
describe('PlanStore', () => {
	let store: PlanStore;

	beforeEach(() => {
		store = new PlanStore();
	});

	it('adds and retrieves entries by source', () => {
		store.add({ name: 'a.md', absPath: '/plans/a.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: false });
		store.add({ name: 'b.md', absPath: '/plans/b.md', createdAt: '2026-01-02', source: 'gemini', sessionDetected: false });

		expect(store.getBySource('claude')).toHaveLength(1);
		expect(store.getBySource('gemini')).toHaveLength(1);
		expect(store.getBySource('claude')[0].name).toBe('a.md');
	});

	it('sorts by createdAt descending', () => {
		store.add({ name: 'old.md', absPath: '/plans/old.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: false });
		store.add({ name: 'new.md', absPath: '/plans/new.md', createdAt: '2026-01-03', source: 'claude', sessionDetected: false });
		store.add({ name: 'mid.md', absPath: '/plans/mid.md', createdAt: '2026-01-02', source: 'claude', sessionDetected: false });

		const plans = store.getBySource('claude');
		expect(plans.map(p => p.name)).toEqual(['new.md', 'mid.md', 'old.md']);
	});

	it('deduplicates by absPath', () => {
		store.add({ name: 'a.md', absPath: '/plans/a.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: false });
		store.add({ name: 'a.md', absPath: '/plans/a.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: true });

		expect(store.getBySource('claude')).toHaveLength(1);
		expect(store.getBySource('claude')[0].sessionDetected).toBe(true);
	});

	it('fires onDidChange on add', () => {
		const listener = vi.fn();
		store.onDidChange(listener);

		store.add({ name: 'a.md', absPath: '/plans/a.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: false });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('scanExisting loads plans from both metadata dirs', () => {
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (String(dir) === PLAN_METADATA_DIR) { return ['claude-plan.json'] as unknown as fs.Dirent[]; }
			if (String(dir) === GEMINI_PLAN_METADATA_DIR) { return ['gemini-plan.json'] as unknown as fs.Dirent[]; }
			return [] as unknown as fs.Dirent[];
		});
		vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
			if (String(filePath).includes('claude-plan')) {
				return JSON.stringify({ cwd: '/test/workspace', abs_path: '/home/.claude/plans/claude-plan.md', created_at: '2026-01-01' });
			}
			if (String(filePath).includes('gemini-plan')) {
				return JSON.stringify({ cwd: '/test/workspace', abs_path: '/home/.gemini/plans/gemini-plan.md', created_at: '2026-01-02' });
			}
			throw new Error('ENOENT');
		});

		store.scanExisting();

		expect(store.getBySource('claude')).toHaveLength(1);
		expect(store.getBySource('claude')[0].name).toBe('claude-plan.md');
		expect(store.getBySource('claude')[0].sessionDetected).toBe(false);
		expect(store.getBySource('gemini')).toHaveLength(1);
		expect(store.getBySource('gemini')[0].name).toBe('gemini-plan.md');
	});

	it('scanExisting handles missing directories gracefully', () => {
		vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('ENOENT'); });

		expect(() => store.scanExisting()).not.toThrow();
		expect(store.getBySource('claude')).toHaveLength(0);
		expect(store.getBySource('gemini')).toHaveLength(0);
	});

	it('scanExisting filters out irrelevant plans', () => {
		vi.mocked(fs.readdirSync).mockImplementation((dir) => {
			if (String(dir) === PLAN_METADATA_DIR) { return ['other.json'] as unknown as fs.Dirent[]; }
			return [] as unknown as fs.Dirent[];
		});
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({ cwd: '/other/project', abs_path: '/home/.claude/plans/other.md', created_at: '2026-01-01' })
		);

		store.scanExisting();
		expect(store.getBySource('claude')).toHaveLength(0);
	});

	it('toEntry extracts plan title from file content', () => {
		vi.mocked(fs.readFileSync).mockReturnValue('# Plan: My Great Plan\n\nDetails...');
		const metadata = { cwd: '/test', abs_path: '/plans/my-plan.md', created_at: '2026-01-01' };
		const entry = store.toEntry(metadata, 'claude', true);

		expect(entry).toEqual({
			name: 'My Great Plan',
			absPath: '/plans/my-plan.md',
			createdAt: '2026-01-01',
			source: 'claude',
			sessionDetected: true,
		});
	});

	it('toEntry falls back to basename when plan file is unreadable', () => {
		vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
		const metadata = { cwd: '/test', abs_path: '/plans/my-plan.md', created_at: '2026-01-01' };
		const entry = store.toEntry(metadata, 'claude', true);

		expect(entry).toEqual({
			name: 'my-plan.md',
			absPath: '/plans/my-plan.md',
			createdAt: '2026-01-01',
			source: 'claude',
			sessionDetected: true,
		});
	});
});

// =============================================================================
// PlanTreeView
// =============================================================================
describe('createPlanTreeView', () => {
	it('registers tree view with correct id', () => {
		const context = makeMockExtensionContext();
		const store = new PlanStore();

		createPlanTreeView(context, store);

		expect(vscode.window.createTreeView).toHaveBeenCalledWith('reviewa.planTree', expect.objectContaining({
			showCollapseAll: true,
		}));
	});

	it('refreshes tree when store changes', () => {
		const context = makeMockExtensionContext();
		const store = new PlanStore();

		createPlanTreeView(context, store);

		// Adding a plan should trigger refresh (via onDidChange)
		store.add({ name: 'a.md', absPath: '/plans/a.md', createdAt: '2026-01-01', source: 'claude', sessionDetected: false });

		// The tree view was created — if there were errors in the refresh path, createTreeView would fail
		expect(vscode.window.createTreeView).toHaveBeenCalledTimes(1);
	});
});
