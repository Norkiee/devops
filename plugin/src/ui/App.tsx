import React, { useState, useCallback, useRef } from 'react';
import {
  Screen,
  FrameData,
  FrameWorkItems,
  WorkItem,
  WorkItemType,
  WorkItemTypeInfo,
  HierarchyContext,
  TaskToSubmit,
  UserStoryToSubmit,
  EpicToSubmit,
  FeatureToSubmit,
  CreateTaskResult,
  CreateUserStoryResult,
  CreateEpicResult,
  CreateFeatureResult,
  isStoryLikeType,
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
import { useAutoResize } from './hooks/useAutoResize';
import { createTasks, createUserStories, createEpics, createFeatures, recordFeedback, checkWorkItemsExist, FeedbackItem } from './services/api';
import { HomeScreen } from './screens/HomeScreen';
import { ConnectAzureScreen } from './screens/ConnectAzureScreen';
import { SelectProjectScreen } from './screens/SelectProjectScreen';
import { ParseTasklistScreen, ParseResult } from './screens/ParseTasklistScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SubmittingScreen } from './screens/SubmittingScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { PartialFailureScreen } from './screens/PartialFailureScreen';

// Union type for results (all work item types)
type SubmitResult = CreateTaskResult | CreateUserStoryResult | CreateEpicResult | CreateFeatureResult;

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);

  const { frames, sections, frameCount, sectionCount, fileKey, requestFrames } = useFrameSelection();
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
  // Snapshot of items as first generated (id → title/description), so submit can
  // detect which ones the user edited before pushing.
  const originalItemsRef = useRef<Map<string, { title: string; description?: string }>>(new Map());

  // Azure connection state
  const [parentTitle, setParentTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProjectId, setAzureProjectId] = useState('');

  // Submission state
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SubmitResult[]>([]);

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
    let items = result.items;

    // Reconcile the dedup ledger with Azure: a Task deleted in Azure should
    // re-list as new. Verify the stored ids still exist; for any that don't,
    // flip the line back to "new" and prune it from the frame's dedup map.
    const createdWithId = items.filter(
      (i) => i.alreadyCreated && typeof i.azureId === 'number'
    );
    if (createdWithId.length > 0 && auth.accessToken && azureOrg) {
      try {
        const existing = new Set(
          await checkWorkItemsExist(
            auth.accessToken,
            azureOrg,
            createdWithId.map((i) => i.azureId as number)
          )
        );
        const staleHashes: string[] = [];
        items = items.map((i) => {
          if (i.alreadyCreated && typeof i.azureId === 'number' && !existing.has(i.azureId)) {
            staleHashes.push(i.hash);
            return { ...i, alreadyCreated: false };
          }
          return i;
        });
        if (staleHashes.length > 0) {
          parent.postMessage(
            { pluginMessage: { type: 'prune-dedup', data: staleHashes } },
            '*'
          );
        }
      } catch {
        // Best-effort: if the check fails, trust the local ledger as-is.
      }
    }

    // Surface new (not-yet-created) tasks at the top so they're easy to act on;
    // already-created lines sink to the bottom. Stable sort keeps the original
    // tasklist order within each group.
    const ordered = [...items].sort(
      (a, b) => Number(a.alreadyCreated) - Number(b.alreadyCreated)
    );
    const fwi: FrameWorkItems = {
      frameId: result.frameId,
      frameName: result.frameName,
      workItems: ordered.map((item) => ({
        id: `task-${item.hash}`,
        title: item.title,
        selected: !item.alreadyCreated,
      })),
    };
    setFrameWorkItems([fwi]);
    setCompletedFrameIds(new Set([result.frameId]));

    const originals = new Map<string, { title: string; description?: string }>();
    for (const item of fwi.workItems) {
      originals.set(item.id, { title: item.title, description: item.description });
    }
    originalItemsRef.current = originals;
    setError(null);
    setScreen('review');
  }, [auth.accessToken, azureOrg]);

  const getTotalWorkItemCount = useCallback(() => {
    return frameWorkItems.reduce((sum, fwi) => sum + fwi.workItems.length, 0);
  }, [frameWorkItems]);

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

  const handleWorkItemToggle = useCallback((frameId: string, workItemId: string) => {
    setFrameWorkItems((prev) =>
      prev.map((fwi) =>
        fwi.frameId === frameId
          ? {
              ...fwi,
              workItems: fwi.workItems.map((item) =>
                item.id === workItemId ? { ...item, selected: !item.selected } : item
              ),
            }
          : fwi
      )
    );
  }, []);

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

  // Reports the outcome of a submit pass to the memory layer (best-effort).
  // pushed = landed in Azure, rejected = deselected, edited = changed pre-submit,
  // approved = selected but not successfully pushed.
  const sendFeedback = useCallback(
    (submitResults: SubmitResult[]) => {
      const selectedIds = new Set(getSelectedWorkItems().map((i) => i.id));
      const resultById = new Map<string, { success: boolean; azureId?: number }>();
      for (const r of submitResults) {
        const id = 'workItemId' in r ? r.workItemId : 'taskId' in r ? r.taskId : '';
        const azureId =
          'azureTaskId' in r ? r.azureTaskId : 'azureId' in r ? r.azureId : undefined;
        if (id) resultById.set(id, { success: r.success, azureId });
      }

      const allItems = frameWorkItems.flatMap((fwi) => fwi.workItems);
      const feedback: FeedbackItem[] = allItems.map((item) => {
        if (!selectedIds.has(item.id)) {
          return { workItemId: item.id, status: 'rejected' };
        }
        const res = resultById.get(item.id);
        if (res?.success) {
          return { workItemId: item.id, status: 'pushed', azureId: res.azureId };
        }
        const orig = originalItemsRef.current.get(item.id);
        const edited =
          !!orig && (orig.title !== item.title || orig.description !== item.description);
        return { workItemId: item.id, status: edited ? 'edited' : 'approved' };
      });

      void recordFeedback(feedback);
    },
    [getSelectedWorkItems, frameWorkItems]
  );

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
    const selectedItems = getSelectedWorkItems();
    if (selectedItems.length === 0) return;

    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      let submitResults: SubmitResult[];

      switch (workItemType) {
        case 'Epic': {
          // Create epics
          const epics: EpicToSubmit[] = selectedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            tags: selectedTags,
          }));
          submitResults = await createEpics(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            epics
          );
          break;
        }
        case 'Feature': {
          // Create features
          const features: FeatureToSubmit[] = selectedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            parentEpicId: hierarchyContext.epic?.id,
            tags: selectedTags,
          }));
          submitResults = await createFeatures(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            features
          );
          break;
        }
        case 'UserStory': {
          // Create user stories - parent can be epic or feature
          const parentId = hierarchyContext.feature?.id || hierarchyContext.epic?.id;
          if (!parentId) {
            throw new Error('No parent selected for user stories');
          }
          const stories: UserStoryToSubmit[] = selectedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            tags: selectedTags,
            parentEpicId: parentId,
          }));
          // Find the correct work item type name (User Story, Product Backlog Item, etc.)
          const storyTypeName = availableTypes.find((t) => isStoryLikeType(t.name))?.name;
          submitResults = await createUserStories(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            stories,
            storyTypeName
          );
          break;
        }
        case 'Task':
        default: {
          // Create tasks
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
          submitResults = await createTasks(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            tasks
          );
          break;
        }
      }

      setResults(submitResults);
      sendFeedback(submitResults);
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
    sendFeedback,
    stampDedup,
  ]);

  const handleRetry = useCallback(async () => {
    const selectedItems = getSelectedWorkItems();
    const failedIds = results.filter((r) => !r.success).map((r) =>
      'workItemId' in r ? r.workItemId : ('taskId' in r ? r.taskId : '')
    );
    const failedItems = selectedItems.filter((item) => failedIds.includes(item.id));

    if (failedItems.length === 0) return;

    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      let retryResults: SubmitResult[];

      switch (workItemType) {
        case 'Epic': {
          const epics: EpicToSubmit[] = failedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            tags: selectedTags,
          }));
          retryResults = await createEpics(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            epics
          );
          break;
        }
        case 'Feature': {
          const features: FeatureToSubmit[] = failedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            parentEpicId: hierarchyContext.epic?.id,
            tags: selectedTags,
          }));
          retryResults = await createFeatures(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            features
          );
          break;
        }
        case 'UserStory': {
          const parentId = hierarchyContext.feature?.id || hierarchyContext.epic?.id;
          const stories: UserStoryToSubmit[] = failedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            tags: selectedTags,
            parentEpicId: parentId!,
          }));
          // Find the correct work item type name
          const storyTypeName = availableTypes.find((t) => isStoryLikeType(t.name))?.name;
          retryResults = await createUserStories(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            stories,
            storyTypeName
          );
          break;
        }
        case 'Task':
        default: {
          const tasks: TaskToSubmit[] = failedItems.map((item) => ({
            taskId: item.id,
            title: item.title,
            description: item.description,
            tags: selectedTags,
            parentStoryId: hierarchyContext.userStory!.id,
          }));
          retryResults = await createTasks(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            tasks
          );
          break;
        }
      }

      // Merge results
      const updatedResults = results.map((r) => {
        const id = 'workItemId' in r ? r.workItemId : ('taskId' in r ? r.taskId : '');
        const retryResult = retryResults.find((rr) =>
          ('workItemId' in rr ? rr.workItemId : ('taskId' in rr ? rr.taskId : '')) === id
        );
        return retryResult || r;
      });
      setResults(updatedResults);
      sendFeedback(updatedResults);
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
    sendFeedback,
    stampDedup,
  ]);

  const handleViewInAzure = useCallback(() => {
    const firstSuccess = results.find((r) => r.success);
    if (firstSuccess) {
      // Handle both CreateUserStoryResult (url) and CreateTaskResult (taskUrl)
      const url = 'url' in firstSuccess ? firstSuccess.url : ('taskUrl' in firstSuccess ? firstSuccess.taskUrl : undefined);
      if (url) {
        window.open(url, '_blank');
      }
    }
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
          onRemoveTag={handleRemoveTag}
          onSubmit={handleSubmit}
          onBack={() => setScreen('context')}
        />
      )}

      {screen === 'submitting' && (
        <SubmittingScreen
          tasks={getTasksForSubmitting()}
          workItemType={workItemType}
          completedTaskIds={submittedIds}
        />
      )}

      {screen === 'success' && (
        <SuccessScreen
          results={results}
          workItemType={workItemType}
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
