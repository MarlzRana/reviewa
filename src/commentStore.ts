import * as fs from 'fs';
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

	update(uuid: string, data: ReviewaComment): void {
		const tracked = this.store.get(uuid);
		if (tracked) {
			tracked.data = data;
		}
	}

	delete(uuid: string): void {
		this.store.delete(uuid);
	}

	deleteAllPendingFiles(): void {
		for (const [uuid, tracked] of this.store) {
			const filePath = `${COMMENTS_DIR}/${uuid}.json`;
			try {
				fs.unlinkSync(filePath);
			} catch {
				// Already deleted
			}
			tracked.thread.dispose();
		}
		this.store.clear();
	}
}
