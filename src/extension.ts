import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { installHookScripts, registerHooks } from './hookManager';

let store: CommentStore;

export function activate(context: vscode.ExtensionContext) {
	CommentStore.ensureDirectoryExists();
	installHookScripts();
	registerHooks();

	store = new CommentStore();
	createReviewaCommentController(context, store);
	createFileWatcher(context, store);
}

export function deactivate() {
	store?.deleteAllPendingFiles();
}
