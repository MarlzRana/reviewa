import * as vscode from 'vscode';

interface GitUriQuery {
	path: string;
	ref: string;
}

interface GitApi {
	getRepository(uri: vscode.Uri): { rootUri: vscode.Uri } | undefined;
}

let cachedGitApi: GitApi | undefined;

async function getGitApi(): Promise<GitApi | undefined> {
	if (cachedGitApi) {
		return cachedGitApi;
	}

	const gitExtension = vscode.extensions.getExtension('vscode.git');
	if (!gitExtension) {
		return undefined;
	}

	if (!gitExtension.isActive) {
		await gitExtension.activate();
	}

	cachedGitApi = gitExtension.exports.getAPI(1);
	return cachedGitApi;
}

export function parseGitUri(uri: vscode.Uri): { relativePath: string } | undefined {
	if (uri.scheme !== 'git') {
		return undefined;
	}

	try {
		const query: GitUriQuery = JSON.parse(uri.query);
		if (!query.path) {
			return undefined;
		}
		return { relativePath: query.path };
	} catch {
		return undefined;
	}
}

export async function getGitRepoRoot(uri: vscode.Uri): Promise<string | undefined> {
	const git = await getGitApi();
	if (!git) {
		return undefined;
	}

	const repository = git.getRepository(uri);
	return repository?.rootUri.fsPath;
}
