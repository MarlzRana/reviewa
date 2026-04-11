#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const GEMINI_PLANS_PATTERN = /[\/]\.gemini[\/]tmp[\/][^\/]+[\/][^\/]+[\/]plans[\/][^\/]+\.md$/;
const METADATA_DIR = path.join(require('os').homedir(), '.reviewa', 'v1', 'gemini-cli', 'plan-metadata');

async function main() {
	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	const input = JSON.parse(Buffer.concat(chunks).toString());
	const filePath = input.tool_input?.file_path || '';

	if (!GEMINI_PLANS_PATTERN.test(filePath)) {
		process.exit(0);
	}

	const basename = path.basename(filePath);
	const planName = basename.replace(/\.md$/, '');
	fs.mkdirSync(METADATA_DIR, { recursive: true });
	fs.writeFileSync(
		path.join(METADATA_DIR, planName + '.json'),
		JSON.stringify({ cwd: input.cwd, abs_path: filePath, created_at: new Date().toISOString() })
	);
}

main().catch(() => process.exit(0));
