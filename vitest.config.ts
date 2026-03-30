import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
	test: {
		include: ['src/test/unit/**/*.test.ts'],
		alias: {
			vscode: path.resolve(__dirname, 'src/test/unit/mocks/vscode.ts'),
		},
	},
});
