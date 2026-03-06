import React, { useState, useCallback } from 'react';
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
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
import { useAutoResize } from './hooks/useAutoResize';
import { generateWorkItems, createTasks, createUserStories, createEpics, createFeatures } from './services/api';
import { HomeScreen } from './screens/HomeScreen';
import { ConnectAzureScreen } from './screens/ConnectAzureScreen';
import { SelectProjectScreen } from './screens/SelectProjectScreen';
import { WorkItemTypeScreen } from './screens/WorkItemTypeScreen';
import { SelectParentScreen } from './screens/SelectParentScreen';
import { ContextScreen } from './screens/ContextScreen';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SubmittingScreen } from './screens/SubmittingScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { PartialFailureScreen } from './screens/PartialFailureScreen';

// Union type for results (all work item types)
type SubmitResult = CreateTaskResult | CreateUserStoryResult | CreateEpicResult | CreateFeatureResult;

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);

  const { frames, sections, frameCount, sectionCount, requestFrames } = useFrameSelection();
  const auth = useAzureAuth();
  const { storage, updateStorage } = usePluginStorage();
  const containerRef = useAutoResize();

  // Work item type and hierarchy
  const [workItemType, setWorkItemType] = useState<WorkItemType>(
    storage.lastWorkItemType || 'UserStory'
  );
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

  // Flow: home → work-item-type → connect-azure → select-parent → context → generating → review → submitting → success

  const handleContinueFromHome = useCallback(() => {
    requestFrames();
    // Connect to Azure first so we can detect available work item types
    if (auth.isAuthenticated) {
      setScreen('select-project');
    } else {
      setScreen('connect-azure');
    }
  }, [requestFrames, auth.isAuthenticated]);

  const handleConnectAzure = useCallback(() => {
    auth.startAuth(() => {
      setScreen('select-project');
    });
  }, [auth]);

  // Called after selecting org/project to go to work item type selection
  const handleProjectSelected = useCallback(
    (selection: {
      org: string;
      projectId: string;
      availableTypes: WorkItemTypeInfo[];
    }) => {
      setAzureOrg(selection.org);
      setAzureProjectId(selection.projectId);
      setAvailableTypes(selection.availableTypes);

      // Save to storage
      updateStorage({
        azureOrg: selection.org,
        azureProjectId: selection.projectId,
      });

      setScreen('work-item-type');
    },
    [updateStorage]
  );

  const handleSelectWorkItemType = useCallback((type: WorkItemType) => {
    setWorkItemType(type);
    updateStorage({ lastWorkItemType: type });

    // For Epics, no parent needed - go straight to context
    if (type === 'Epic') {
      setHierarchyContext({});
      setParentTitle('');
      setScreen('context');
    } else {
      setScreen('select-parent');
    }
  }, [updateStorage]);

  const handleSessionExpired = useCallback(() => {
    auth.logout();
    setScreen('connect-azure');
  }, [auth]);

  const handleParentSelected = useCallback(
    (selection: {
      hierarchyContext: HierarchyContext;
      selectedTags: string[];
      parentTitle: string;
    }) => {
      setHierarchyContext(selection.hierarchyContext);
      setSelectedTags(selection.selectedTags);
      setParentTitle(selection.parentTitle);

      // Save to storage
      updateStorage({
        lastEpicId: selection.hierarchyContext.epic?.id,
        lastFeatureId: selection.hierarchyContext.feature?.id,
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

      switch (workItemType) {
        case 'Epic': {
          // Create epics
          const epics: EpicToSubmit[] = selectedItems.map((item) => ({
            workItemId: item.id,
            title: item.title,
            description: item.description,
            acceptanceCriteria: item.acceptanceCriteria,
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
            acceptanceCriteria: item.acceptanceCriteria,
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
            acceptanceCriteria: item.acceptanceCriteria,
            tags: selectedTags,
            parentEpicId: parentId,
          }));
          submitResults = await createUserStories(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            stories
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
            acceptanceCriteria: item.acceptanceCriteria,
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
            acceptanceCriteria: item.acceptanceCriteria,
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
            acceptanceCriteria: item.acceptanceCriteria,
            tags: selectedTags,
            parentEpicId: parentId!,
          }));
          retryResults = await createUserStories(
            auth.accessToken!,
            azureOrg,
            azureProjectId,
            stories
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
          availableTypes={availableTypes}
          onSelect={handleSelectWorkItemType}
          onBack={() => setScreen('select-project')}
        />
      )}

      {screen === 'connect-azure' && (
        <ConnectAzureScreen
          frameCount={frameCount}
          isAuthenticated={auth.isAuthenticated}
          onConnect={handleConnectAzure}
          onContinue={() => setScreen('select-project')}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'select-project' && (
        <SelectProjectScreen
          accessToken={auth.accessToken!}
          savedOrg={storage.azureOrg}
          savedProjectId={storage.azureProjectId}
          onContinue={handleProjectSelected}
          onSessionExpired={handleSessionExpired}
          onRefreshToken={auth.refresh}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'select-parent' && (
        <SelectParentScreen
          accessToken={auth.accessToken!}
          workItemType={workItemType}
          org={azureOrg}
          projectId={azureProjectId}
          savedEpicId={storage.lastEpicId}
          savedFeatureId={storage.lastFeatureId}
          savedStoryId={storage.lastStoryId}
          savedFrequentTags={storage.frequentTags}
          availableTypes={availableTypes}
          onContinue={handleParentSelected}
          onSessionExpired={handleSessionExpired}
          onRefreshToken={auth.refresh}
          onBack={() => setScreen('work-item-type')}
        />
      )}

      {screen === 'context' && (
        <ContextScreen
          frames={frames}
          workItemType={workItemType}
          parentTitle={parentTitle}
          onGenerate={handleGenerate}
          onBack={() => setScreen(workItemType === 'Epic' ? 'work-item-type' : 'select-parent')}
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
