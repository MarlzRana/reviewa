import * as path from 'path';
import * as os from 'os';

export type CommentSide = 'file' | 'addition' | 'removal';

export interface ReviewaComment {
	uuid: string;
	status: 'pending' | 'processed';
	created_at: string;
	workspace: string;
	abs_path: string;
	line_number: number;
	line_content: string;
	side: CommentSide;
	content: string;
}

export const REVIEWA_DIR = path.join(os.homedir(), '.reviewa', 'v1');
export const COMMENTS_DIR = path.join(REVIEWA_DIR, 'comments');
