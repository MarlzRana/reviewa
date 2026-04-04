import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { __resetAllMocks, __setConfigValues } from './mocks/vscode';
import {
  makeReviewaComment,
  makeMockThread,
  makeMockExtensionContext,
  resetFactories,
} from './helpers/factories';
import {
  COMMENTS_DIR,
  CLAUDE_PLANS_DIR,
  PLAN_METADATA_DIR,
  GEMINI_PLAN_METADATA_DIR,
} from '../../types';

// ---- fs mock ----
vi.mock('fs', () => {
  const actual: Record<string, unknown> = {};
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    watch: vi.fn(() => ({ close: vi.fn() })),
    default: {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
      watch: vi.fn(() => ({ close: vi.fn() })),
    },
  };
});

vi.mock('../../hookManager', () => ({
  registerClaudePlanHook: vi.fn(),
  unregisterClaudePlanHook: vi.fn(),
  registerGeminiPlanHook: vi.fn(),
  unregisterGeminiPlanHook: vi.fn(),
}));

import * as fs from 'fs';
import {
  registerClaudePlanHook,
  unregisterClaudePlanHook,
  registerGeminiPlanHook,
  unregisterGeminiPlanHook,
} from '../../hookManager';
import { createPlanWatcher } from '../../planWatcher';
import { PlanStore } from '../../planStore';
import { registerCopyCommands } from '../../copyComments';
import { CommentStore } from '../../commentStore';

// Helper to get the fs.watch callback for a specific metadata directory
function getWatchCallbackFor(metadataDir: string): (
  eventType: string,
  filename: string | null,
) => void {
  const watchMock = vi.mocked(fs.watch);
  const call = watchMock.mock.calls.find(c => c[0] === metadataDir);
  if (!call) {
    throw new Error(`No fs.watch call found for ${metadataDir}`);
  }
  return call[1] as (eventType: string, filename: string | null) => void;
}

beforeEach(() => {
  __resetAllMocks();
  resetFactories();
  vi.clearAllMocks();
});

