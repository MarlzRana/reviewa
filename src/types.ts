import * as path from 'path';
import * as os from 'os';

export enum CodingCliTool {
	ClaudeCode = 'claude-code',
	Codex = 'codex',
	GeminiCli = 'gemini-cli',
}

export type CommentSide = 'file' | 'addition' | 'removal';
export type IntendedConsumer = 'claude_code' | 'gemini_cli';

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
export const GEMINI_DIR = path.join(os.homedir(), '.reviewa', 'v1', 'gemini-cli');
export const GEMINI_HOOKS_DIR = path.join(GEMINI_DIR, 'hooks');
export const GEMINI_PLAN_METADATA_DIR = path.join(GEMINI_DIR, 'plan-metadata');
