import React, { useState, useCallback } from 'react';
import {
  Screen,
  FrameData,
  FrameWorkItems,
  WorkItem,
  WorkItemType,
  HierarchyContext,
  TaskToSubmit,
  UserStoryToSubmit,
  CreateTaskResult,
  CreateUserStoryResult,
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
import { useAutoResize } from './hooks/useAutoResize';
import { generateWorkItems, createTasks, createUserStories } from './services/api';
import { HomeScreen } from './screens/HomeScreen';
import { WorkItemTypeScreen } from './screens/WorkItemTypeScreen';
import { ContextScreen } from './screens/ContextScreen';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { ConnectAzureScreen } from './screens/ConnectAzureScreen';
import { SelectParentScreen } from './screens/SelectParentScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SubmittingScreen } from './screens/SubmittingScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { PartialFailureScreen } from './screens/PartialFailureScreen';

// Union type for results (tasks or user stories)
type SubmitResult = CreateTaskResult | CreateUserStoryResult;

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);

  const { frames, sections, frameCount, sectionCount, requestFrames } = useFrameSelection();
  const auth = useAzureAuth();
  const { storage, updateStorage } = usePluginStorage();
  const containerRef = useAutoResize();

  // Work item type and hierarchy
  const [workItemType, setWorkItemType] = useState<WorkItemType>(
    storage.lastWorkItemType || 'Task'
  );
  const [hierarchyContext, setHierarchyContext] = useState<HierarchyContext>({});

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

  // Flow: home → work-item-type → connect-azure → select-parent → context → generating → review → submitting → success

  const handleContinueFromHome = useCallback(() => {
    requestFrames();
    setScreen('work-item-type');
  }, [requestFrames]);

  const handleSelectWorkItemType = useCallback((type: WorkItemType) => {
    setWorkItemType(type);
    updateStorage({ lastWorkItemType: type });

    // Check if already authenticated
    if (auth.isAuthenticated) {
      setScreen('select-parent');
    } else {
      setScreen('connect-azure');
    }
  }, [auth.isAuthenticated, updateStorage]);

  const handleConnectAzure = useCallback(() => {
    auth.startAuth(() => {
      setScreen('select-parent');
    });
  }, [auth]);

  const handleSessionExpired = useCallback(() => {
    auth.logout();
    setScreen('connect-azure');
  }, [auth]);

  const handleParentSelected = useCallback(
    (selection: {
      org: string;
      projectId: string;
      hierarchyContext: HierarchyContext;
      selectedTags: string[];
      parentTitle: string;
    }) => {
      setAzureOrg(selection.org);
      setAzureProjectId(selection.projectId);
      setHierarchyContext(selection.hierarchyContext);
      setSelectedTags(selection.selectedTags);
      setParentTitle(selection.parentTitle);

      // Save to storage
      updateStorage({
        azureOrg: selection.org,
        azureProjectId: selection.projectId,
        lastEpicId: selection.hierarchyContext.epic?.id,
        lastStoryId: selection.hierarchyContext.userStory?.id,
        frequentTags: selection.selectedTags.slice(0, 5),
      });

      setScreen('context');
    },
    [updateStorage]
  );

  const handleGenerate = useCallback(
    async (context?: string) => {
      setScreen('generating');
      setCompletedFrameIds(new Set());
      setError(null);

      try {
        const { frameWorkItems: generated } = await generateWorkItems(
          frames,
          workItemType,
          context,
          hierarchyContext
        );
        setFrameWorkItems(generated);
        setCompletedFrameIds(new Set(generated.map((fwi) => fwi.frameId)));
        setScreen('review');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
        setScreen('context');
      }
    },
    [frames, workItemType, hierarchyContext]
  );

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

  const handleSubmit = useCallback(async () => {
    const selectedItems = getSelectedWorkItems();
    if (selectedItems.length === 0) return;

    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      let submitResults: SubmitResult[];

      if (workItemType === 'UserStory') {
        // Create user stories
        const stories: UserStoryToSubmit[] = selectedItems.map((item) => ({
          workItemId: item.id,
          title: item.title,
          description: item.description,
          acceptanceCriteria: item.acceptanceCriteria,
          tags: selectedTags,
          parentEpicId: hierarchyContext.epic!.id,
        }));
        submitResults = await createUserStories(
          auth.accessToken!,
          azureOrg,
          azureProjectId,
          stories
        );
      } else {
        // Create tasks
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
      }

      setResults(submitResults);
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
  ]);

  const handleRetry = useCallback(async () => {
    const selectedItems = getSelectedWorkItems();
    const failedIds = results.filter((r) => !r.success).map((r) =>
      'workItemId' in r ? r.workItemId : r.taskId
    );
    const failedItems = selectedItems.filter((item) => failedIds.includes(item.id));

    if (failedItems.length === 0) return;

    setScreen('submitting');
    setSubmittedIds(new Set());

    try {
      let retryResults: SubmitResult[];

      if (workItemType === 'UserStory') {
        const stories: UserStoryToSubmit[] = failedItems.map((item) => ({
          workItemId: item.id,
          title: item.title,
          description: item.description,
          acceptanceCriteria: item.acceptanceCriteria,
          tags: selectedTags,
          parentEpicId: hierarchyContext.epic!.id,
        }));
        retryResults = await createUserStories(
          auth.accessToken!,
          azureOrg,
          azureProjectId,
          stories
        );
      } else {
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
      }

      // Merge results
      const updatedResults = results.map((r) => {
        const id = 'workItemId' in r ? r.workItemId : r.taskId;
        const retryResult = retryResults.find((rr) =>
          ('workItemId' in rr ? rr.workItemId : rr.taskId) === id
        );
        return retryResult || r;
      });
      setResults(updatedResults);

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

  const handleCreateMore = useCallback(() => {
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
        />
      )}

      {screen === 'work-item-type' && (
        <WorkItemTypeScreen
          frameCount={frameCount}
          sectionCount={sectionCount}
          savedWorkItemType={storage.lastWorkItemType}
          onSelect={handleSelectWorkItemType}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'connect-azure' && (
        <ConnectAzureScreen
          frameCount={frameCount}
          isAuthenticated={auth.isAuthenticated}
          onConnect={handleConnectAzure}
          onContinue={() => setScreen('select-parent')}
          onBack={() => setScreen('work-item-type')}
        />
      )}

      {screen === 'select-parent' && (
        <SelectParentScreen
          accessToken={auth.accessToken!}
          workItemType={workItemType}
          workItemCount={frameCount}
          savedOrg={storage.azureOrg}
          savedProjectId={storage.azureProjectId}
          savedEpicId={storage.lastEpicId}
          savedStoryId={storage.lastStoryId}
          savedFrequentTags={storage.frequentTags}
          onContinue={handleParentSelected}
          onSessionExpired={handleSessionExpired}
          onRefreshToken={auth.refresh}
          onBack={() => setScreen('connect-azure')}
        />
      )}

      {screen === 'context' && (
        <ContextScreen
          frames={frames}
          workItemType={workItemType}
          parentTitle={parentTitle}
          onGenerate={handleGenerate}
          onBack={() => setScreen('select-parent')}
        />
      )}

      {screen === 'generating' && (
        <GeneratingScreen
          frames={frames}
          workItemType={workItemType}
          completedFrameIds={completedFrameIds}
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
          onCreateMore={handleCreateMore}
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
