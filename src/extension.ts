import * as os from 'os';
import * as vscode from 'vscode';
import { CommentStore } from './commentStore';
import { createReviewaCommentController } from './commentController';
import { createFileWatcher } from './fileWatcher';
import { createStatusBarItem } from './statusBar';
import { createCommentTreeView } from './commentTreeView';
import { installHookScripts, registerHooks } from './hookManager';
import { createPlanWatcher } from './planWatcher';
import { PlanStore } from './planStore';
import { createPlanTreeView } from './planTreeView';
import { registerCopyCommands } from './copyComments';

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
	const planStore = new PlanStore();
	planStore.scanExisting();
	createPlanTreeView(context, planStore);
	createPlanWatcher(context, planStore);
	context.subscriptions.push(planStore);
	registerCopyCommands(context, store);
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.claudeCodePlanLabel', () => {}),
		vscode.commands.registerCommand('reviewa.geminiCliPlanLabel', () => {}),
	);
}

export function deactivate() {
	store?.deleteAllPendingFiles();
}
