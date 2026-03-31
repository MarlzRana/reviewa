import * as vscode from 'vscode';
import { PlanStore, PlanEntry, PlanSource } from './planStore';

class GroupHeaderNode {
	constructor(
		readonly label: string,
		readonly source: PlanSource,
	) {}
}

class PlanItemNode {
	constructor(readonly entry: PlanEntry) {}
}

type PlanTreeNode = GroupHeaderNode | PlanItemNode;

const GROUP_LABELS: Record<PlanSource, string> = {
	claude: 'Claude Code Plans',
	gemini: 'Gemini CLI Plans',
};

const GROUP_ORDER: PlanSource[] = ['claude', 'gemini'];

const SESSION_PLAN_SCHEME = 'reviewa-plan';

class SessionPlanDecorationProvider implements vscode.FileDecorationProvider {
	private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
	readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

	private readonly sessionUris = new Set<string>();

	markSession(uri: vscode.Uri): void {
		this.sessionUris.add(uri.toString());
	}

	fireChange(uris: vscode.Uri[]): void {
		if (uris.length > 0) {
			this._onDidChangeFileDecorations.fire(uris);
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
		if (uri.scheme !== SESSION_PLAN_SCHEME) {
			return undefined;
		}
		if (!this.sessionUris.has(uri.toString())) {
			return undefined;
		}
		return {
			color: new vscode.ThemeColor('charts.green'),
			propagate: false,
			tooltip: 'Detected this session',
		};
	}

	dispose(): void {
		this._onDidChangeFileDecorations.dispose();
	}
}

class PlanTreeDataProvider implements vscode.TreeDataProvider<PlanTreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private readonly store: PlanStore,
		private readonly decorationProvider: SessionPlanDecorationProvider,
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PlanTreeNode): vscode.TreeItem {
		if (element instanceof GroupHeaderNode) {
			const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
			return item;
		}

		const { entry } = element;
		const item = new vscode.TreeItem(entry.name, vscode.TreeItemCollapsibleState.None);
		item.iconPath = vscode.ThemeIcon.File;

		const planUri = vscode.Uri.from({ scheme: SESSION_PLAN_SCHEME, path: entry.absPath });
		item.resourceUri = planUri;

		if (entry.sessionDetected) {
			this.decorationProvider.markSession(planUri);
		}

		item.command = {
			command: 'vscode.open',
			title: 'Open Plan',
			arguments: [vscode.Uri.file(entry.absPath)],
		};
		return item;
	}

	getChildren(element?: PlanTreeNode): PlanTreeNode[] {
		if (!element) {
			return GROUP_ORDER
				.filter(source => this.store.getBySource(source).length > 0)
				.map(source => new GroupHeaderNode(GROUP_LABELS[source], source));
		}

		if (element instanceof GroupHeaderNode) {
			return this.store.getBySource(element.source).map(entry => new PlanItemNode(entry));
		}

		return [];
	}
}

export function createPlanTreeView(
	context: vscode.ExtensionContext,
	planStore: PlanStore,
): void {
	const decorationProvider = new SessionPlanDecorationProvider();
	const provider = new PlanTreeDataProvider(planStore, decorationProvider);

	const treeView = vscode.window.createTreeView('reviewa.planTree', {
		treeDataProvider: provider,
		showCollapseAll: true,
	});

	context.subscriptions.push(treeView);
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
	context.subscriptions.push(decorationProvider);
	context.subscriptions.push(planStore.onDidChange(() => provider.refresh()));
}
