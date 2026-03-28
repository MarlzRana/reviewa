import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ReviewaComment, CommentSide } from './types';
import { parseGitUri, getGitRepoRoot } from './gitUtils';
import { CommentStore } from './commentStore';

async function getGitHubAuthor(): Promise<vscode.CommentAuthorInformation> {
	try {
		const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: false });
		if (session) {
			return {
				name: session.account.label,
				iconPath: vscode.Uri.parse(`https://avatars.githubusercontent.com/u/${session.account.id}`),
			};
		}
	} catch {
		// Not logged in or permission denied
	}
	return { name: 'You' };
}

function findDiffTab(uri: vscode.Uri): vscode.TabInputTextDiff | undefined {
	for (const group of vscode.window.tabGroups.all) {
		for (const tab of group.tabs) {
			if (tab.input instanceof vscode.TabInputTextDiff) {
				if (tab.input.modified.toString() === uri.toString() || tab.input.original.toString() === uri.toString()) {
					return tab.input;
				}
			}
		}
	}
	return undefined;
}

async function detectSide(uri: vscode.Uri, lineNumber: number): Promise<CommentSide> {
	const diffTab = findDiffTab(uri);
	if (!diffTab) {
		return 'file';
	}

	// We're in a diff view — determine if the line is changed or just context
	const isOldSide = diffTab.original.toString() === uri.toString();
	const otherUri = isOldSide ? diffTab.modified : diffTab.original;

	try {
		const thisDoc = await vscode.workspace.openTextDocument(uri);
		const otherDoc = await vscode.workspace.openTextDocument(otherUri);
		const thisLine = thisDoc.lineAt(lineNumber - 1).text;

		// Check if the same line content exists at the same position in the other side
		if (lineNumber - 1 < otherDoc.lineCount) {
			const otherLine = otherDoc.lineAt(lineNumber - 1).text;
			if (thisLine === otherLine) {
				return 'file'; // Unchanged context line
			}
		}
	} catch {
		// If we can't read either document, fall back to position-based guess
	}

	return isOldSide ? 'removal' : 'addition';
}

async function readLineContent(uri: vscode.Uri, lineNumber: number, absPath: string): Promise<string> {
	if (uri.scheme === 'git') {
		// Read from the git document to get the old version's content
		try {
			const doc = await vscode.workspace.openTextDocument(uri);
			return doc.lineAt(lineNumber - 1).text;
		} catch {
			// Fall through to disk read
		}
	}

	try {
		const fileContent = fs.readFileSync(absPath, 'utf-8');
		const lines = fileContent.split('\n');
		return lines[lineNumber - 1] ?? '';
	} catch {
		return '';
	}
}

