import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as https from 'https';
import { ReviewaComment, CommentSide, IntendedConsumer, CLAUDE_PLANS_DIR } from './types';
import { parseGitUri, getGitRepoRoot } from './gitUtils';
import { CommentStore } from './commentStore';

function fetchBuffer(url: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				fetchBuffer(res.headers.location).then(resolve, reject);
				return;
			}
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks)));
			res.on('error', reject);
		}).on('error', reject);
	});
}

function buildRoundedRectAvatarUri(imageBase64: string, size: number): vscode.Uri {
	const radius = Math.round(size * 0.2);
	const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
	<defs><clipPath id="r"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></clipPath></defs>
	<image href="data:image/png;base64,${imageBase64}" width="${size}" height="${size}" clip-path="url(#r)"/>
</svg>`;
	return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

async function getGitHubAuthor(): Promise<vscode.CommentAuthorInformation> {
	try {
		const session = await vscode.authentication.getSession('github', ['read:user'], { createIfNone: false });
		if (session) {
			const avatarUrl = `https://avatars.githubusercontent.com/u/${session.account.id}?s=40`;
			try {
				const imageData = await fetchBuffer(avatarUrl);
				const iconPath = buildRoundedRectAvatarUri(imageData.toString('base64'), 40);
				return { name: session.account.label, iconPath };
			} catch {
				return {
					name: session.account.label,
					iconPath: vscode.Uri.parse(`https://avatars.githubusercontent.com/u/${session.account.id}`),
				};
			}
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

function isActionable(c: vscode.Comment): boolean {
	return c.label === 'Pending' || c.label === 'Re-pending';
}

function getActionableTexts(comments: readonly vscode.Comment[], commentTexts: string[]): string[] {
	return comments
		.map((c, i) => ({ actionable: isActionable(c), text: commentTexts[i] }))
		.filter(c => c.actionable)
		.map(c => c.text);
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
			let logicalAbsPath: string;
			let workspace: string;
			let intendedConsumer: IntendedConsumer | undefined;

			if (uri.scheme === 'git') {
				const gitInfo = parseGitUri(uri);
				if (!gitInfo) {
					vscode.window.showErrorMessage('Reviewa: Could not parse git URI');
					return;
				}
				const repoRoot = await getGitRepoRoot(uri);
				if (!repoRoot) {
					vscode.window.showErrorMessage('Reviewa: Could not determine git repository root');
					return;
				}
				absPath = path.join(repoRoot, gitInfo.relativePath);
				logicalAbsPath = absPath;
				workspace = repoRoot;
			} else if (uri.scheme === 'file') {
				absPath = uri.fsPath;
				const isClaudeCodePlan = absPath.startsWith(CLAUDE_PLANS_DIR + path.sep) || absPath.startsWith(CLAUDE_PLANS_DIR + '/');
				const isGeminiCliPlan = /\/\.gemini\/tmp\/[^/]+\/[^/]+\/plans\/[^/]+\.md$/.test(absPath);
				if (isClaudeCodePlan || isGeminiCliPlan) {
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					if (!workspaceFolder) {
						vscode.window.showErrorMessage('Reviewa: No workspace folder open');
						return;
					}
					logicalAbsPath = path.join(workspaceFolder, path.basename(absPath));
					workspace = workspaceFolder;
					intendedConsumer = isClaudeCodePlan ? 'claude_code' : 'gemini_cli';
				} else {
					const repoRoot = await getGitRepoRoot(uri);
					if (!repoRoot) {
						vscode.window.showErrorMessage('Reviewa: Could not determine git repository root');
						return;
					}
					logicalAbsPath = absPath;
					workspace = repoRoot;
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
				body: new vscode.MarkdownString(reply.text),
				mode: vscode.CommentMode.Preview,
				author,
				label: 'Pending',
				contextValue: 'pending',
			};

			reply.thread.comments = [...reply.thread.comments, newVscodeComment];
			reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
			reply.thread.state = vscode.CommentThreadState.Unresolved;
			reply.thread.label = 'Pending comments';

			const existingUuid = reply.thread.contextValue;
			if (existingUuid) {
				// Reply on existing thread — append to the same JSON file
				const tracked = store.get(existingUuid);
				if (tracked) {
					tracked.commentTexts.push(reply.text);
					const actionableTexts = getActionableTexts(reply.thread.comments, tracked.commentTexts);
					const updatedData = {
						...tracked.data,
						status: 'pending' as const,
						created_at: new Date().toISOString(),
						content: actionableTexts.join('\n\n'),
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
					workspace,
					abs_path: absPath,
					logical_abs_path: logicalAbsPath,
					line_number: lineNumber,
					line_content: lineContent,
					side,
					content: reply.text,
					...(intendedConsumer ? { intended_consumer: intendedConsumer } : {}),
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
				const hasActionable = updatedComments.some(isActionable);
				tracked.thread.label = hasActionable ? 'Pending comments' : 'All comments processed';
				if (hasActionable) {
					const actionableTexts = getActionableTexts(updatedComments, tracked.commentTexts);
					const updatedData = {
						...tracked.data,
						status: 'pending' as const,
						content: actionableTexts.join('\n\n'),
					};
					CommentStore.saveComment(updatedData);
					store.update(uuid, updatedData);
				} else {
					// Only processed comments remain — remove file from disk
					store.deleteFile(uuid);
					tracked.data = { ...tracked.data, status: 'processed' };
					store.notifyPendingCountChanged();
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
			updatedComments[index] = {
				...comment,
				body: typeof comment.body === 'string' ? comment.body : comment.body.value,
				mode: vscode.CommentMode.Editing,
			};
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

			// If saving a processed comment, auto-set to re-pending
			const wasProcessed = comment.contextValue === 'processed';
			const updatedComment = wasProcessed
				? { ...comment, body: new vscode.MarkdownString(newText), mode: vscode.CommentMode.Preview, label: 'Re-pending', contextValue: 'repending' }
				: { ...comment, body: new vscode.MarkdownString(newText), mode: vscode.CommentMode.Preview };

			// Update UI
			const updatedComments = [...tracked.thread.comments];
			updatedComments[index] = updatedComment;
			tracked.thread.comments = updatedComments;
			tracked.thread.label = 'Pending comments';
			tracked.thread.state = vscode.CommentThreadState.Unresolved;

			// Update file store with actionable texts only
			const actionableTexts = getActionableTexts(updatedComments, tracked.commentTexts);
			const updatedData = {
				...tracked.data,
				status: 'pending' as const,
				created_at: new Date().toISOString(),
				content: actionableTexts.join('\n\n'),
			};
			CommentStore.saveComment(updatedData);
			store.update(uuid, updatedData);
		}),
	);

	// Mark processed → re-pending
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.markRepending', (comment: vscode.Comment) => {
			const entry = store.findByComment(comment);
			if (!entry) {
				return;
			}

			const [uuid, tracked, index] = entry;
			const updatedComments = [...tracked.thread.comments];
			updatedComments[index] = { ...comment, label: 'Re-pending', contextValue: 'repending' };

			tracked.thread.comments = updatedComments;
			tracked.thread.label = 'Pending comments';
			tracked.thread.state = vscode.CommentThreadState.Unresolved;

			const actionableTexts = getActionableTexts(updatedComments, tracked.commentTexts);
			const updatedData = {
				...tracked.data,
				status: 'pending' as const,
				created_at: new Date().toISOString(),
				content: actionableTexts.join('\n\n'),
			};
			CommentStore.saveComment(updatedData);
			store.update(uuid, updatedData);
		}),
	);

	// Mark re-pending → processed
	context.subscriptions.push(
		vscode.commands.registerCommand('reviewa.markProcessed', (comment: vscode.Comment) => {
			const entry = store.findByComment(comment);
			if (!entry) {
				return;
			}

			const [uuid, tracked, index] = entry;
			const updatedComments = [...tracked.thread.comments];
			updatedComments[index] = { ...comment, label: 'Processed', contextValue: 'processed' };

			tracked.thread.comments = updatedComments;
			const hasActionable = updatedComments.some(isActionable);
			tracked.thread.label = hasActionable ? 'Pending comments' : 'All comments processed';

			if (hasActionable) {
				const actionableTexts = getActionableTexts(updatedComments, tracked.commentTexts);
				const updatedData = {
					...tracked.data,
					status: 'pending' as const,
					created_at: new Date().toISOString(),
					content: actionableTexts.join('\n\n'),
				};
				CommentStore.saveComment(updatedData);
				store.update(uuid, updatedData);
			} else {
				store.deleteFile(uuid);
				tracked.data = { ...tracked.data, status: 'processed' };
					store.notifyPendingCountChanged();
			}
		}),
	);

	return controller;
}
