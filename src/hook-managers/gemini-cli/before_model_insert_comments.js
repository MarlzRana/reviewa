#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const COMMENTS_DIR = path.join(require('os').homedir(), '.reviewa', 'v1', 'comments');

function formatLineContent(comment) {
	const prefix = comment.side === 'addition' ? '+' : comment.side === 'removal' ? '-' : '';
	return prefix + comment.line_content;
}

async function main() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	const input = JSON.parse(Buffer.concat(chunks).toString());
	const cwd = input.cwd;

	if (!cwd || !fs.existsSync(COMMENTS_DIR)) {
		process.exit(0);
	}

	const files = fs.readdirSync(COMMENTS_DIR).filter(f => f.endsWith('.json'));
	if (files.length === 0) {
		process.exit(0);
	}

	const matchedComments = [];

	for (const file of files) {
		const filePath = path.join(COMMENTS_DIR, file);
		let comment;
		try {
			comment = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		} catch {
			continue;
		}

		const consumer = comment.intended_consumer;
		if (consumer && consumer !== 'gemini_cli') {
			continue;
		}

		const matchPath = comment.logical_abs_path || comment.abs_path;
		if (!matchPath || !matchPath.startsWith(cwd)) {
			continue;
		}

		matchedComments.push({ comment, filePath });
	}

	if (matchedComments.length === 0) {
		process.exit(0);
	}

	matchedComments.sort((a, b) => (a.comment.created_at || '').localeCompare(b.comment.created_at || ''));

	const parts = [];
	for (const { comment } of matchedComments) {
		const displayPath = comment.abs_path.startsWith(cwd) ? path.relative(cwd, comment.abs_path) : comment.abs_path;
		const formatted = formatLineContent(comment);
		parts.push('In \`' + displayPath + '\` at line ' + comment.line_number + ':\n\`\`\`\n' + formatted + '\n\`\`\`\n' + comment.content);
	}

	const contextText = parts.join('\n\n');

	for (const { filePath } of matchedComments) {
		try {
			fs.unlinkSync(filePath);
		} catch {}
	}

	const llmRequest = (input.llm_request && typeof input.llm_request === 'object') ? input.llm_request : {};
	const messages = Array.isArray(llmRequest.messages) ? llmRequest.messages.slice() : [];
	messages.push({ role: 'user', content: contextText });

	const output = {
		hookSpecificOutput: {
			hookEventName: 'BeforeModel',
			llm_request: Object.assign({}, llmRequest, { messages }),
		},
	};
	process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
