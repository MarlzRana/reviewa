import * as vscode from 'vscode';
import { CommentStore } from './commentStore';

export function createStatusBarItem(
	context: vscode.ExtensionContext,
	store: CommentStore,
): void {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	item.command = 'workbench.action.focusCommentsPanel';
	context.subscriptions.push(item);

	function update() {
		const count = store.getPendingCount();
		if (count > 0) {
			item.text = `$(comment-discussion) ${count}`;
			item.tooltip = `${count} pending comment thread${count === 1 ? '' : 's'}`;
			item.show();
		} else {
			item.hide();
		}
	}

	context.subscriptions.push(store.onDidChangePendingCount(update));
	update();
}
