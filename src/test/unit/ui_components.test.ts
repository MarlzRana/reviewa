import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { __resetAllMocks } from './mocks/vscode';
import { CommentStore, TrackedComment } from '../../commentStore';
import { makeReviewaComment, makeMockThread, makeMockComment, makeMockExtensionContext, resetFactories } from './helpers/factories';

// We need to import the modules under test
import { createCommentTreeView } from '../../commentTreeView';
import { createStatusBarItem } from '../../statusBar';

// Helper to extract the tree data provider from the mock createTreeView call
function getTreeDataProvider(): vscode.TreeDataProvider<any> {
	const call = (vscode.window.createTreeView as ReturnType<typeof vi.fn>).mock.calls[0];
	return call[1].treeDataProvider;
}

function makeTrackedComment(overrides?: {
	data?: Partial<Parameters<typeof makeReviewaComment>[0]>;
	commentTexts?: string[];
	threadComments?: vscode.Comment[];
}): TrackedComment {
	const data = makeReviewaComment(overrides?.data);
	const comments = overrides?.threadComments ?? [makeMockComment()];
	const thread = makeMockThread({
		uri: vscode.Uri.file(data.abs_path),
		range: new vscode.Range(data.line_number - 1, 0, data.line_number - 1, 0),
		comments,
	});
	return {
		data,
		thread,
		commentTexts: overrides?.commentTexts ?? [data.content],
	};
}

