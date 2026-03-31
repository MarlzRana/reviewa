import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as vscode from 'vscode';
import { CommentStore } from '../../commentStore';
import { createReviewaCommentController } from '../../commentController';
import {
	makeMockThread,
	makeMockComment,
	makeMockExtensionContext,
	resetFactories,
} from './helpers/factories';

// --- Mocks ---

vi.mock('fs', () => ({
	readFileSync: vi.fn(() => 'line0\nconst x = 1;\nline2\n'),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	unlinkSync: vi.fn(),
	existsSync: vi.fn(() => true),
}));

vi.mock('crypto', () => ({
	randomUUID: vi.fn(() => 'generated-uuid-1'),
}));

vi.mock('https', () => ({
	get: vi.fn(),
}));

vi.mock('../../gitUtils', () => ({
	parseGitUri: vi.fn(() => ({ relativePath: 'src/foo.ts' })),
	getGitRepoRoot: vi.fn(async () => '/test/repo'),
}));

// --- Helpers ---

type CommandCallback = (...args: unknown[]) => unknown;

function getCommandHandlers(): Record<string, CommandCallback> {
	const handlers: Record<string, CommandCallback> = {};
	const calls = (vscode.commands.registerCommand as Mock).mock.calls;
	for (const [name, callback] of calls) {
		handlers[name as string] = callback as CommandCallback;
	}
	return handlers;
}

function makeReply(overrides?: {
	text?: string;
	thread?: vscode.CommentThread;
}): vscode.CommentReply {
	const thread = overrides?.thread ?? makeMockThread({
		uri: vscode.Uri.file('/test/repo/src/foo.ts'),
		range: new vscode.Range(9, 0, 9, 0),
		comments: [],
		contextValue: '',
	});
	return {
		text: overrides?.text ?? 'Fix this bug',
		thread,
	};
}

// --- Tests ---

