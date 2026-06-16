import React, { useState, useCallback } from 'react';
import {
  Screen,
  FrameWorkItems,
  WorkItem,
  WorkItemType,
  WorkItemTypeInfo,
  HierarchyContext,
  TaskToSubmit,
  CreateTaskResult,
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
import { useAutoResize } from './hooks/useAutoResize';
import { createTasks, fetchExistingWorkItems, closeTasks } from './services/api';
import { HomeScreen } from './screens/HomeScreen';
import { ConnectAzureScreen } from './screens/ConnectAzureScreen';
import { SelectProjectScreen } from './screens/SelectProjectScreen';
import { ParseTasklistScreen, ParseResult } from './screens/ParseTasklistScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SubmittingScreen } from './screens/SubmittingScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { PartialFailureScreen } from './screens/PartialFailureScreen';

// This tool only creates/closes Tasks.
type SubmitResult = CreateTaskResult;

// Which Review section a task belongs to. New (create) and Open (close) are
// mutually exclusive — an action targets one section at a time; Closed is
// read-only with no action.
type TaskSection = 'new' | 'open' | 'closed';
function sectionOf(item: WorkItem): TaskSection {
  if (!item.existing) return 'new';
  return item.closed ? 'closed' : 'open';
}

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);

  const { frameCount, sectionCount, requestFrames } = useFrameSelection();
  const auth = useAzureAuth();
  const { storage, updateStorage } = usePluginStorage();
  const containerRef = useAutoResize();

  // Work item type and hierarchy. Plugin 1 (team) only creates Tasks — titles
  // come straight from the parsed tasklist, so there is no type-selection step.
  const [workItemType] = useState<WorkItemType>('Task');
  const [hierarchyContext, setHierarchyContext] = useState<HierarchyContext>({});
  const [availableTypes, setAvailableTypes] = useState<WorkItemTypeInfo[]>([]);

  // Generated work items
  const [frameWorkItems, setFrameWorkItems] = useState<FrameWorkItems[]>([]);
  const [completedFrameIds, setCompletedFrameIds] = useState<Set<string>>(new Set());

  // Azure connection state
  const [parentTitle, setParentTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProjectId, setAzureProjectId] = useState('');

  // Submission state
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SubmitResult[]>([]);
  // Which action the Submitting/Success screens are reporting on.
  const [action, setAction] = useState<'create' | 'close'>('create');

  // Flow: home → work-item-type → connect-azure → select-project → select-parent → context → generating → review → submitting → success

  const handleContinueFromHome = useCallback(() => {
    requestFrames();
    // Task-only flow: connect to Azure (if needed), then pick project + parent.
    setScreen(auth.isAuthenticated ? 'select-project' : 'connect-azure');
  }, [requestFrames, auth.isAuthenticated]);

  const handleConnectAzure = useCallback(() => {
    auth.startAuth(() => {
      setScreen('select-project');
    });
  }, [auth]);

  // Called after selecting org/project and parent (combined screen)
  const handleProjectSelected = useCallback(
    (selection: {
      org: string;
      projectId: string;
      availableTypes: WorkItemTypeInfo[];
      hierarchyContext: HierarchyContext;
      selectedTags: string[];
      parentTitle: string;
    }) => {
      setAzureOrg(selection.org);
      setAzureProjectId(selection.projectId);
      setAvailableTypes(selection.availableTypes);
      setHierarchyContext(selection.hierarchyContext);
      setSelectedTags(selection.selectedTags);
      setParentTitle(selection.parentTitle);

      // Save to storage
      updateStorage({
        azureOrg: selection.org,
        azureProjectId: selection.projectId,
        lastEpicId: selection.hierarchyContext.epic?.id,
        lastFeatureId: selection.hierarchyContext.feature?.id,
        lastStoryId: selection.hierarchyContext.userStory?.id,
        frequentTags: selection.selectedTags.slice(0, 5),
      });

      // Go straight to context screen
      setScreen('context');
    },
    [updateStorage]
  );

  const handleSessionExpired = useCallback(() => {
    auth.logout();
    setScreen('connect-azure');
  }, [auth]);

  // Explicit sign-out: clears the local token/session and resets the selected
  // Azure org/project so a different account starts clean. The next connect
  // shows the Microsoft account picker (prompt=select_account).
  const handleDisconnect = useCallback(() => {
    auth.logout();
    setAzureOrg('');
    setAzureProjectId('');
    setHierarchyContext({});
    setScreen('connect-azure');
  }, [auth]);

  // Sign out from the Home screen: same cleanup, but stay on Home.
  const handleLogout = useCallback(() => {
    auth.logout();
    setAzureOrg('');
    setAzureProjectId('');
    setHierarchyContext({});
    setScreen('home');
  }, [auth]);

  // Plugin 1 (team): build the FrameWorkItems shape ReviewScreen already
  // consumes directly from the parsed tasklist lines — no Claude call. The work
  // item id encodes the dedup hash (`task-<hash>`) so submit can stamp it back
  // onto the frame. Lines already created on a prior run come in unselected.
  const handleParsed = useCallback(async (result: ParseResult) => {
    // Per-line Azure status: existing (in Azure) and, if so, closed or open.
    // Defaults to "new" until reconciled below.
    const status = new Map<string, { existing: boolean; closed: boolean; azureId?: number }>();
    for (const item of result.items) {
      status.set(item.hash, { existing: false, closed: false });
    }

    // Reconcile the dedup ledger with Azure: fetch the stored ids' current
    // state. Deleted ones re-list as new (and are pruned from the frame map);
    // existing ones are tagged open/closed so Review can offer "Close".
    const createdWithId = result.items.filter(
      (i) => i.alreadyCreated && typeof i.azureId === 'number'
    );
    if (createdWithId.length > 0 && auth.accessToken && azureOrg && azureProjectId) {
      try {
        const existing = await fetchExistingWorkItems(
          auth.accessToken,
          azureOrg,
          azureProjectId,
          createdWithId.map((i) => i.azureId as number)
        );
        const byId = new Map(existing.map((e) => [e.id, e]));
        const staleHashes: string[] = [];
        for (const item of createdWithId) {
          const found = byId.get(item.azureId as number);
          if (!found) {
            staleHashes.push(item.hash); // deleted in Azure → re-list as new
          } else {
            status.set(item.hash, {
              existing: true,
              closed: found.closed,
              azureId: item.azureId,
            });
          }
        }
        if (staleHashes.length > 0) {
          parent.postMessage(
            { pluginMessage: { type: 'prune-dedup', data: staleHashes } },
            '*'
          );
        }
      } catch {
        // Best-effort: if the check fails, fall back to the local ledger —
        // treat already-created lines as existing+open (no state info).
        for (const item of createdWithId) {
          status.set(item.hash, { existing: true, closed: false, azureId: item.azureId });
        }
      }
    }

    // Order: new tasks first (actionable), then open existing (closeable),
    // then closed (done). Stable sort preserves tasklist order within a group.
    const rank = (h: string): number => {
      const s = status.get(h)!;
      return !s.existing ? 0 : s.closed ? 2 : 1;
    };
    const ordered = [...result.items].sort((a, b) => rank(a.hash) - rank(b.hash));

    const fwi: FrameWorkItems = {
      frameId: result.frameId,
      frameName: result.frameName,
      workItems: ordered.map((item) => {
        const s = status.get(item.hash)!;
        return {
          id: `task-${item.hash}`,
          title: item.title,
          // New tasks are pre-selected to create; existing ones start
          // unselected (the user opts in to close them).
          selected: !s.existing,
          existing: s.existing,
          closed: s.closed,
          azureId: s.azureId,
        };
      }),
    };
    setFrameWorkItems([fwi]);
    setCompletedFrameIds(new Set([result.frameId]));
    setError(null);
    setScreen('review');
  }, [auth.accessToken, azureOrg, azureProjectId]);

  const handleWorkItemUpdate = useCallback(
    (frameId: string, workItemId: string, updates: Partial<WorkItem>) => {
      setFrameWorkItems((prev) =>
        prev.map((fwi) =>
          fwi.frameId === frameId
            ? {
                ...fwi,
                workItems: fwi.workItems.map((item) =>
                  item.id === workItemId ? { ...item, ...updates } : item
                ),
              }
            : fwi
        )
      );
    },
    []
  );

  // Toggle one item. When turning it ON, deselect the *other* actionable
  // section so only one of New/Open is ever selected at a time.
  const handleWorkItemToggle = useCallback((frameId: string, workItemId: string) => {
    setFrameWorkItems((prev) => {
      const target = prev.flatMap((f) => f.workItems).find((i) => i.id === workItemId);
      if (!target) return prev;
      const turningOn = !target.selected;
      const otherSection = sectionOf(target) === 'new' ? 'open' : 'new';
      return prev.map((fwi) => ({
        ...fwi,
        workItems: fwi.workItems.map((item) => {
          if (item.id === workItemId) return { ...item, selected: !item.selected };
          if (turningOn && sectionOf(item) === otherSection) {
            return { ...item, selected: false };
          }
          return item;
        }),
      }));
    });
  }, []);

  // Select/deselect every item in a section. Selecting one section clears the
  // other (mutual exclusivity).
  const handleSelectSection = useCallback(
    (section: 'new' | 'open', selected: boolean) => {
      const otherSection = section === 'new' ? 'open' : 'new';
      setFrameWorkItems((prev) =>
        prev.map((fwi) => ({
          ...fwi,
          workItems: fwi.workItems.map((item) => {
            const sec = sectionOf(item);
            if (sec === section) return { ...item, selected };
            if (selected && sec === otherSection) return { ...item, selected: false };
            return item;
          }),
        }))
      );
    },
    []
  );

  const handleRemoveTag = useCallback(
    (frameId: string, workItemId: string, tag: string) => {
      setSelectedTags((prev) => prev.filter((t) => t !== tag));
    },
    []
  );

  const getSelectedWorkItems = useCallback(() => {
    const items: WorkItem[] = [];
    for (const fwi of frameWorkItems) {
      for (const item of fwi.workItems) {
        if (item.selected) {
          items.push(item);
        }
      }
    }
    return items;
  }, [frameWorkItems]);

  // Plugin 1 (team): stamp the dedup hash → Azure id for each successfully
  // created task onto the tasklist frame (via main.ts), so a re-run skips them.
  // The hash is encoded in the work item id as `task-<hash>`.
  const stampDedup = useCallback((submitResults: SubmitResult[]) => {
    const pairs = submitResults
      .filter(
        (r): r is CreateTaskResult =>
          'taskId' in r && r.success && typeof r.azureTaskId === 'number'
      )
      .map((r) => ({
        hash: r.taskId.replace(/^task-/, ''),
        azureId: r.azureTaskId as number,
      }));
    if (pairs.length > 0) {
      parent.postMessage(
        { pluginMessage: { type: 'stamp-dedup', data: pairs } },
        '*'
      );
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    // Only create NEW selected items — existing ones are handled by handleClose.
    const selectedItems = getSelectedWorkItems().filter((i) => !i.existing);
    if (selectedItems.length === 0) return;

    setAction('create');
    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      if (!hierarchyContext.userStory?.id) {
        throw new Error('No user story selected for tasks');
      }
      const tasks: TaskToSubmit[] = selectedItems.map((item) => ({
        taskId: item.id,
        title: item.title,
        description: item.description,
        tags: selectedTags,
        parentStoryId: hierarchyContext.userStory!.id,
      }));
      const submitResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        tasks
      );

      setResults(submitResults);
      stampDedup(submitResults);
      const allIds = new Set(selectedItems.map((item) => item.id));
      setSubmittedIds(allIds);

      const allSuccess = submitResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      if (err instanceof Error && err.name === 'AuthError') {
        handleSessionExpired();
      } else {
        setError(err instanceof Error ? err.message : 'Submission failed');
        setScreen('review');
      }
    }
  }, [
    getSelectedWorkItems,
    workItemType,
    selectedTags,
    hierarchyContext,
    auth.accessToken,
    azureOrg,
    azureProjectId,
    handleSessionExpired,
    stampDedup,
  ]);

  // Close the selected existing-and-open tasks: transition them to the
  // process's completed state in Azure. Results flow into the same
  // success/partial screens as creation.
  const handleClose = useCallback(async () => {
    const closeable = getSelectedWorkItems().filter(
      (i) => i.existing && !i.closed && typeof i.azureId === 'number'
    );
    if (closeable.length === 0) return;

    setAction('close');
    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      const closeResults = await closeTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        closeable.map((i) => i.azureId as number)
      );
      setResults(closeResults);
      setSubmittedIds(new Set(closeable.map((i) => i.id)));
      const allSuccess = closeResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      if (err instanceof Error && err.name === 'AuthError') {
        handleSessionExpired();
      } else {
        setError(err instanceof Error ? err.message : 'Close failed');
        setScreen('review');
      }
    }
  }, [
    getSelectedWorkItems,
    auth.accessToken,
    azureOrg,
    azureProjectId,
    handleSessionExpired,
  ]);

  const handleRetry = useCallback(async () => {
    const selectedItems = getSelectedWorkItems();
    const failedIds = results
      .filter((r) => !r.success)
      .map((r) => ('taskId' in r ? r.taskId : ''));
    const failedItems = selectedItems.filter((item) => failedIds.includes(item.id));

    if (failedItems.length === 0) return;

    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      const tasks: TaskToSubmit[] = failedItems.map((item) => ({
        taskId: item.id,
        title: item.title,
        description: item.description,
        tags: selectedTags,
        parentStoryId: hierarchyContext.userStory!.id,
      }));
      const retryResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        tasks
      );

      // Merge retried results back over the originals by taskId.
      const updatedResults = results.map((r) => {
        const id = 'taskId' in r ? r.taskId : '';
        const retried = retryResults.find((rr) => ('taskId' in rr ? rr.taskId : '') === id);
        return retried || r;
      });
      setResults(updatedResults);
      stampDedup(retryResults);

      const allIds = new Set(selectedItems.map((item) => item.id));
      setSubmittedIds(allIds);

      const allSuccess = updatedResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      if (err instanceof Error && err.name === 'AuthError') {
        handleSessionExpired();
      } else {
        setError(err instanceof Error ? err.message : 'Retry failed');
        setScreen('partial-failure');
      }
    }
  }, [
    results,
    getSelectedWorkItems,
    workItemType,
    selectedTags,
    hierarchyContext,
    auth.accessToken,
    azureOrg,
    azureProjectId,
    handleSessionExpired,
    stampDedup,
  ]);

  const handleViewInAzure = useCallback(() => {
    const url = results.find((r) => r.success)?.taskUrl;
    if (url) window.open(url, '_blank');
  }, [results]);

  const handleGoHome = useCallback(() => {
    setFrameWorkItems([]);
    setResults([]);
    setError(null);
    setHierarchyContext({});
    setCompletedFrameIds(new Set());
    setSubmittedIds(new Set());
    setScreen('home');
  }, []);

  // Get tasks for submitting screen
  const getTasksForSubmitting = useCallback(() => {
    const selectedItems = getSelectedWorkItems();
    return selectedItems.map((item) => ({
      taskId: item.id,
      title: item.title,
      description: item.description,
      tags: selectedTags,
      parentStoryId: hierarchyContext.userStory?.id || 0,
    }));
  }, [getSelectedWorkItems, selectedTags, hierarchyContext]);

  return (
    <div className="plugin-container" ref={containerRef}>
      {error && screen !== 'generating' && screen !== 'submitting' && (
        <div className="error-message">{error}</div>
      )}

      {screen === 'home' && (
        <HomeScreen
          frameCount={frameCount}
          sectionCount={sectionCount}
          onContinue={handleContinueFromHome}
          isAuthenticated={auth.isAuthenticated}
          onLogout={handleLogout}
        />
      )}

      {screen === 'connect-azure' && (
        <ConnectAzureScreen
          frameCount={frameCount}
          isAuthenticated={auth.isAuthenticated}
          onConnect={handleConnectAzure}
          onContinue={() => setScreen('select-project')}
          onDisconnect={handleDisconnect}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'select-project' && (
        <SelectProjectScreen
          accessToken={auth.accessToken!}
          workItemType={workItemType}
          savedOrg={storage.azureOrg}
          savedProjectId={storage.azureProjectId}
          savedEpicId={storage.lastEpicId}
          savedFeatureId={storage.lastFeatureId}
          savedStoryId={storage.lastStoryId}
          savedFrequentTags={storage.frequentTags}
          onContinue={handleProjectSelected}
          onSessionExpired={handleSessionExpired}
          onRefreshToken={auth.refresh}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'context' && (
        <ParseTasklistScreen
          parentTitle={parentTitle}
          onParsed={handleParsed}
          onBack={() => setScreen('select-project')}
        />
      )}

      {screen === 'review' && (
        <ReviewScreen
          frameWorkItems={frameWorkItems}
          workItemType={workItemType}
          selectedTags={selectedTags}
          parentTitle={parentTitle}
          onWorkItemUpdate={handleWorkItemUpdate}
          onWorkItemToggle={handleWorkItemToggle}
          onSelectSection={handleSelectSection}
          onRemoveTag={handleRemoveTag}
          onSubmit={handleSubmit}
          onClose={handleClose}
          onBack={() => setScreen('context')}
        />
      )}

      {screen === 'submitting' && (
        <SubmittingScreen
          tasks={getTasksForSubmitting()}
          workItemType={workItemType}
          action={action}
          completedTaskIds={submittedIds}
        />
      )}

      {screen === 'success' && (
        <SuccessScreen
          results={results}
          workItemType={workItemType}
          action={action}
          parentTitle={parentTitle}
          tags={selectedTags}
          onViewInAzure={handleViewInAzure}
          onGoHome={handleGoHome}
        />
      )}

      {screen === 'partial-failure' && (
        <PartialFailureScreen
          results={results}
          workItemType={workItemType}
          onRetry={handleRetry}
          onViewSuccessful={handleViewInAzure}
        />
      )}
    </div>
  );
}
