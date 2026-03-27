import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ReviewaComment } from './types';
import { parseGitUri, getGitRepoRoot, isFileWithGitChanges } from './gitUtils';
import { CommentStore } from './commentStore';

export function createReviewaCommentController(
	context: vscode.ExtensionContext,
	store: CommentStore,
): vscode.CommentController {
	const controller = vscode.comments.createCommentController('reviewa', 'Reviewa');
	context.subscriptions.push(controller);

	controller.options = {
		prompt: 'Write a comment for your coding agent to resolve...',
		placeHolder: 'Describe what should be changed here...',
	};

	controller.commentingRangeProvider = {
		async provideCommentingRanges(document: vscode.TextDocument): Promise<vscode.Range[] | undefined> {
			const { scheme } = document.uri;

			if (scheme === 'git') {
				return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
			}

			if (scheme === 'file' && await isFileWithGitChanges(document.uri)) {
				return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
			}

			return undefined;
		},
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.createComment', async (reply: vscode.CommentReply) => {
			const uri = reply.thread.uri;

			let absPath: string;
			let repoRoot: string | undefined;

			if (uri.scheme === 'git') {
				const gitInfo = parseGitUri(uri);
				if (!gitInfo) {
					vscode.window.showErrorMessage('Reviewa: Could not parse git URI');
					return;
				}
				repoRoot = await getGitRepoRoot(uri);
				if (!repoRoot) {
					vscode.window.showErrorMessage('Reviewa: Could not determine git repository root');
					return;
				}
				absPath = path.join(repoRoot, gitInfo.relativePath);
			} else if (uri.scheme === 'file') {
				absPath = uri.fsPath;
				repoRoot = await getGitRepoRoot(uri);
				if (!repoRoot) {
					vscode.window.showErrorMessage('Reviewa: Could not determine git repository root');
					return;
				}
			} else {
				return;
			}

			const range = reply.thread.range;
			if (!range) {
				return;
			}
			const lineNumber = range.start.line + 1;

			let lineContent = '';
			try {
				const fileContent = fs.readFileSync(absPath, 'utf-8');
				const lines = fileContent.split('\n');
				lineContent = lines[lineNumber - 1] ?? '';
			} catch {
				// File may not exist on disk (e.g. deleted file in diff)
			}

			const uuid = crypto.randomUUID();
			const comment: ReviewaComment = {
				uuid,
				status: 'pending',
				created_at: new Date().toISOString(),
				workspace: repoRoot,
				abs_path: absPath,
				line_number: lineNumber,
				line_content: lineContent,
				line_content_hash: CommentStore.hashLineContent(lineContent),
				content: reply.text,
			};

			CommentStore.saveComment(comment);

			const newComment: vscode.Comment = {
				body: reply.text,
				mode: vscode.CommentMode.Preview,
				author: { name: 'Reviewa' },
			};

			reply.thread.comments = [...reply.thread.comments, newComment];
			reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
			reply.thread.canReply = false;

			store.add(uuid, comment, reply.thread);
		}),
	);

	return controller;
}
