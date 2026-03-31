/**
 * Custom mock for the `vscode` module.
 * Provides mock implementations of all VS Code APIs used by Reviewa.
 */
import { vi } from 'vitest';

// --- EventEmitter ---
export class EventEmitter<T> {
	private listeners: Array<(e: T) => void> = [];

	event = (listener: (e: T) => void): { dispose: () => void } => {
		this.listeners.push(listener);
		return {
			dispose: () => {
				const idx = this.listeners.indexOf(listener);
				if (idx !== -1) { this.listeners.splice(idx, 1); }
			},
		};
	};

	fire(data: T): void {
		for (const listener of this.listeners) {
			listener(data);
		}
	}

	dispose(): void {
		this.listeners = [];
	}
}

// --- Uri ---
export class Uri {
	scheme: string;
	fsPath: string;
	path: string;
	query: string;
	fragment: string;
	authority: string;

	private constructor(opts: { scheme: string; fsPath?: string; path?: string; query?: string; fragment?: string; authority?: string }) {
		this.scheme = opts.scheme;
		this.fsPath = opts.fsPath ?? opts.path ?? '';
		this.path = opts.path ?? opts.fsPath ?? '';
		this.query = opts.query ?? '';
		this.fragment = opts.fragment ?? '';
		this.authority = opts.authority ?? '';
	}

	static file(fsPath: string): Uri {
		return new Uri({ scheme: 'file', fsPath, path: fsPath });
	}

	static parse(value: string): Uri {
		// Simple parse for data: and https: URIs
		const colonIdx = value.indexOf(':');
		const scheme = colonIdx !== -1 ? value.slice(0, colonIdx) : 'file';
		return new Uri({ scheme, path: value, fsPath: value });
	}

	toString(): string {
		if (this.scheme === 'file') {
			return `file://${this.fsPath}`;
		}
		return `${this.scheme}://${this.authority}${this.path}${this.query ? '?' + this.query : ''}`;
	}

	with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
		return new Uri({
			scheme: change.scheme ?? this.scheme,
			authority: change.authority ?? this.authority,
			path: change.path ?? this.path,
			fsPath: change.path ?? this.fsPath,
			query: change.query ?? this.query,
			fragment: change.fragment ?? this.fragment,
		});
	}
}

// --- Range ---
export class Range {
	constructor(
		public startLine: number,
		public startCharacter: number,
		public endLine: number,
		public endCharacter: number,
	) {}

	get start() { return { line: this.startLine, character: this.startCharacter }; }
	get end() { return { line: this.endLine, character: this.endCharacter }; }
}

// --- MarkdownString ---
export class MarkdownString {
	value: string;
	constructor(value?: string) {
		this.value = value ?? '';
	}
}

// --- ThemeColor ---
export class ThemeColor {
	constructor(public readonly id: string) {}
}

// --- ThemeIcon ---
export class ThemeIcon {
	static File = new ThemeIcon('file');
	static Folder = new ThemeIcon('folder');

	constructor(public readonly id: string) {}
}

// --- TreeItem ---
export class TreeItem {
	label?: string;
	description?: string;
	iconPath?: unknown;
	command?: unknown;
	resourceUri?: Uri;
	collapsibleState?: number;
	contextValue?: string;

	constructor(label: string, collapsibleState?: number) {
		this.label = label;
		this.collapsibleState = collapsibleState;
	}
}

// --- TabInputTextDiff ---
export class TabInputTextDiff {
	constructor(
		public readonly original: Uri,
		public readonly modified: Uri,
	) {}
}

// --- Enums ---
export enum CommentMode {
	Editing = 0,
	Preview = 1,
}

export enum CommentThreadCollapsibleState {
	Collapsed = 0,
	Expanded = 1,
}

export enum CommentThreadState {
	Unresolved = 0,
	Resolved = 1,
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2,
}

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2,
}

// --- Mock factories ---
function createMockCommentController() {
	return {
		id: 'reviewa',
		label: 'Reviewa',
		options: undefined as unknown,
		commentingRangeProvider: undefined as unknown,
		dispose: vi.fn(),
	};
}

function createMockStatusBarItem() {
	return {
		text: '',
		tooltip: '',
		command: undefined as string | undefined,
		alignment: StatusBarAlignment.Right,
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	};
}

function createMockTreeView() {
	return {
		onDidChangeSelection: vi.fn(),
		onDidChangeVisibility: vi.fn(),
		onDidCollapseElement: vi.fn(),
		onDidExpandElement: vi.fn(),
		reveal: vi.fn(),
		dispose: vi.fn(),
	};
}

// --- Namespace mocks ---
export const comments = {
	createCommentController: vi.fn((_id: string, _label: string) => createMockCommentController()),
};

export const window = {
	createStatusBarItem: vi.fn((_alignment?: StatusBarAlignment) => createMockStatusBarItem()),
	createTreeView: vi.fn((_viewId: string, _options: unknown) => createMockTreeView()),
	registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() })),
	showInformationMessage: vi.fn(),
	showWarningMessage: vi.fn(),
	showErrorMessage: vi.fn(),
	showTextDocument: vi.fn(),
	activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
	tabGroups: { all: [] as Array<{ tabs: Array<{ input: unknown }> }> },
};

// Configuration mock - configurable per test
let configValues: Record<string, unknown> = {};

export function __setConfigValues(values: Record<string, unknown>) {
	configValues = values;
}

export const workspace = {
	getConfiguration: vi.fn((_section?: string) => ({
		get: vi.fn((key: string, defaultValue?: unknown) => {
			const fullKey = _section ? `${_section}.${key}` : key;
			return fullKey in configValues ? configValues[fullKey] : defaultValue;
		}),
	})),
	openTextDocument: vi.fn(),
	asRelativePath: vi.fn((pathOrUri: string | Uri) => {
		const p = typeof pathOrUri === 'string' ? pathOrUri : pathOrUri.fsPath;
		return p;
	}),
	workspaceFolders: undefined as Array<{ uri: Uri; name: string; index: number }> | undefined,
	onDidChangeConfiguration: vi.fn((_listener: unknown) => ({ dispose: vi.fn() })),
};

export const commands = {
	registerCommand: vi.fn((_command: string, _callback: (...args: unknown[]) => unknown) => ({ dispose: vi.fn() })),
	executeCommand: vi.fn(),
};

export const extensions = {
	getExtension: vi.fn(),
};

export const authentication = {
	getSession: vi.fn(),
};

export const env = {
	clipboard: {
		writeText: vi.fn(),
	},
};

// --- Reset helper ---
export function __resetAllMocks() {
	configValues = {};
	window.activeTextEditor = undefined;
	window.tabGroups = { all: [] };
	workspace.workspaceFolders = undefined;
	vi.clearAllMocks();
}