describe('commentTreeView', () => {
	let store: CommentStore;
	let context: vscode.ExtensionContext;
	let provider: vscode.TreeDataProvider<any>;

	beforeEach(() => {
		__resetAllMocks();
		resetFactories();
		store = new CommentStore();
		context = makeMockExtensionContext();
		createCommentTreeView(context, store);
		provider = getTreeDataProvider();
	});

	describe('getChildren (root level)', () => {
		it('returns empty array when store is empty', () => {
			const children = provider.getChildren!(undefined);
			expect(children).toEqual([]);
		});

		it('groups comments by abs_path into FileNodes', () => {
			const t1 = makeTrackedComment({ data: { abs_path: '/src/a.ts', line_number: 1 } });
			const t2 = makeTrackedComment({ data: { abs_path: '/src/a.ts', line_number: 5 } });
			const t3 = makeTrackedComment({ data: { abs_path: '/src/b.ts', line_number: 1 } });
			store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
			store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);
			store.add(t3.data.uuid, t3.data, t3.thread, t3.commentTexts);

			const children = provider.getChildren!(undefined) as any[];
			expect(children).toHaveLength(2);
			// FileNode for /src/a.ts has 2 threads
			expect(children[0].absPath).toBe('/src/a.ts');
			expect(children[0].threads).toHaveLength(2);
			// FileNode for /src/b.ts has 1 thread
			expect(children[1].absPath).toBe('/src/b.ts');
			expect(children[1].threads).toHaveLength(1);
		});

		it('sorts FileNodes alphabetically by relative path', () => {
			// Make asRelativePath return a transformed path so we can verify sorting uses it
			(vscode.workspace.asRelativePath as ReturnType<typeof vi.fn>).mockImplementation((p: string | vscode.Uri) => {
				const val = typeof p === 'string' ? p : p.fsPath;
				return val.replace(/^\//, '');
			});

			const t1 = makeTrackedComment({ data: { abs_path: '/z/file.ts', line_number: 1 } });
			const t2 = makeTrackedComment({ data: { abs_path: '/a/file.ts', line_number: 1 } });
			store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
			store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);

			const children = provider.getChildren!(undefined) as any[];
			expect(children[0].absPath).toBe('/a/file.ts');
			expect(children[1].absPath).toBe('/z/file.ts');
		});
	});

	describe('getChildren (FileNode)', () => {
		it('returns ThreadNodes sorted by line number', () => {
			const t1 = makeTrackedComment({ data: { abs_path: '/src/a.ts', line_number: 20 } });
			const t2 = makeTrackedComment({ data: { abs_path: '/src/a.ts', line_number: 5 } });
			store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
			store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			expect(threadNodes).toHaveLength(2);
			expect(threadNodes[0].tracked.data.line_number).toBe(5);
			expect(threadNodes[1].tracked.data.line_number).toBe(20);
		});
	});

	describe('getChildren (ThreadNode)', () => {
		it('returns ReplyNodes for each comment text', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', line_number: 1 },
				commentTexts: ['first reply', 'second reply'],
				threadComments: [makeMockComment(), makeMockComment()],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];
			expect(replyNodes).toHaveLength(2);
			expect(replyNodes[0].text).toBe('first reply');
			expect(replyNodes[0].index).toBe(0);
			expect(replyNodes[1].text).toBe('second reply');
			expect(replyNodes[1].index).toBe(1);
		});
	});

	describe('getChildren (ReplyNode)', () => {
		it('returns empty array for ReplyNode children', () => {
			const t = makeTrackedComment({ data: { abs_path: '/src/a.ts' } });
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			// Single reply thread — threadNode children are reply nodes
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];
			// ReplyNode has no children
			const leafChildren = provider.getChildren!(replyNodes[0]) as any[];
			expect(leafChildren).toEqual([]);
		});
	});

	describe('getTreeItem (FileNode)', () => {
		it('shows relative path, thread count as description, File icon', () => {
			(vscode.workspace.asRelativePath as ReturnType<typeof vi.fn>).mockReturnValue('src/a.ts');

			const t1 = makeTrackedComment({ data: { abs_path: '/project/src/a.ts', line_number: 1 } });
			const t2 = makeTrackedComment({ data: { abs_path: '/project/src/a.ts', line_number: 10 } });
			store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
			store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const item = provider.getTreeItem!(fileNodes[0]);

			expect(item.label).toBe('src/a.ts');
			expect(item.description).toBe('2');
			expect(item.iconPath).toBe(vscode.ThemeIcon.File);
			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
			expect(item.resourceUri).toBeDefined();
		});
	});

	describe('getTreeItem (ThreadNode)', () => {
		it('shows line number label and collapsible None for single reply', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', line_number: 42 },
				commentTexts: ['single comment'],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect(item.label).toBe('Line 42');
			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
		});

		it('shows Expanded collapsible state for multi-reply thread', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', line_number: 10 },
				commentTexts: ['reply 1', 'reply 2'],
				threadComments: [makeMockComment(), makeMockComment()],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
			expect(item.description).toBe('2');
		});

		it('shows comment icon for pending status', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', status: 'pending' },
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect((item.iconPath as vscode.ThemeIcon).id).toBe('comment');
		});

		it('shows pass icon for processed status', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', status: 'processed' },
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect((item.iconPath as vscode.ThemeIcon).id).toBe('pass');
		});

		it('shows single comment text as description, truncated at 60 chars', () => {
			const longText = 'A'.repeat(70);
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: [longText],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect(item.description).toBe('A'.repeat(57) + '...');
		});

		it('replaces newlines with spaces in single comment description', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['line one\nline two\nline three'],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect(item.description).toBe('line one line two line three');
		});

		it('provides click command to navigate to file and line', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts', line_number: 15 },
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const item = provider.getTreeItem!(threadNodes[0]);

			expect((item.command as any).command).toBe('vscode.open');
			const args = (item.command as any).arguments;
			expect(args[0].fsPath).toBe('/src/a.ts');
			expect(args[1].selection.startLine).toBe(14); // line_number - 1
		});
	});

	describe('getTreeItem (ReplyNode)', () => {
		it('truncates label at 80 chars', () => {
			const longText = 'B'.repeat(100);
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['first', longText],
				threadComments: [makeMockComment(), makeMockComment()],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];
			const item = provider.getTreeItem!(replyNodes[1]);

			expect(item.label).toBe('B'.repeat(77) + '...');
		});

		it('replaces newlines in label with spaces', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['hello\nworld', 'second'],
				threadComments: [makeMockComment(), makeMockComment()],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];
			const item = provider.getTreeItem!(replyNodes[0]);

			expect(item.label).toBe('hello world');
		});

		it('shows comment icon for actionable (Pending) reply', () => {
			const pendingComment = makeMockComment({ label: 'Pending' });
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['fix this', 'also fix this'],
				threadComments: [pendingComment, makeMockComment({ label: 'Processed' })],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];

			const item0 = provider.getTreeItem!(replyNodes[0]);
			expect((item0.iconPath as vscode.ThemeIcon).id).toBe('comment');

			const item1 = provider.getTreeItem!(replyNodes[1]);
			expect((item1.iconPath as vscode.ThemeIcon).id).toBe('pass');
		});

		it('shows comment icon for Re-pending reply', () => {
			const rePendingComment = makeMockComment({ label: 'Re-pending' });
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['fix this', 'extra'],
				threadComments: [rePendingComment, makeMockComment({ label: 'Processed' })],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];

			const item = provider.getTreeItem!(replyNodes[0]);
			expect((item.iconPath as vscode.ThemeIcon).id).toBe('comment');
		});

		it('shows pass icon for processed reply', () => {
			const processedComment = makeMockComment({ label: 'Processed' });
			const t = makeTrackedComment({
				data: { abs_path: '/src/a.ts' },
				commentTexts: ['done', 'extra'],
				threadComments: [processedComment, makeMockComment({ label: 'Processed' })],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];

			const item = provider.getTreeItem!(replyNodes[0]);
			expect((item.iconPath as vscode.ThemeIcon).id).toBe('pass');
		});

		it('provides click command to navigate to file and line', () => {
			const t = makeTrackedComment({
				data: { abs_path: '/src/b.ts', line_number: 7 },
				commentTexts: ['first', 'second'],
				threadComments: [makeMockComment(), makeMockComment()],
			});
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			const fileNodes = provider.getChildren!(undefined) as any[];
			const threadNodes = provider.getChildren!(fileNodes[0]) as any[];
			const replyNodes = provider.getChildren!(threadNodes[0]) as any[];
			const item = provider.getTreeItem!(replyNodes[1]);

			expect((item.command as any).command).toBe('vscode.open');
			const args = (item.command as any).arguments;
			expect(args[0].fsPath).toBe('/src/b.ts');
			expect(args[1].selection.startLine).toBe(6);
		});
	});

	describe('refresh and onDidChangeTreeData', () => {
		it('fires onDidChangeTreeData when store pending count changes', () => {
			const listener = vi.fn();
			provider.onDidChangeTreeData!(listener);

			const t = makeTrackedComment({ data: { abs_path: '/src/a.ts' } });
			store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

			// store.add fires onDidChangePendingCount, which triggers provider.refresh()
			expect(listener).toHaveBeenCalled();
		});
	});

	describe('createCommentTreeView integration', () => {
		it('registers tree view with correct id and showCollapseAll', () => {
			expect(vscode.window.createTreeView).toHaveBeenCalledWith(
				'reviewa.commentTree',
				expect.objectContaining({ showCollapseAll: true }),
			);
		});

		it('pushes tree view to context subscriptions', () => {
			expect(context.subscriptions.length).toBeGreaterThan(0);
		});
	});
});

