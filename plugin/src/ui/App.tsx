import React, { useState, useCallback } from 'react';
import {
  Screen,
  FrameData,
  FrameTasks,
  TaskItem,
  TaskToSubmit,
  CreateTaskResult,
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
import { useAutoResize } from './hooks/useAutoResize';
import { generateTasks, createTasks } from './services/api';
import { HomeScreen } from './screens/HomeScreen';
import { ContextScreen } from './screens/ContextScreen';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { ConnectAzureScreen } from './screens/ConnectAzureScreen';
import { SelectStoryScreen } from './screens/SelectStoryScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SubmittingScreen } from './screens/SubmittingScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { PartialFailureScreen } from './screens/PartialFailureScreen';

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>('home');
  const [error, setError] = useState<string | null>(null);

  const { frames, frameCount, requestFrames } = useFrameSelection();
  const auth = useAzureAuth();
  const { storage, updateStorage } = usePluginStorage();
  const containerRef = useAutoResize();

  const [frameTasks, setFrameTasks] = useState<FrameTasks[]>([]);
  const [completedFrameIds, setCompletedFrameIds] = useState<Set<string>>(
    new Set()
  );
  const [storyTitle, setStoryTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [parentStoryId, setParentStoryId] = useState<number>(0);
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProjectId, setAzureProjectId] = useState('');
  const [submittedTaskIds, setSubmittedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [results, setResults] = useState<CreateTaskResult[]>([]);

  const handleContinueFromHome = useCallback(() => {
    requestFrames();
    setScreen('context');
  }, [requestFrames]);

  const handleGenerate = useCallback(
    async (context?: string) => {
      setScreen('generating');
      setCompletedFrameIds(new Set());
      setError(null);

      try {
        const generatedFrameTasks = await generateTasks(frames, context);
        setFrameTasks(generatedFrameTasks);
        setCompletedFrameIds(new Set(generatedFrameTasks.map((ft) => ft.frameId)));

        if (auth.isAuthenticated) {
          setScreen('select-story');
        } else {
          setScreen('connect-azure');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
        setScreen('context');
      }
    },
    [frames, auth.isAuthenticated]
  );

  const handleConnectAzure = useCallback(() => {
    auth.startAuth();
  }, [auth]);

  const getTotalTaskCount = useCallback(() => {
    return frameTasks.reduce((sum, ft) => sum + ft.tasks.length, 0);
  }, [frameTasks]);

  const handleStorySelected = useCallback(
    (selection: {
      org: string;
      projectId: string;
      storyId: number;
      storyTitle: string;
      selectedTags: string[];
    }) => {
      setAzureOrg(selection.org);
      setAzureProjectId(selection.projectId);
      setStoryTitle(selection.storyTitle);
      setSelectedTags(selection.selectedTags);
      setParentStoryId(selection.storyId);

      updateStorage({
        azureOrg: selection.org,
        azureProjectId: selection.projectId,
        lastStoryId: selection.storyId,
        frequentTags: selection.selectedTags.slice(0, 5),
      });

      setScreen('review');
    },
    [updateStorage]
  );

  const handleTaskUpdate = useCallback(
    (frameId: string, taskId: string, updates: Partial<TaskItem>) => {
      setFrameTasks((prev) =>
        prev.map((ft) =>
          ft.frameId === frameId
            ? {
                ...ft,
                tasks: ft.tasks.map((task) =>
                  task.id === taskId ? { ...task, ...updates } : task
                ),
              }
            : ft
        )
      );
    },
    []
  );

  const handleTaskToggle = useCallback((frameId: string, taskId: string) => {
    setFrameTasks((prev) =>
      prev.map((ft) =>
        ft.frameId === frameId
          ? {
              ...ft,
              tasks: ft.tasks.map((task) =>
                task.id === taskId ? { ...task, selected: !task.selected } : task
              ),
            }
          : ft
      )
    );
  }, []);

  const handleRemoveTag = useCallback(
    (frameId: string, taskId: string, tag: string) => {
      // For now, tags are shared across all tasks, so we remove from selectedTags
      setSelectedTags((prev) => prev.filter((t) => t !== tag));
    },
    []
  );

  const getSelectedTasks = useCallback((): TaskToSubmit[] => {
    const tasks: TaskToSubmit[] = [];
    for (const ft of frameTasks) {
      for (const task of ft.tasks) {
        if (task.selected) {
          tasks.push({
            taskId: task.id,
            title: task.title,
            description: task.description,
            tags: selectedTags,
            parentStoryId,
          });
        }
      }
    }
    return tasks;
  }, [frameTasks, selectedTags, parentStoryId]);

  const handleSubmit = useCallback(async () => {
    const tasksToSubmit = getSelectedTasks();
    if (tasksToSubmit.length === 0) return;

    setScreen('submitting');
    setSubmittedTaskIds(new Set());

    try {
      const taskResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        tasksToSubmit
      );
      setResults(taskResults);

      const allTaskIds = new Set(tasksToSubmit.map((t) => t.taskId));
      setSubmittedTaskIds(allTaskIds);

      const allSuccess = taskResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setScreen('review');
    }
  }, [getSelectedTasks, auth.accessToken, azureOrg, azureProjectId]);

  const handleRetry = useCallback(async () => {
    const tasksToSubmit = getSelectedTasks();
    const failedTaskIds = results
      .filter((r) => !r.success)
      .map((r) => r.taskId);
    const failedTasks = tasksToSubmit.filter((t) =>
      failedTaskIds.includes(t.taskId)
    );

    if (failedTasks.length === 0) return;

    setScreen('submitting');
    setSubmittedTaskIds(new Set());

    try {
      const retryResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        failedTasks
      );

      // Merge results
      const updatedResults = results.map((r) => {
        const retryResult = retryResults.find((rr) => rr.taskId === r.taskId);
        return retryResult || r;
      });
      setResults(updatedResults);

      const allTaskIds = new Set(tasksToSubmit.map((t) => t.taskId));
      setSubmittedTaskIds(allTaskIds);

      const allSuccess = updatedResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
      setScreen('partial-failure');
    }
  }, [results, getSelectedTasks, auth.accessToken, azureOrg, azureProjectId]);

  const handleViewInAzure = useCallback(() => {
    const firstSuccess = results.find((r) => r.success && r.taskUrl);
    if (firstSuccess?.taskUrl) {
      window.open(firstSuccess.taskUrl, '_blank');
    }
  }, [results]);

  const handleCreateMore = useCallback(() => {
    setFrameTasks([]);
    setResults([]);
    setError(null);
    setScreen('home');
  }, []);

  // Convert frameTasks to flat array for screens that need it
  const flatTasksForDisplay = frameTasks.flatMap((ft) =>
    ft.tasks.map((task) => ({
      frameId: ft.frameId,
      frameName: ft.frameName,
      title: task.title,
      description: task.description,
    }))
  );

  return (
    <div className="plugin-container" ref={containerRef}>
      {error && screen !== 'generating' && screen !== 'submitting' && (
        <div className="error-message">{error}</div>
      )}

      {screen === 'home' && (
        <HomeScreen
          frameCount={frameCount}
          onContinue={handleContinueFromHome}
        />
      )}

      {screen === 'context' && (
        <ContextScreen frames={frames} onGenerate={handleGenerate} />
      )}

      {screen === 'generating' && (
        <GeneratingScreen
          frames={frames}
          completedFrameIds={completedFrameIds}
        />
      )}

      {screen === 'connect-azure' && (
        <ConnectAzureScreen
          frameTasks={frameTasks}
          isAuthenticated={auth.isAuthenticated}
          onTaskToggle={handleTaskToggle}
          onConnect={handleConnectAzure}
          onContinue={() => setScreen('select-story')}
        />
      )}

      {screen === 'select-story' && (
        <SelectStoryScreen
          accessToken={auth.accessToken!}
          taskCount={getTotalTaskCount()}
          savedOrg={storage.azureOrg}
          savedProjectId={storage.azureProjectId}
          savedStoryId={storage.lastStoryId}
          savedFrequentTags={storage.frequentTags}
          onContinue={handleStorySelected}
        />
      )}

      {screen === 'review' && (
        <ReviewScreen
          frameTasks={frameTasks}
          selectedTags={selectedTags}
          storyTitle={storyTitle}
          onTaskUpdate={handleTaskUpdate}
          onTaskToggle={handleTaskToggle}
          onRemoveTag={handleRemoveTag}
          onSubmit={handleSubmit}
          onBack={() => setScreen('select-story')}
        />
      )}

      {screen === 'submitting' && (
        <SubmittingScreen
          tasks={getSelectedTasks()}
          completedTaskIds={submittedTaskIds}
        />
      )}

      {screen === 'success' && (
        <SuccessScreen
          results={results}
          storyTitle={storyTitle}
          tags={selectedTags}
          onViewInAzure={handleViewInAzure}
          onCreateMore={handleCreateMore}
        />
      )}

      {screen === 'partial-failure' && (
        <PartialFailureScreen
          results={results}
          onRetry={handleRetry}
          onViewSuccessful={handleViewInAzure}
        />
      )}
    </div>
  );
}
