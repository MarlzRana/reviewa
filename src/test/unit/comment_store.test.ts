import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { makeReviewaComment, makeMockThread, makeMockComment, resetFactories } from './helpers/factories';

vi.mock('fs', () => ({
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
}));

import * as fs from 'fs';
import { CommentStore } from '../../commentStore';
import { COMMENTS_DIR } from '../../types';

beforeEach(() => {
	resetFactories();
	vi.clearAllMocks();
});

describe('CommentStore', () => {
	// --- CRUD ---

	describe('add / get / getAll', () => {
		it('adds and retrieves a tracked comment by uuid', () => {
			const store = new CommentStore();
			const data = makeReviewaComment();
			const thread = makeMockThread();
			store.add(data.uuid, data, thread, ['Fix this']);

			const tracked = store.get(data.uuid);
			expect(tracked).toBeDefined();
			expect(tracked!.data).toBe(data);
			expect(tracked!.thread).toBe(thread);
			expect(tracked!.commentTexts).toEqual(['Fix this']);
		});

		it('returns undefined for unknown uuid', () => {
			const store = new CommentStore();
			expect(store.get('nonexistent')).toBeUndefined();
		});

		it('getAll returns all tracked comments', () => {
			const store = new CommentStore();
			const d1 = makeReviewaComment();
			const d2 = makeReviewaComment();
			store.add(d1.uuid, d1, makeMockThread(), ['a']);
			store.add(d2.uuid, d2, makeMockThread(), ['b']);

			const all = store.getAll();
			expect(all).toHaveLength(2);
		});
	});

	describe('update', () => {
		it('replaces the data on an existing tracked comment', () => {
			const store = new CommentStore();
			const data = makeReviewaComment({ status: 'pending' });
			store.add(data.uuid, data, makeMockThread(), ['t']);

			const updated = makeReviewaComment({ uuid: data.uuid, status: 'processed' });
			store.update(data.uuid, updated);

			expect(store.get(data.uuid)!.data.status).toBe('processed');
		});

		it('is a no-op for unknown uuid', () => {
			const store = new CommentStore();
			// Should not throw
			store.update('missing', makeReviewaComment());
		});
	});

	describe('delete', () => {
		it('removes a tracked comment from the store', () => {
			const store = new CommentStore();
			const data = makeReviewaComment();
			store.add(data.uuid, data, makeMockThread(), ['t']);
			store.delete(data.uuid);
			expect(store.get(data.uuid)).toBeUndefined();
			expect(store.getAll()).toHaveLength(0);
		});
	});

	// --- findByThread ---

	describe('findByThread', () => {
		it('finds a tracked comment by thread reference equality', () => {
			const store = new CommentStore();
			const thread = makeMockThread();
			const data = makeReviewaComment();
			store.add(data.uuid, data, thread, ['t']);

			const result = store.findByThread(thread);
			expect(result).toBeDefined();
			expect(result![0]).toBe(data.uuid);
			expect(result![1].thread).toBe(thread);
		});

		it('returns undefined for unknown thread', () => {
			const store = new CommentStore();
			store.add('u1', makeReviewaComment(), makeMockThread(), ['t']);
			expect(store.findByThread(makeMockThread())).toBeUndefined();
		});
	});

	// --- findByComment ---

	describe('findByComment', () => {
		it('finds a tracked comment by comment reference and returns the index', () => {
			const store = new CommentStore();
			const c0 = makeMockComment({ body: new vscode.MarkdownString('first') });
			const c1 = makeMockComment({ body: new vscode.MarkdownString('second') });
			const thread = makeMockThread({ comments: [c0, c1] });
			const data = makeReviewaComment();
			store.add(data.uuid, data, thread, ['first', 'second']);

			const result = store.findByComment(c1);
			expect(result).toBeDefined();
			expect(result![0]).toBe(data.uuid);
			expect(result![2]).toBe(1); // index
		});

		it('returns undefined for unknown comment', () => {
			const store = new CommentStore();
			const c0 = makeMockComment();
			const thread = makeMockThread({ comments: [c0] });
			store.add('u1', makeReviewaComment(), thread, ['t']);

			const stranger = makeMockComment();
			expect(store.findByComment(stranger)).toBeUndefined();
		});
	});

	// --- getPendingCount / getProcessedCount ---

	describe('getPendingCount / getProcessedCount', () => {
		it('counts pending and processed comments correctly', () => {
			const store = new CommentStore();
			store.add('a', makeReviewaComment({ uuid: 'a', status: 'pending' }), makeMockThread(), ['t']);
			store.add('b', makeReviewaComment({ uuid: 'b', status: 'processed' }), makeMockThread(), ['t']);
			store.add('c', makeReviewaComment({ uuid: 'c', status: 'pending' }), makeMockThread(), ['t']);

			expect(store.getPendingCount()).toBe(2);
			expect(store.getProcessedCount()).toBe(1);
		});

		it('returns 0 for an empty store', () => {
			const store = new CommentStore();
			expect(store.getPendingCount()).toBe(0);
			expect(store.getProcessedCount()).toBe(0);
		});
	});

	// --- Static: ensureDirectoryExists ---

	describe('ensureDirectoryExists', () => {
		it('calls mkdirSync with recursive: true on COMMENTS_DIR', () => {
			CommentStore.ensureDirectoryExists();
			expect(fs.mkdirSync).toHaveBeenCalledWith(COMMENTS_DIR, { recursive: true });
		});
	});

	// --- Static: saveComment ---

	describe('saveComment', () => {
		it('writes JSON to the correct file path', () => {
			const comment = makeReviewaComment({ uuid: 'save-test' });
			CommentStore.saveComment(comment);

			const expectedPath = `${COMMENTS_DIR}/save-test.json`;
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expectedPath,
				JSON.stringify(comment, null, 2),
			);
		});
	});

	// --- deleteFile ---

	describe('deleteFile', () => {
		it('calls unlinkSync on the correct file path and adds uuid to suppressedDeletions', () => {
			const store = new CommentStore();
			store.deleteFile('del-uuid');

			expect(fs.unlinkSync).toHaveBeenCalledWith(`${COMMENTS_DIR}/del-uuid.json`);
			// The uuid should be suppressed
			expect(store.consumeSuppression('del-uuid')).toBe(true);
		});

		it('handles already-deleted file gracefully', () => {
			vi.mocked(fs.unlinkSync).mockImplementationOnce(() => {
				throw new Error('ENOENT');
			});

			const store = new CommentStore();
			// Should not throw
			expect(() => store.deleteFile('gone-uuid')).not.toThrow();
		});
	});

	// --- Suppression mechanism ---

	describe('suppressWatcher / consumeSuppression', () => {
		it('consumeSuppression returns true once for a suppressed uuid, then false', () => {
			const store = new CommentStore();
			store.suppressWatcher('supp-uuid');

			expect(store.consumeSuppression('supp-uuid')).toBe(true);
			expect(store.consumeSuppression('supp-uuid')).toBe(false);
		});

		it('consumeSuppression returns false for unsuppressed uuid', () => {
			const store = new CommentStore();
			expect(store.consumeSuppression('nope')).toBe(false);
		});
	});

	// --- deleteAllPendingFiles ---

	describe('deleteAllPendingFiles', () => {
		it('unlinks all files, disposes threads, and clears the store', () => {
			const store = new CommentStore();
			const dispose1 = vi.fn();
			const dispose2 = vi.fn();
			const d1 = makeReviewaComment({ uuid: 'p1' });
			const d2 = makeReviewaComment({ uuid: 'p2' });
			store.add('p1', d1, makeMockThread({ dispose: dispose1 }), ['t']);
			store.add('p2', d2, makeMockThread({ dispose: dispose2 }), ['t']);

			store.deleteAllPendingFiles();

			expect(fs.unlinkSync).toHaveBeenCalledWith(`${COMMENTS_DIR}/p1.json`);
			expect(fs.unlinkSync).toHaveBeenCalledWith(`${COMMENTS_DIR}/p2.json`);
			expect(dispose1).toHaveBeenCalled();
			expect(dispose2).toHaveBeenCalled();
			expect(store.getAll()).toHaveLength(0);
		});

		it('handles unlink errors gracefully', () => {
			vi.mocked(fs.unlinkSync).mockImplementation(() => {
				throw new Error('ENOENT');
			});

			const store = new CommentStore();
			store.add('x', makeReviewaComment({ uuid: 'x' }), makeMockThread(), ['t']);
			expect(() => store.deleteAllPendingFiles()).not.toThrow();
		});
	});

	// --- Event emitter ---

	describe('onDidChangePendingCount', () => {
		it('fires on add', () => {
			const store = new CommentStore();
			const listener = vi.fn();
			store.onDidChangePendingCount(listener);

			store.add('e1', makeReviewaComment({ uuid: 'e1' }), makeMockThread(), ['t']);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('fires on update', () => {
			const store = new CommentStore();
			const data = makeReviewaComment();
			store.add(data.uuid, data, makeMockThread(), ['t']);

			const listener = vi.fn();
			store.onDidChangePendingCount(listener);

			store.update(data.uuid, makeReviewaComment({ uuid: data.uuid, status: 'processed' }));
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('fires on delete', () => {
			const store = new CommentStore();
			const data = makeReviewaComment();
			store.add(data.uuid, data, makeMockThread(), ['t']);

			const listener = vi.fn();
			store.onDidChangePendingCount(listener);

			store.delete(data.uuid);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('fires on notifyPendingCountChanged', () => {
			const store = new CommentStore();
			const listener = vi.fn();
			store.onDidChangePendingCount(listener);

			store.notifyPendingCountChanged();
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('does not fire update event for unknown uuid', () => {
			const store = new CommentStore();
			const listener = vi.fn();
			store.onDidChangePendingCount(listener);

			store.update('missing', makeReviewaComment());
			expect(listener).not.toHaveBeenCalled();
		});
	});
});