export function createReviewaCommentController(
	context: vscode.ExtensionContext,
	store: CommentStore,
): vscode.CommentController {
	const controller = vscode.comments.createCommentController('reviewa', 'Reviewa');
	context.subscriptions.push(controller);

	const authorPromise = getGitHubAuthor();

	controller.options = {
		prompt: 'Leave a comment',
		placeHolder: 'Describe what should be changed here...',
	};

	controller.commentingRangeProvider = {
		provideCommentingRanges(document: vscode.TextDocument): vscode.Range[] | undefined {
			const { scheme } = document.uri;

			if (scheme === 'git' || scheme === 'file') {
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
			const lineContent = await readLineContent(uri, lineNumber, absPath);
			const side = await detectSide(uri, lineNumber);

			const author = await authorPromise;
			const newVscodeComment: vscode.Comment = {
				body: reply.text,
				mode: vscode.CommentMode.Preview,
				author,
				label: 'Pending',
				contextValue: 'pending',
			};

			reply.thread.comments = [...reply.thread.comments, newVscodeComment];
			reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
			reply.thread.label = 'Pending comments';

			const existingUuid = reply.thread.contextValue;
			if (existingUuid) {
				// Reply on existing thread — append to the same JSON file
				const tracked = store.get(existingUuid);
				if (tracked) {
					tracked.commentTexts.push(reply.text);
					// Only include pending comment texts in the file
					const pendingTexts = reply.thread.comments
						.map((c, i) => ({ label: c.label, text: tracked.commentTexts[i] }))
						.filter(c => c.label === 'Pending')
						.map(c => c.text);
					const updatedData = {
						...tracked.data,
						status: 'pending' as const,
						content: pendingTexts.join('\n\n'),
					};
					CommentStore.saveComment(updatedData);
					store.update(existingUuid, updatedData);
				}
			} else {
				// First comment on this line — create new JSON file
				const uuid = crypto.randomUUID();
				const comment: ReviewaComment = {
					uuid,
					status: 'pending',
					created_at: new Date().toISOString(),
					workspace: repoRoot,
					abs_path: absPath,
					line_number: lineNumber,
					line_content: lineContent,
					side,
					content: reply.text,
				};

				CommentStore.saveComment(comment);
				reply.thread.contextValue = uuid;
				store.add(uuid, comment, reply.thread, [reply.text]);
			}
		}),
	);

	// Delete entire thread
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.deleteThread', (thread: vscode.CommentThread) => {
			const entry = store.findByThread(thread);
			if (entry) {
				const [uuid] = entry;
				store.deleteFile(uuid);
				store.delete(uuid);
			}
			thread.dispose();
		}),
	);

	// Delete individual comment
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.deleteComment', (comment: vscode.Comment) => {
			const entry = store.findByComment(comment);
			if (!entry) {
				return;
			}

			const [uuid, tracked, index] = entry;

			// Remove from commentTexts
			tracked.commentTexts.splice(index, 1);

			// Remove from thread UI
			const updatedComments = [...tracked.thread.comments];
			updatedComments.splice(index, 1);

			if (updatedComments.length === 0) {
				// Last comment deleted — remove thread entirely
				store.deleteFile(uuid);
				store.delete(uuid);
				tracked.thread.dispose();
			} else {
				tracked.thread.comments = updatedComments;
				const hasPending = updatedComments.some(c => c.label === 'Pending');
				tracked.thread.label = hasPending ? 'Pending comments' : 'All comments processed';
				if (hasPending) {
					// Update file store with remaining pending texts
					const pendingTexts = updatedComments
						.map((c, i) => ({ label: c.label, text: tracked.commentTexts[i] }))
						.filter(c => c.label === 'Pending')
						.map(c => c.text);
					const updatedData = {
						...tracked.data,
						status: 'pending' as const,
						content: pendingTexts.join('\n\n'),
					};
					CommentStore.saveComment(updatedData);
					store.update(uuid, updatedData);
				} else {
					// Only processed comments remain — remove file from disk
					store.deleteFile(uuid);
					tracked.data = { ...tracked.data, status: 'processed' };
				}
			}
		}),
	);

	// Edit a pending comment
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.editComment', (comment: vscode.Comment) => {
			const entry = store.findByComment(comment);
			if (!entry) {
				return;
			}

			const [, tracked, index] = entry;
			const updatedComments = [...tracked.thread.comments];
			updatedComments[index] = { ...comment, mode: vscode.CommentMode.Editing };
			tracked.thread.comments = updatedComments;
		}),
	);

	// Save an edited comment
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.saveComment', (comment: vscode.Comment) => {
			const entry = store.findByComment(comment);
			if (!entry) {
				return;
			}

			const [uuid, tracked, index] = entry;
			const newText = typeof comment.body === 'string' ? comment.body : comment.body.value;

			// Update in-memory text array
			tracked.commentTexts[index] = newText;

			// Update UI
			const updatedComments = [...tracked.thread.comments];
			updatedComments[index] = { ...comment, mode: vscode.CommentMode.Preview };
			tracked.thread.comments = updatedComments;

			// Update file store
			const updatedData = {
				...tracked.data,
				content: tracked.commentTexts.join('\n\n'),
			};
			CommentStore.saveComment(updatedData);
			store.update(uuid, updatedData);
		}),
	);

	return controller;
}
