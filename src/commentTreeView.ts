import * as path from 'path';
import * as vscode from 'vscode';
import { CommentStore, TrackedComment } from './commentStore';
import { CLAUDE_PLANS_DIR } from './types';

const GEMINI_PLANS_PATTERN = /[\\/]\.gemini[\\/]tmp[\\/][^\\/]+[\\/][^\\/]+[\\/]plans[\\/]/;

function getPlanSource(absPath: string): string | null {
	if (absPath.startsWith(CLAUDE_PLANS_DIR)) {
		return 'Claude Code plan';
	}
	if (GEMINI_PLANS_PATTERN.test(absPath)) {
		return 'Gemini CLI plan';
	}
	return null;
}

class FileNode {
	constructor(
		readonly absPath: string,
		readonly threads: TrackedComment[],
	) {}
}

class ThreadNode {
	constructor(readonly tracked: TrackedComment) {}
}

class ReplyNode {
	constructor(
		readonly tracked: TrackedComment,
		readonly text: string,
		readonly index: number,
	) {}
}

type TreeNode = FileNode | ThreadNode | ReplyNode;

class ReviewaTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly store: CommentStore) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		if (element instanceof FileNode) {
			const planSource = getPlanSource(element.absPath);
			const label = planSource
				? path.basename(element.absPath)
				: vscode.workspace.asRelativePath(element.absPath);
			const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
			item.resourceUri = vscode.Uri.file(element.absPath);
			item.iconPath = vscode.ThemeIcon.File;
			item.description = planSource
				? `${planSource}  ${element.threads.length}`
				: `${element.threads.length}`;
			return item;
		}

		if (element instanceof ThreadNode) {
			const { data } = element.tracked;
			const replyCount = element.tracked.commentTexts.length;
			const collapsible = replyCount > 1
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None;
			const item = new vscode.TreeItem(`Line ${data.line_number}`, collapsible);
			if (replyCount === 1) {
				const preview = element.tracked.commentTexts[0];
				item.description = (preview.length > 60 ? preview.slice(0, 57) + '...' : preview).replace(/\n/g, ' ');
			} else {
				item.description = `${replyCount}`;
			}
			item.iconPath = new vscode.ThemeIcon(data.status === 'pending' ? 'comment' : 'pass');
			item.command = {
				command: 'vscode.open',
				title: 'Go to Comment',
				arguments: [
					vscode.Uri.file(data.abs_path),
					{ selection: new vscode.Range(data.line_number - 1, 0, data.line_number - 1, 0) },
				],
			};
			return item;
		}

		const item = new vscode.TreeItem(element.text.replace(/\n/g, ' '));
		if (item.label && typeof item.label === 'string' && item.label.length > 80) {
			item.label = item.label.slice(0, 77) + '...';
		}
		const comment = element.tracked.thread.comments[element.index];
		const isActionable = comment && (comment.label === 'Pending' || comment.label === 'Re-pending');
		item.iconPath = new vscode.ThemeIcon(isActionable ? 'comment' : 'pass');
		item.command = {
			command: 'vscode.open',
			title: 'Go to Comment',
			arguments: [
				vscode.Uri.file(element.tracked.data.abs_path),
				{ selection: new vscode.Range(element.tracked.data.line_number - 1, 0, element.tracked.data.line_number - 1, 0) },
			],
		};
		return item;
	}

	getChildren(element?: TreeNode): TreeNode[] {
		if (!element) {
			const all = this.store.getAll();
			const grouped = new Map<string, TrackedComment[]>();
			for (const tracked of all) {
				const key = tracked.data.abs_path;
				let group = grouped.get(key);
				if (!group) {
					group = [];
					grouped.set(key, group);
				}
				group.push(tracked);
			}

			return Array.from(grouped.entries())
				.sort(([a], [b]) => vscode.workspace.asRelativePath(a).localeCompare(vscode.workspace.asRelativePath(b)))
				.map(([absPath, threads]) => new FileNode(absPath, threads));
		}

		if (element instanceof FileNode) {
			return element.threads
				.sort((a, b) => a.data.line_number - b.data.line_number)
				.map(tracked => new ThreadNode(tracked));
		}

		if (element instanceof ThreadNode) {
			return element.tracked.commentTexts.map((text, i) => new ReplyNode(element.tracked, text, i));
		}

		return [];
	}
}

export function createCommentTreeView(
	context: vscode.ExtensionContext,
	store: CommentStore,
): void {
	const provider = new ReviewaTreeDataProvider(store);

	const treeView = vscode.window.createTreeView('reviewa.commentTree', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	context.subscriptions.push(treeView);
	context.subscriptions.push(store.onDidChangePendingCount(() => provider.refresh()));
}
