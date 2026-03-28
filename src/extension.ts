import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { installHookScript, registerHooks } from './hookManager';

let store: CommentStore;

export function activate(context: vscode.ExtensionContext) {
	CommentStore.ensureDirectoryExists();
	installHookScript();
	registerHooks();

	store = new CommentStore();
	createReviewaCommentController(context, store);
	createFileWatcher(context, store);
}

export function deactivate() {
	store?.deleteAllPendingFiles();
}
