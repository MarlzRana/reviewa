import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { __resetAllMocks, __setConfigValues, CommentThreadState, CommentThreadCollapsibleState } from './mocks/vscode';
import { makeReviewaComment, makeMockComment, makeMockThread, makeMockExtensionContext, resetFactories } from './helpers/factories';

// Mock fs module — capture the watch callback
let watchCallback: ((eventType: string, filename: string | null) => void) | undefined;
let watchShouldThrow = false;
const mockClose = vi.fn();

vi.mock('fs', () => ({
	watch: vi.fn((_dir: string, cb: (eventType: string, filename: string | null) => void) => {
		if (watchShouldThrow) {
			throw new Error('ENOENT: no such file or directory');
		}
		watchCallback = cb;
		return { close: mockClose };
	}),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

import * as fs from 'fs';
import { createFileWatcher } from '../../fileWatcher';
import { CommentStore } from '../../commentStore';

describe('createFileWatcher', () => {
	let store: CommentStore;
	let context: vscode.ExtensionContext;

	beforeEach(() => {
		watchCallback = undefined;
		watchShouldThrow = false;
		store = new CommentStore();
		context = makeMockExtensionContext();
		resetFactories();
	});

	afterEach(() => {
		__resetAllMocks();
		mockClose.mockClear();
	});

	function triggerWatch(eventType: string, filename: string | null) {
		expect(watchCallback).toBeDefined();
		watchCallback!(eventType, filename);
	}

	// Scenario 1: Hook consumption marks all comments as Processed
	it('marks all thread comments as Processed when a .json file is deleted', () => {
		createFileWatcher(context, store);

		const comment1 = makeMockComment({ label: 'Pending', contextValue: 'pending' });
		const comment2 = makeMockComment({ label: 'Pending', contextValue: 'pending' });
		const thread = makeMockThread({ comments: [comment1, comment2] });
		const data = makeReviewaComment({ uuid: 'abc-123', status: 'pending' });

		store.add('abc-123', data, thread, ['Fix this']);

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.comments).toHaveLength(2);
		for (const c of thread.comments) {
			expect(c.label).toBe('Processed');
			expect(c.contextValue).toBe('processed');
		}
	});

	// Scenario 2: Non-JSON files ignored
	it('ignores non-JSON files', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({ comments: [makeMockComment()] });
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		triggerWatch('rename', 'abc-123.txt');

		expect(thread.comments[0].label).toBe('Pending');
	});

	// Scenario 3: Non-rename events ignored
	it('ignores non-rename events', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({ comments: [makeMockComment()] });
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		triggerWatch('change', 'abc-123.json');

		expect(thread.comments[0].label).toBe('Pending');
	});

	// Scenario 4: File still exists (creation, not deletion)
	it('does not process when file still exists (creation event)', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({ comments: [makeMockComment()] });
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		vi.mocked(fs.existsSync).mockReturnValueOnce(true);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.comments[0].label).toBe('Pending');
	});

	// Scenario 5: Suppression
	it('does not process when deletion is suppressed by the UI', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({ comments: [makeMockComment()] });
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);
		store.suppressWatcher('abc-123');

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.comments[0].label).toBe('Pending');
	});

	// Scenario 6: Unknown UUID
	it('does not error when UUID is not in store', () => {
		createFileWatcher(context, store);

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);

		expect(() => triggerWatch('rename', 'unknown-uuid.json')).not.toThrow();
	});

	// Scenario 7: autoCollapseOnCodingAgentConsumption = true
	it('collapses and resolves thread when autoCollapseOnCodingAgentConsumption is true', () => {
		__setConfigValues({ 'reviewa.autoCollapseOnCodingAgentConsumption': true });
		createFileWatcher(context, store);

		const thread = makeMockThread({
			comments: [makeMockComment()],
			state: CommentThreadState.Unresolved,
			collapsibleState: CommentThreadCollapsibleState.Expanded,
		});
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.state).toBe(CommentThreadState.Resolved);
		expect(thread.collapsibleState).toBe(CommentThreadCollapsibleState.Collapsed);
	});

	// Scenario 8: autoCollapseOnCodingAgentConsumption = false (default)
	it('does not change thread state when autoCollapseOnCodingAgentConsumption is false', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({
			comments: [makeMockComment()],
			state: CommentThreadState.Unresolved,
			collapsibleState: CommentThreadCollapsibleState.Expanded,
		});
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.state).toBe(CommentThreadState.Unresolved);
		expect(thread.collapsibleState).toBe(CommentThreadCollapsibleState.Expanded);
	});

	// Scenario 9: Thread label always "All comments processed"
	it('sets thread label to "All comments processed" after processing', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({
			comments: [makeMockComment(), makeMockComment()],
			label: 'Pending comments',
		});
		const data = makeReviewaComment({ uuid: 'abc-123' });
		store.add('abc-123', data, thread, ['Fix this']);

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		expect(thread.label).toBe('All comments processed');
	});

	// Scenario 10: Status update and notifyPendingCountChanged
	it('updates tracked data status to processed and fires pending count change', () => {
		createFileWatcher(context, store);

		const thread = makeMockThread({ comments: [makeMockComment()] });
		const data = makeReviewaComment({ uuid: 'abc-123', status: 'pending' });
		store.add('abc-123', data, thread, ['Fix this']);

		const notifySpy = vi.spyOn(store, 'notifyPendingCountChanged');

		vi.mocked(fs.existsSync).mockReturnValueOnce(false);
		triggerWatch('rename', 'abc-123.json');

		const tracked = store.get('abc-123');
		expect(tracked!.data.status).toBe('processed');
		expect(notifySpy).toHaveBeenCalledOnce();
	});

	// Scenario 11: Directory doesn't exist
	it('handles fs.watch throwing gracefully when directory does not exist', () => {
		watchShouldThrow = true;

		expect(() => createFileWatcher(context, store)).not.toThrow();
		// No subscription should be pushed since watcher failed
		expect((context.subscriptions as unknown[]).length).toBe(0);
	});

	// Scenario 12: Dispose calls watcher.close()
	it('pushes a disposable that calls watcher.close()', () => {
		createFileWatcher(context, store);

		const subscriptions = context.subscriptions as Array<{ dispose: () => void }>;
		expect(subscriptions).toHaveLength(1);

		subscriptions[0].dispose();
		expect(mockClose).toHaveBeenCalledOnce();
	});

	// Edge case: null filename
	it('ignores events with null filename', () => {
		createFileWatcher(context, store);

		expect(() => triggerWatch('rename', null)).not.toThrow();
	});
});
