import { ReviewaComment, CommentSide } from '../../../types';
import * as vscode from 'vscode';

let uuidCounter = 0;

export function makeReviewaComment(overrides?: Partial<ReviewaComment>): ReviewaComment {
	uuidCounter++;
	return {
		uuid: `test-uuid-${uuidCounter}`,
		status: 'pending',
		created_at: new Date().toISOString(),
		workspace: '/test/workspace',
		abs_path: '/test/workspace/src/foo.ts',
		logical_abs_path: '/test/workspace/src/foo.ts',
		line_number: 10,
		line_content: 'const x = 1;',
		side: 'file' as CommentSide,
		content: 'Fix this line',
		...overrides,
	};
}

export function makeMockComment(overrides?: Partial<vscode.Comment>): vscode.Comment {
	return {
		body: new vscode.MarkdownString('Test comment'),
		mode: vscode.CommentMode.Preview,
		author: { name: 'You' },
		label: 'Pending',
		contextValue: 'pending',
		...overrides,
	};
}

export function makeMockThread(overrides?: Partial<vscode.CommentThread>): vscode.CommentThread {
	return {
		uri: vscode.Uri.file('/test/workspace/src/foo.ts'),
		range: new vscode.Range(9, 0, 9, 0),
		comments: [],
		collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
		canReply: true,
		dispose: () => {},
		label: '',
		contextValue: '',
		state: vscode.CommentThreadState.Unresolved,
		...overrides,
	} as vscode.CommentThread;
}

export function makeMockExtensionContext(): vscode.ExtensionContext {
	return {
		subscriptions: [],
	} as unknown as vscode.ExtensionContext;
}

export function resetFactories() {
	uuidCounter = 0;
}
