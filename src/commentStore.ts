import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ReviewaComment, COMMENTS_DIR } from './types';

export interface TrackedComment {
	data: ReviewaComment;
	thread: vscode.CommentThread;
}

export class CommentStore {
	private readonly store = new Map<string, TrackedComment>();

	static ensureDirectoryExists(): void {
		fs.mkdirSync(COMMENTS_DIR, { recursive: true });
	}

	static hashLineContent(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex').substring(0, 6);
	}

	static saveComment(comment: ReviewaComment): void {
		const filePath = `${COMMENTS_DIR}/${comment.uuid}.json`;
		fs.writeFileSync(filePath, JSON.stringify(comment, null, 2));
	}

	add(uuid: string, data: ReviewaComment, thread: vscode.CommentThread): void {
		this.store.set(uuid, { data, thread });
	}

	get(uuid: string): TrackedComment | undefined {
		return this.store.get(uuid);
	}

	delete(uuid: string): void {
		this.store.delete(uuid);
	}
}
