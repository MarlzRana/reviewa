import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { installHookScript, registerHook } from './hookManager';

export function activate(context: vscode.ExtensionContext) {
	CommentStore.ensureDirectoryExists();
	installHookScript();
	registerHook();

	const store = new CommentStore();
	createReviewaCommentController(context, store);
	createFileWatcher(context, store);
}

export function deactivate() {}