describe('statusBar', () => {
	let store: CommentStore;
	let context: vscode.ExtensionContext;
	let statusBarItem: ReturnType<typeof vscode.window.createStatusBarItem>;

	beforeEach(() => {
		__resetAllMocks();
		resetFactories();
		store = new CommentStore();
		context = makeMockExtensionContext();
		createStatusBarItem(context, store);
		statusBarItem = (vscode.window.createStatusBarItem as ReturnType<typeof vi.fn>).mock.results[0].value;
	});

	it('is hidden initially when no comments ever existed', () => {
		expect(statusBarItem.hide).toHaveBeenCalled();
		expect(statusBarItem.show).not.toHaveBeenCalled();
	});

	it('shows pending count when there are pending comments', () => {
		const t = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

		expect(statusBarItem.text).toBe('$(reviewa-glasses) 1');
		expect(statusBarItem.show).toHaveBeenCalled();
	});

	it('shows singular tooltip for 1 pending thread', () => {
		const t = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

		expect(statusBarItem.tooltip).toBe('1 pending comment thread');
	});

	it('shows plural tooltip for multiple pending threads', () => {
		const t1 = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		const t2 = makeTrackedComment({ data: { abs_path: '/src/b.ts', status: 'pending' } });
		const t3 = makeTrackedComment({ data: { abs_path: '/src/c.ts', status: 'pending' } });
		store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
		store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);
		store.add(t3.data.uuid, t3.data, t3.thread, t3.commentTexts);

		expect(statusBarItem.tooltip).toBe('3 pending comment threads');
	});

	it('shows icon without count after all comments are resolved', () => {
		// Add a pending comment first so hasEverHadComment becomes true
		const t = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

		// Now mark it as processed
		store.update(t.data.uuid, { ...t.data, status: 'processed' });

		expect(statusBarItem.text).toBe('$(reviewa-glasses)');
		expect(statusBarItem.show).toHaveBeenCalled();
	});

	it('shows processed count in tooltip when all resolved', () => {
		const t = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

		store.update(t.data.uuid, { ...t.data, status: 'processed' });

		expect(statusBarItem.tooltip).toBe('1 processed comment thread');
	});

	it('shows plural processed tooltip for multiple processed threads', () => {
		const t1 = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		const t2 = makeTrackedComment({ data: { abs_path: '/src/b.ts', status: 'pending' } });
		store.add(t1.data.uuid, t1.data, t1.thread, t1.commentTexts);
		store.add(t2.data.uuid, t2.data, t2.thread, t2.commentTexts);

		store.update(t1.data.uuid, { ...t1.data, status: 'processed' });
		store.update(t2.data.uuid, { ...t2.data, status: 'processed' });

		expect(statusBarItem.tooltip).toBe('2 processed comment threads');
	});

	it('sets command to focus comments panel', () => {
		expect(statusBarItem.command).toBe('workbench.action.focusCommentsPanel');
	});

	it('pushes item to context subscriptions', () => {
		expect(context.subscriptions.length).toBeGreaterThan(0);
	});

	it('updates on onDidChangePendingCount event', () => {
		// Initially hidden
		expect(statusBarItem.hide).toHaveBeenCalledTimes(1);

		// Add a comment -> triggers update
		const t = makeTrackedComment({ data: { abs_path: '/src/a.ts', status: 'pending' } });
		store.add(t.data.uuid, t.data, t.thread, t.commentTexts);

		expect(statusBarItem.text).toBe('$(reviewa-glasses) 1');
		expect(statusBarItem.show).toHaveBeenCalled();
	});

	it('creates status bar item with Right alignment', () => {
		expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(vscode.StatusBarAlignment.Right);
	});
});