describe('commentController', () => {
	let store: CommentStore;
	let context: vscode.ExtensionContext;
	let handlers: Record<string, CommandCallback>;

	beforeEach(async () => {
		(vscode as any).__resetAllMocks();
		resetFactories();
		vi.clearAllMocks();

		// Authentication mock returns no session (author = 'You')
		(vscode.authentication.getSession as Mock).mockResolvedValue(null);

		store = new CommentStore();
		context = makeMockExtensionContext();
		createReviewaCommentController(context, store);
		handlers = getCommandHandlers();
	});

	describe('command registration', () => {
		it('registers all 7 commands', () => {
			const expectedCommands = [
				'reviewa.createComment',
				'reviewa.deleteThread',
				'reviewa.deleteComment',
				'reviewa.editComment',
				'reviewa.saveComment',
				'reviewa.markRepending',
				'reviewa.markProcessed',
			];
			for (const cmd of expectedCommands) {
				expect(handlers[cmd]).toBeDefined();
			}
		});
	});

	describe('createComment', () => {
		it('creates a new comment on a new thread (file scheme)', async () => {
			const reply = makeReply({ text: 'Fix this bug' });

			await handlers['reviewa.createComment'](reply);

			// Thread should have 1 comment
			expect(reply.thread.comments).toHaveLength(1);
			expect(reply.thread.comments[0].label).toBe('Pending');
			expect(reply.thread.comments[0].mode).toBe(vscode.CommentMode.Preview);

			// Thread contextValue should be set to the UUID
			expect(reply.thread.contextValue).toBe('generated-uuid-1');

			// Should be added to store
			const tracked = store.get('generated-uuid-1');
			expect(tracked).toBeDefined();
			expect(tracked!.data.uuid).toBe('generated-uuid-1');
			expect(tracked!.data.status).toBe('pending');
			expect(tracked!.data.content).toBe('Fix this bug');
			expect(tracked!.data.side).toBe('file');
			expect(tracked!.data.workspace).toBe('/test/repo');
			expect(tracked!.commentTexts).toEqual(['Fix this bug']);
		});

		it('sets thread to Expanded and Unresolved', async () => {
			const reply = makeReply();
			await handlers['reviewa.createComment'](reply);

			expect(reply.thread.collapsibleState).toBe(vscode.CommentThreadCollapsibleState.Expanded);
			expect(reply.thread.state).toBe(vscode.CommentThreadState.Unresolved);
			expect(reply.thread.label).toBe('Pending comments');
		});

		it('appends a reply on an existing thread', async () => {
			// First, create initial comment
			const reply = makeReply({ text: 'First comment' });
			await handlers['reviewa.createComment'](reply);

			const uuid = reply.thread.contextValue!;
			expect(uuid).toBe('generated-uuid-1');

			// Now reply on the same thread
			const reply2: vscode.CommentReply = {
				text: 'Second comment',
				thread: reply.thread,
			};
			await handlers['reviewa.createComment'](reply2);

			expect(reply.thread.comments).toHaveLength(2);
			const tracked = store.get(uuid);
			expect(tracked!.commentTexts).toEqual(['First comment', 'Second comment']);
			expect(tracked!.data.content).toBe('First comment\n\nSecond comment');
		});

		it('returns early for unsupported scheme', async () => {
			const uri = new (vscode.Uri as any)({ scheme: 'untitled', path: '/foo' });
			// Manually construct since Uri constructor is private
			const thread = makeMockThread({ uri: vscode.Uri.parse('untitled:/foo') });
			const reply: vscode.CommentReply = { text: 'test', thread };

			await handlers['reviewa.createComment'](reply);

			// Should not add anything to store
			expect(store.getPendingCount()).toBe(0);
			expect(thread.comments).toEqual([]);
		});

		it('returns early when range is missing', async () => {
			const thread = makeMockThread({
				uri: vscode.Uri.file('/test/repo/src/foo.ts'),
				range: undefined as unknown as vscode.Range,
			});
			const reply: vscode.CommentReply = { text: 'test', thread };

			await handlers['reviewa.createComment'](reply);

			expect(store.getPendingCount()).toBe(0);
		});

		it('uses fsPath as absPath for file scheme', async () => {
			const reply = makeReply();
			await handlers['reviewa.createComment'](reply);

			const tracked = store.get('generated-uuid-1');
			expect(tracked!.data.abs_path).toBe('/test/repo/src/foo.ts');
		});

		it('reply on existing thread only includes actionable texts in content', async () => {
			// Create first comment
			const reply = makeReply({ text: 'Actionable text' });
			await handlers['reviewa.createComment'](reply);

			const uuid = reply.thread.contextValue!;

			// Mark first comment as processed
			const firstComment = reply.thread.comments[0];
			const processedComment = { ...firstComment, label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = [processedComment];

			// Add second comment
			const reply2: vscode.CommentReply = { text: 'New actionable text', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			const tracked = store.get(uuid);
			// Content should only include the new actionable text (2nd comment is Pending)
			// The first comment is Processed so excluded from content
			expect(tracked!.data.content).toBe('New actionable text');
		});
	});

	describe('deleteThread', () => {
		it('deletes file from disk, removes from store, and disposes thread', async () => {
			const reply = makeReply();
			await handlers['reviewa.createComment'](reply);
			const uuid = reply.thread.contextValue!;

			const disposeSpy = vi.fn();
			reply.thread.dispose = disposeSpy;

			handlers['reviewa.deleteThread'](reply.thread);

			expect(store.get(uuid)).toBeUndefined();
			expect(disposeSpy).toHaveBeenCalled();
		});
	});

	describe('deleteComment', () => {
		it('deletes the last comment and removes thread entirely', async () => {
			const reply = makeReply({ text: 'Only comment' });
			await handlers['reviewa.createComment'](reply);

			const disposeSpy = vi.fn();
			reply.thread.dispose = disposeSpy;

			const comment = reply.thread.comments[0];
			handlers['reviewa.deleteComment'](comment);

			expect(disposeSpy).toHaveBeenCalled();
			expect(store.get('generated-uuid-1')).toBeUndefined();
		});

		it('REGRESSION: deleting last pending from mixed thread sets label to "All comments seen"', async () => {
			// Create two comments
			const reply = makeReply({ text: 'First' });
			await handlers['reviewa.createComment'](reply);

			const reply2: vscode.CommentReply = { text: 'Second', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			// Mark first comment as processed
			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			// Delete the second (pending) comment
			const pendingComment = reply.thread.comments[1];
			handlers['reviewa.deleteComment'](pendingComment);

			// Thread should still exist with only the processed comment
			expect(reply.thread.comments).toHaveLength(1);
			expect(reply.thread.label).toBe('All comments seen');
		});

		it('REGRESSION: only actionable texts included in content after deleting processed comment', async () => {
			// Create three comments
			const reply = makeReply({ text: 'Pending 1' });
			await handlers['reviewa.createComment'](reply);

			const reply2: vscode.CommentReply = { text: 'To process', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			const reply3: vscode.CommentReply = { text: 'Pending 2', thread: reply.thread };
			await handlers['reviewa.createComment'](reply3);

			// Mark second comment as processed
			const comments = [...reply.thread.comments];
			comments[1] = { ...comments[1], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			// Delete the processed comment
			const processedComment = reply.thread.comments[1];
			handlers['reviewa.deleteComment'](processedComment);

			const tracked = store.get('generated-uuid-1');
			// Content should only have the two pending texts
			expect(tracked!.data.content).toBe('Pending 1\n\nPending 2');
		});

		it('only processed comments remain after delete -> file deleted from disk', async () => {
			const fs = await import('fs');

			const reply = makeReply({ text: 'Pending text' });
			await handlers['reviewa.createComment'](reply);

			const reply2: vscode.CommentReply = { text: 'Processed text', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			// Mark second comment as processed
			const comments = [...reply.thread.comments];
			comments[1] = { ...comments[1], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			// Clear previous calls to unlinkSync
			(fs.unlinkSync as Mock).mockClear();

			// Delete the pending comment (first one)
			const pendingComment = reply.thread.comments[0];
			handlers['reviewa.deleteComment'](pendingComment);

			// File should have been deleted since only processed remain
			expect(fs.unlinkSync).toHaveBeenCalled();
		});
	});

	describe('editComment', () => {
		it('sets comment mode to Editing', async () => {
			const reply = makeReply({ text: 'Edit me' });
			await handlers['reviewa.createComment'](reply);

			const comment = reply.thread.comments[0];
			handlers['reviewa.editComment'](comment);

			// After edit, the comment should be in editing mode
			const updated = reply.thread.comments[0];
			expect(updated.mode).toBe(vscode.CommentMode.Editing);
		});

		it('extracts body text from MarkdownString', async () => {
			const reply = makeReply({ text: 'Markdown body' });
			await handlers['reviewa.createComment'](reply);

			const comment = reply.thread.comments[0];
			// Comment body is a MarkdownString
			handlers['reviewa.editComment'](comment);

			const updated = reply.thread.comments[0];
			expect(updated.mode).toBe(vscode.CommentMode.Editing);
			// Body should be extracted as string from MarkdownString
			expect(typeof updated.body).toBe('string');
			expect(updated.body).toBe('Markdown body');
		});

		it('extracts body text from plain string', async () => {
			const reply = makeReply({ text: 'Plain body' });
			await handlers['reviewa.createComment'](reply);

			// Manually set body to string for this test
			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], body: 'Plain body' };
			reply.thread.comments = comments;

			const comment = reply.thread.comments[0];
			handlers['reviewa.editComment'](comment);

			const updated = reply.thread.comments[0];
			expect(updated.body).toBe('Plain body');
		});
	});

	describe('saveComment', () => {
		it('updates commentTexts and returns to Preview mode', async () => {
			const reply = makeReply({ text: 'Original' });
			await handlers['reviewa.createComment'](reply);

			// Edit the comment
			const comment = reply.thread.comments[0];
			handlers['reviewa.editComment'](comment);

			// Simulate user changing text by setting body
			const editedComment = { ...reply.thread.comments[0], body: 'Updated text' };
			reply.thread.comments = [editedComment];

			handlers['reviewa.saveComment'](reply.thread.comments[0]);

			const updated = reply.thread.comments[0];
			expect(updated.mode).toBe(vscode.CommentMode.Preview);
			expect((updated.body as vscode.MarkdownString).value).toBe('Updated text');

			const tracked = store.get('generated-uuid-1');
			expect(tracked!.commentTexts[0]).toBe('Updated text');
		});

		it('REGRESSION: saving a processed comment auto-sets label to Re-pending', async () => {
			const reply = makeReply({ text: 'Will be processed' });
			await handlers['reviewa.createComment'](reply);

			// Mark as processed
			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			// Edit and save
			const comment = reply.thread.comments[0];
			const editedComment = { ...comment, body: 'Updated processed text', mode: vscode.CommentMode.Editing };
			reply.thread.comments = [editedComment];

			handlers['reviewa.saveComment'](reply.thread.comments[0]);

			const updated = reply.thread.comments[0];
			expect(updated.label).toBe('Re-pending');
			expect(updated.contextValue).toBe('repending');
			expect(updated.mode).toBe(vscode.CommentMode.Preview);
		});

		it('content only includes actionable texts after save', async () => {
			// Create two comments
			const reply = makeReply({ text: 'Pending text' });
			await handlers['reviewa.createComment'](reply);

			const reply2: vscode.CommentReply = { text: 'Another text', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			// Mark second as processed
			const comments = [...reply.thread.comments];
			comments[1] = { ...comments[1], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			// Edit and save first comment
			const editedComment = { ...reply.thread.comments[0], body: 'Edited pending', mode: vscode.CommentMode.Editing };
			reply.thread.comments = [editedComment, reply.thread.comments[1]];

			handlers['reviewa.saveComment'](reply.thread.comments[0]);

			const tracked = store.get('generated-uuid-1');
			// Only the pending comment's text should be in content
			expect(tracked!.data.content).toBe('Edited pending');
		});
	});

	describe('markRepending', () => {
		it('changes Processed to Re-pending', async () => {
			const reply = makeReply({ text: 'Some comment' });
			await handlers['reviewa.createComment'](reply);

			// Mark as processed first
			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			handlers['reviewa.markRepending'](reply.thread.comments[0]);

			const updated = reply.thread.comments[0];
			expect(updated.label).toBe('Re-pending');
			expect(updated.contextValue).toBe('repending');
		});

		it('sets thread state to Unresolved and label to Pending comments', async () => {
			const reply = makeReply({ text: 'Some comment' });
			await handlers['reviewa.createComment'](reply);

			// Mark processed
			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;
			reply.thread.state = vscode.CommentThreadState.Resolved;

			handlers['reviewa.markRepending'](reply.thread.comments[0]);

			expect(reply.thread.state).toBe(vscode.CommentThreadState.Unresolved);
			expect(reply.thread.label).toBe('Pending comments');
		});

		it('updates store data with pending status', async () => {
			const reply = makeReply({ text: 'Some comment' });
			await handlers['reviewa.createComment'](reply);

			const comments = [...reply.thread.comments];
			comments[0] = { ...comments[0], label: 'Seen', contextValue: 'processed' };
			reply.thread.comments = comments;

			handlers['reviewa.markRepending'](reply.thread.comments[0]);

			const tracked = store.get('generated-uuid-1');
			expect(tracked!.data.status).toBe('pending');
		});
	});

	describe('markProcessed', () => {
		it('changes label to Processed and contextValue to processed', async () => {
			const reply = makeReply({ text: 'Some comment' });
			await handlers['reviewa.createComment'](reply);

			handlers['reviewa.markProcessed'](reply.thread.comments[0]);

			const updated = reply.thread.comments[0];
			expect(updated.label).toBe('Seen');
			expect(updated.contextValue).toBe('processed');
		});

		it('if other actionable comments remain, thread stays pending', async () => {
			const reply = makeReply({ text: 'First' });
			await handlers['reviewa.createComment'](reply);

			const reply2: vscode.CommentReply = { text: 'Second', thread: reply.thread };
			await handlers['reviewa.createComment'](reply2);

			// Mark first as processed
			handlers['reviewa.markProcessed'](reply.thread.comments[0]);

			expect(reply.thread.label).toBe('Pending comments');
			const tracked = store.get('generated-uuid-1');
			expect(tracked!.data.status).toBe('pending');
			// Content should only be second comment
			expect(tracked!.data.content).toBe('Second');
		});

		it('if NO actionable comments remain, deletes file from disk and sets status processed', async () => {
			const fs = await import('fs');

			const reply = makeReply({ text: 'Only comment' });
			await handlers['reviewa.createComment'](reply);

			(fs.unlinkSync as Mock).mockClear();

			handlers['reviewa.markProcessed'](reply.thread.comments[0]);

			expect(reply.thread.label).toBe('All comments seen');
			expect(fs.unlinkSync).toHaveBeenCalled();

			// The tracked data should still exist in store but with processed status
			const tracked = store.get('generated-uuid-1');
			expect(tracked!.data.status).toBe('processed');
		});
	});
});
