import * as fs from 'fs';
import * as vscode from 'vscode';
import { ReviewaComment, COMMENTS_DIR } from './types';

export interface TrackedComment {
	data: ReviewaComment;
	thread: vscode.CommentThread;
	commentTexts: string[];
}

export class CommentStore {
	private readonly store = new Map<string, TrackedComment>();
	private readonly suppressedDeletions = new Set<string>();
	private readonly _onDidChangePendingCount = new vscode.EventEmitter<void>();
	readonly onDidChangePendingCount = this._onDidChangePendingCount.event;

	getPendingCount(): number {
		let count = 0;
		for (const tracked of this.store.values()) {
			if (tracked.data.status === 'pending') {
				count++;
			}
		}
		return count;
	}

	static ensureDirectoryExists(): void {
		fs.mkdirSync(COMMENTS_DIR, { recursive: true });
	}

	static saveComment(comment: ReviewaComment): void {
		const filePath = `${COMMENTS_DIR}/${comment.uuid}.json`;
		fs.writeFileSync(filePath, JSON.stringify(comment, null, 2));
	}

	add(uuid: string, data: ReviewaComment, thread: vscode.CommentThread, commentTexts: string[]): void {
		this.store.set(uuid, { data, thread, commentTexts });
		this._onDidChangePendingCount.fire();
	}

	get(uuid: string): TrackedComment | undefined {
		return this.store.get(uuid);
	}

	update(uuid: string, data: ReviewaComment): void {
		const tracked = this.store.get(uuid);
		if (tracked) {
			tracked.data = data;
			this._onDidChangePendingCount.fire();
		}
	}

	findByThread(thread: vscode.CommentThread): [string, TrackedComment] | undefined {
		for (const [uuid, tracked] of this.store) {
			if (tracked.thread === thread) {
				return [uuid, tracked];
			}
		}
		return undefined;
	}

	notifyPendingCountChanged(): void {
		this._onDidChangePendingCount.fire();
	}

	delete(uuid: string): void {
		this.store.delete(uuid);
		this._onDidChangePendingCount.fire();
	}

	findByComment(comment: vscode.Comment): [string, TrackedComment, number] | undefined {
		for (const [uuid, tracked] of this.store) {
			const index = tracked.thread.comments.indexOf(comment);
			if (index !== -1) {
				return [uuid, tracked, index];
			}
		}
		return undefined;
	}

	suppressWatcher(uuid: string): void {
		this.suppressedDeletions.add(uuid);
	}

	consumeSuppression(uuid: string): boolean {
		return this.suppressedDeletions.delete(uuid);
	}

	deleteFile(uuid: string): void {
		this.suppressedDeletions.add(uuid);
		const filePath = `${COMMENTS_DIR}/${uuid}.json`;
		try {
			fs.unlinkSync(filePath);
		} catch {
			// Already deleted
		}
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
