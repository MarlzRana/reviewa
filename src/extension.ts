import * as os from 'os';
import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { createStatusBarItem } from './statusBar';
import { createCommentTreeView } from './commentTreeView';
import { installHookScripts, registerHooks } from './hookManager';
import { createPlanWatcher } from './planWatcher';
import { registerCopyCommands } from './copy_comments';

let store: CommentStore;

export function activate(context: vscode.ExtensionContext) {
	if (os.platform() === 'win32') {
		vscode.window.showErrorMessage('Reviewa is not supported on Windows.');
		return;
	}
	CommentStore.ensureDirectoryExists();
	installHookScripts();
	registerHooks();

	store = new CommentStore();
	createReviewaCommentController(context, store);
	createFileWatcher(context, store);
	createStatusBarItem(context, store);
	createCommentTreeView(context, store);
	createPlanWatcher(context);
	registerCopyCommands(context, store);
}

export function deactivate() {
	store?.deleteAllPendingFiles();
}
