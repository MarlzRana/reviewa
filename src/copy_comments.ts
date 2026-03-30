import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewaComment, COMMENTS_DIR } from './types';
import { CommentStore } from './commentStore';

function formatLineContent(comment: ReviewaComment): string {
	const prefix = comment.side === 'addition' ? '+' : comment.side === 'removal' ? '-' : '';
	return prefix + comment.line_content;
}

function formatComment(comment: ReviewaComment): string {
	const displayPath = vscode.workspace.asRelativePath(comment.abs_path);
	const formatted = formatLineContent(comment);
	return `In \`${displayPath}\` at line ${comment.line_number}:\n\`\`\`\n${formatted}\n\`\`\`\n${comment.content}`;
}

function consumeComments(uuids: string[]): void {
	for (const uuid of uuids) {
		const filePath = path.join(COMMENTS_DIR, `${uuid}.json`);
		try {
			fs.unlinkSync(filePath);
		} catch {
			// Already deleted
		}
	}
}

async function copyPlanComments(store: CommentStore, uri?: vscode.Uri): Promise<void> {
	const activeFilePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
	if (!activeFilePath) {
		vscode.window.showWarningMessage('Reviewa: No active editor');
		return;
	}

	const matched = store.getAll()
		.filter(t => t.data.status === 'pending' && t.data.abs_path === activeFilePath)
		.sort((a, b) => a.data.created_at.localeCompare(b.data.created_at));

	if (matched.length === 0) {
		vscode.window.showWarningMessage('Reviewa: No pending comments for this plan file');
		return;
	}

	const text = matched.map(t => formatComment(t.data)).join('\n\n');
	await vscode.env.clipboard.writeText(text);
	consumeComments(matched.map(t => t.data.uuid));
	vscode.window.showInformationMessage(`Reviewa: Copied ${matched.length} plan comment(s) to clipboard`);
}

async function copyAllPendingComments(store: CommentStore): Promise<void> {
	const matched = store.getAll()
		.filter(t => t.data.status === 'pending')
		.sort((a, b) => a.data.created_at.localeCompare(b.data.created_at));

	if (matched.length === 0) {
		vscode.window.showWarningMessage('Reviewa: No pending comments');
		return;
	}

	const text = matched.map(t => formatComment(t.data)).join('\n\n');
	await vscode.env.clipboard.writeText(text);
	consumeComments(matched.map(t => t.data.uuid));
	vscode.window.showInformationMessage(`Reviewa: Copied ${matched.length} comment(s) to clipboard`);
}

export function registerCopyCommands(context: vscode.ExtensionContext, store: CommentStore): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.copyPlanComments', (uri?: vscode.Uri) => copyPlanComments(store, uri)),
		vscode.commands.registerCommand('reviewa.copyAllPendingComments', () => copyAllPendingComments(store)),
	);
}
