import * as path from 'path';
import * as os from 'os';

export type CommentSide = 'file' | 'addition' | 'removal';
export type IntendedConsumer = 'claude_code';

export interface ReviewaComment {
	uuid: string;
	status: 'pending' | 'processed';
	created_at: string;
	workspace: string;
	abs_path: string;
	logical_abs_path: string;
	line_number: number;
	line_content: string;
	side: CommentSide;
	content: string;
	intended_consumer?: IntendedConsumer;
}

export const REVIEWA_DIR = path.join(os.homedir(), '.reviewa', 'v1');
export const COMMENTS_DIR = path.join(REVIEWA_DIR, 'comments');
export const CLAUDE_DIR = path.join(REVIEWA_DIR, 'claude');
export const CLAUDE_HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
export const PLAN_METADATA_DIR = path.join(CLAUDE_DIR, 'plan-metadata');
export const CLAUDE_PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');
