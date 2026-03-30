import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { createStatusBarItem } from './statusBar';
import { createCommentTreeView } from './commentTreeView';
import { installHookScripts, registerHooks } from './hookManager';
import { createPlanWatcher } from './planWatcher';

let store: CommentStore;

export function activate(context: vscode.ExtensionContext) {
	CommentStore.ensureDirectoryExists();
	installHookScripts();
	registerHooks();

	store = new CommentStore();
	createReviewaCommentController(context, store);
	createFileWatcher(context, store);
	createStatusBarItem(context, store);
	createCommentTreeView(context, store);
	createPlanWatcher(context);
}

export function deactivate() {
	store?.deleteAllPendingFiles();
}