// =============================================================================
// Plan Watcher Tests
// =============================================================================
describe('createPlanWatcher', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = makeMockExtensionContext();
    // Default: workspace folder set
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/test/workspace'), name: 'workspace', index: 0 },
    ];
  });

  describe('activation', () => {
    it('registers hooks and creates watchers for both Claude and Gemini', () => {
      createPlanWatcher(context, new PlanStore());

      expect(registerClaudePlanHook).toHaveBeenCalledTimes(1);
      expect(registerGeminiPlanHook).toHaveBeenCalledTimes(1);
      expect(fs.watch).toHaveBeenCalledWith(
        PLAN_METADATA_DIR,
        expect.any(Function),
      );
      expect(fs.watch).toHaveBeenCalledWith(
        GEMINI_PLAN_METADATA_DIR,
        expect.any(Function),
      );
      expect(fs.mkdirSync).toHaveBeenCalledWith(PLAN_METADATA_DIR, {
        recursive: true,
      });
      expect(fs.mkdirSync).toHaveBeenCalledWith(GEMINI_PLAN_METADATA_DIR, {
        recursive: true,
      });
    });
  });

  describe('file events', () => {
    it('opens relevant plan files via metadata', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/test/workspace',
          abs_path: '/home/user/.claude/plans/my-plan.md',
          created_at: '2026-01-01',
        }),
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'my-plan.json');

      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('ignores non-.json files', () => {
      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'my-plan.md');
      callback('rename', 'my-plan.txt');
      callback('rename', null);

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('does not open plan when autoOpenOnPlanCreation is false', () => {
      __setConfigValues({ 'reviewa.autoOpenOnPlanCreation': false });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/test/workspace',
          abs_path: '/home/user/.claude/plans/my-plan.md',
          created_at: '2026-01-01',
        }),
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'my-plan.json');

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('does not open plan when not relevant to workspace', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/other/project',
          abs_path: '/home/user/.claude/plans/other-plan.md',
          created_at: '2026-01-01',
        }),
      );

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'other-plan.json');

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('isRelevantPlan (via metadata event)', () => {
    const planAbsPath = '/home/user/.claude/plans/test-plan.md';

    function setupAndTrigger(metadata: object | null) {
      if (metadata) {
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(metadata));
      } else {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('ENOENT');
        });
      }
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);
      callback('rename', 'test-plan.json');
    }

    it('returns true when cwd starts with workspace path', () => {
      setupAndTrigger({
        cwd: '/test/workspace/subdir',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('returns true when cwd exactly matches workspace path', () => {
      setupAndTrigger({
        cwd: '/test/workspace',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('handles trailing slashes on cwd', () => {
      setupAndTrigger({
        cwd: '/test/workspace/',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('handles trailing slashes on workspace folder', () => {
      vscode.workspace.workspaceFolders = [
        {
          uri: vscode.Uri.file('/test/workspace/'),
          name: 'workspace',
          index: 0,
        },
      ];
      setupAndTrigger({
        cwd: '/test/workspace',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('returns false for different workspace', () => {
      setupAndTrigger({
        cwd: '/different/workspace',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('returns false when no metadata exists', () => {
      setupAndTrigger(null);
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('returns false when metadata has no cwd', () => {
      setupAndTrigger({ abs_path: planAbsPath, created_at: '2026-01-01' });
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('returns false when no workspace folder', () => {
      vscode.workspace.workspaceFolders = undefined;
      setupAndTrigger({
        cwd: '/test/workspace',
        abs_path: planAbsPath,
        created_at: '2026-01-01',
      });
      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });
  });

  describe('metadata deletion', () => {
    it('calls planStore.remove when metadata file is deleted', () => {
      // readFileSync throws (file gone), existsSync returns false for metadata path
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const planStore = new PlanStore();
      const removeSpy = vi.spyOn(planStore, 'remove');

      createPlanWatcher(context, planStore);
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'deleted-plan.json');

      expect(removeSpy).toHaveBeenCalledWith(
        expect.stringContaining('deleted-plan.json'),
      );
    });

    it('does not call planStore.remove when metadata file exists but is invalid', () => {
      // readFileSync throws (invalid JSON), but existsSync returns true (file still exists)
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('parse error'); });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const planStore = new PlanStore();
      const removeSpy = vi.spyOn(planStore, 'remove');

      createPlanWatcher(context, planStore);
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);

      callback('rename', 'invalid.json');

      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('deactivates both watchers and unregisters hooks on dispose', () => {
      createPlanWatcher(context, new PlanStore());
      const claudeWatcherClose = vi.mocked(fs.watch).mock.results[0].value.close;
      const geminiWatcherClose = vi.mocked(fs.watch).mock.results[1].value.close;

      const disposeSubscription = context.subscriptions[
        context.subscriptions.length - 1
      ] as { dispose: () => void };
      disposeSubscription.dispose();

      expect(claudeWatcherClose).toHaveBeenCalled();
      expect(geminiWatcherClose).toHaveBeenCalled();
      expect(unregisterClaudePlanHook).toHaveBeenCalled();
      expect(unregisterGeminiPlanHook).toHaveBeenCalled();
    });
  });

  describe('copy nudge', () => {
    function openClaudePlan() {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/test/workspace',
          abs_path: '/home/user/.claude/plans/plan.md',
          created_at: '2026-01-01',
        }),
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(PLAN_METADATA_DIR);
      callback('rename', 'plan.json');
    }

    it('shows info message when a Claude plan opens', async () => {
      openClaudePlan();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('copy buttons in the editor title menu bar'),
      );
    });

    it('stops showing after 20 opens', async () => {
      context.globalState.update('claudePlanCopyNudgeCount', 10);

      openClaudePlan();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Gemini Plan Watcher Tests
// =============================================================================
describe('createPlanWatcher - Gemini', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = makeMockExtensionContext();
    vscode.workspace.workspaceFolders = [
      { uri: vscode.Uri.file('/test/workspace'), name: 'workspace', index: 0 },
    ];
  });

  describe('file events', () => {
    it('opens relevant Gemini plan files via metadata', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/test/workspace',
          abs_path: '/home/user/.gemini/tmp/proj/sess/plans/my-plan.md',
          created_at: '2026-01-01',
        }),
      );
      vi.mocked(fs.existsSync).mockReturnValue(true);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(GEMINI_PLAN_METADATA_DIR);

      callback('rename', 'my-plan.json');

      expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('ignores non-.json files in metadata directory', () => {
      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(GEMINI_PLAN_METADATA_DIR);

      callback('rename', 'my-plan.md');
      callback('rename', 'my-plan.txt');
      callback('rename', null);

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('does not open plan when cwd does not match workspace', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/other/project',
          abs_path: '/home/user/.gemini/tmp/proj/sess/plans/plan.md',
          created_at: '2026-01-01',
        }),
      );

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(GEMINI_PLAN_METADATA_DIR);

      callback('rename', 'plan.json');

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('does not open plan when abs_path does not exist', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          cwd: '/test/workspace',
          abs_path: '/home/user/.gemini/tmp/proj/sess/plans/plan.md',
          created_at: '2026-01-01',
        }),
      );
      vi.mocked(fs.existsSync).mockReturnValue(false);

      createPlanWatcher(context, new PlanStore());
      const callback = getWatchCallbackFor(GEMINI_PLAN_METADATA_DIR);

      callback('rename', 'plan.json');

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Copy Commands Tests
// =============================================================================
describe('registerCopyCommands', () => {
  let context: vscode.ExtensionContext;
  let store: CommentStore;

  // Extract command handlers from registerCommand mock calls
  function getCommandHandler(
    commandId: string,
  ): (...args: unknown[]) => Promise<void> {
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const match = calls.find((c) => c[0] === commandId);
    if (!match) {
      throw new Error(`Command ${commandId} not registered`);
    }
    return match[1] as (...args: unknown[]) => Promise<void>;
  }

  function addCommentToStore(
    overrides?: Parameters<typeof makeReviewaComment>[0],
  ) {
    const comment = makeReviewaComment(overrides);
    const thread = makeMockThread({ contextValue: comment.uuid });
    store.add(comment.uuid, comment, thread, [comment.content]);
    return comment;
  }

  beforeEach(() => {
    context = makeMockExtensionContext();
    store = new CommentStore();
    registerCopyCommands(context, store);
  });

  describe('copyFileComments', () => {
    it('filters by file path AND pending status', async () => {
      const target = '/test/workspace/plans/plan.md';
      addCommentToStore({
        abs_path: target,
        status: 'pending',
        content: 'Fix A',
      });
      addCommentToStore({
        abs_path: target,
        status: 'processed',
        content: 'Already done',
      });
      addCommentToStore({
        abs_path: '/other/file.ts',
        status: 'pending',
        content: 'Wrong file',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledTimes(1);
      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain('Fix A');
      expect(clipboardText).not.toContain('Already done');
      expect(clipboardText).not.toContain('Wrong file');
    });

    it('formats correctly with relative path, line number, code block, and content', async () => {
      const target = '/test/workspace/src/foo.ts';
      vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('src/foo.ts');
      addCommentToStore({
        abs_path: target,
        line_number: 42,
        line_content: 'const x = 1;',
        side: 'file',
        content: 'Please fix this',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toBe(
        'In `src/foo.ts` at line 42:\n```\nconst x = 1;\n```\nPlease fix this',
      );
    });

    it('copies to clipboard and consumes (deletes) comment files', async () => {
      const target = '/test/workspace/plan.md';
      const c1 = addCommentToStore({ abs_path: target });
      const c2 = addCommentToStore({ abs_path: target });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining(c1.uuid),
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining(c2.uuid),
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Reviewa: Copied 2 comment(s) in current file to clipboard',
      );
    });

    it('shows warning when no active editor and no URI provided', async () => {
      vscode.window.activeTextEditor = undefined;

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Reviewa: No active editor',
      );
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('falls back to active editor when no URI provided', async () => {
      const target = '/test/workspace/plan.md';
      vscode.window.activeTextEditor = {
        document: { uri: vscode.Uri.file(target) },
      };
      addCommentToStore({ abs_path: target });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(); // no URI argument

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    it('shows warning when no pending comments for file', async () => {
      const target = '/test/workspace/plan.md';
      addCommentToStore({ abs_path: target, status: 'processed' });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Reviewa: No pending comments for this file',
      );
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe('copyAllPendingComments', () => {
    it('copies all pending comments regardless of file', async () => {
      addCommentToStore({ abs_path: '/file1.ts', content: 'Comment 1' });
      addCommentToStore({ abs_path: '/file2.ts', content: 'Comment 2' });
      addCommentToStore({
        abs_path: '/file3.ts',
        status: 'processed',
        content: 'Done',
      });

      const handler = getCommandHandler('reviewa.copyAllPendingComments');
      await handler();

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledTimes(1);
      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain('Comment 1');
      expect(clipboardText).toContain('Comment 2');
      expect(clipboardText).not.toContain('Done');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Reviewa: Copied 2 comment(s) to clipboard',
      );
    });

    it('sorts comments by created_at', async () => {
      addCommentToStore({
        abs_path: '/a.ts',
        content: 'Second',
        created_at: '2026-01-02T00:00:00Z',
      });
      addCommentToStore({
        abs_path: '/b.ts',
        content: 'First',
        created_at: '2026-01-01T00:00:00Z',
      });
      addCommentToStore({
        abs_path: '/c.ts',
        content: 'Third',
        created_at: '2026-01-03T00:00:00Z',
      });

      const handler = getCommandHandler('reviewa.copyAllPendingComments');
      await handler();

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      const firstIdx = clipboardText.indexOf('First');
      const secondIdx = clipboardText.indexOf('Second');
      const thirdIdx = clipboardText.indexOf('Third');
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });

    it('shows warning when no pending comments', async () => {
      addCommentToStore({ status: 'processed' });

      const handler = getCommandHandler('reviewa.copyAllPendingComments');
      await handler();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Reviewa: No pending comments',
      );
      expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe('formatLineContent', () => {
    it('prefixes additions with +', async () => {
      const target = '/test/file.ts';
      vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('file.ts');
      addCommentToStore({
        abs_path: target,
        side: 'addition',
        line_content: 'const y = 2;',
        content: 'Check this',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain('+const y = 2;');
    });

    it('prefixes removals with -', async () => {
      const target = '/test/file.ts';
      vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('file.ts');
      addCommentToStore({
        abs_path: target,
        side: 'removal',
        line_content: 'const old = 0;',
        content: 'Removed',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain('-const old = 0;');
    });

    it('no prefix for file side', async () => {
      const target = '/test/file.ts';
      vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('file.ts');
      addCommentToStore({
        abs_path: target,
        side: 'file',
        line_content: 'normal line',
        content: 'OK',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain('```\nnormal line\n```');
      expect(clipboardText).not.toContain('+normal line');
      expect(clipboardText).not.toContain('-normal line');
    });
  });

  describe('formatComment', () => {
    it('produces correct full output format', async () => {
      const target = '/test/workspace/src/bar.ts';
      vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('src/bar.ts');
      addCommentToStore({
        abs_path: target,
        line_number: 99,
        line_content: 'return null;',
        side: 'removal',
        content: 'Should throw instead',
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      const clipboardText = vi.mocked(vscode.env.clipboard.writeText).mock
        .calls[0][0] as string;
      expect(clipboardText).toBe(
        'In `src/bar.ts` at line 99:\n```\n-return null;\n```\nShould throw instead',
      );
    });
  });

  describe('consumeComments', () => {
    it('calls unlinkSync for each UUID', async () => {
      const target = '/test/file.ts';
      const c1 = addCommentToStore({ abs_path: target });
      const c2 = addCommentToStore({ abs_path: target });
      const c3 = addCommentToStore({ abs_path: target });

      const handler = getCommandHandler('reviewa.copyFileComments');
      await handler(vscode.Uri.file(target));

      expect(fs.unlinkSync).toHaveBeenCalledTimes(3);
      for (const c of [c1, c2, c3]) {
        expect(fs.unlinkSync).toHaveBeenCalledWith(
          expect.stringContaining(c.uuid),
        );
      }
    });

    it('handles errors gracefully when file already deleted', async () => {
      const target = '/test/file.ts';
      addCommentToStore({ abs_path: target });
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const handler = getCommandHandler('reviewa.copyFileComments');
      // Should not throw
      await expect(handler(vscode.Uri.file(target))).resolves.toBeUndefined();
      expect(vscode.env.clipboard.writeText).toHaveBeenCalled();
    });
  });
});
