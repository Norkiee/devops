import React, { useState, useCallback } from 'react';
import {
  Screen,
  FrameData,
  GeneratedTask,
  TaskToSubmit,
  CreateTaskResult,
} from './types';
import { useFrameSelection } from './hooks/useFrameSelection';
import { useAzureAuth } from './hooks/useAzureAuth';
import { usePluginStorage } from './hooks/usePluginStorage';
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

  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([]);
  const [completedFrameIds, setCompletedFrameIds] = useState<Set<string>>(
    new Set()
  );
  const [tasksToSubmit, setTasksToSubmit] = useState<TaskToSubmit[]>([]);
  const [storyTitle, setStoryTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProjectId, setAzureProjectId] = useState('');
  const [submittedIndices, setSubmittedIndices] = useState<Set<number>>(
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
        const tasks = await generateTasks(frames, context);
        setGeneratedTasks(tasks);
        setCompletedFrameIds(new Set(tasks.map((t) => t.frameId)));

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

      updateStorage({
        azureOrg: selection.org,
        azureProjectId: selection.projectId,
        lastStoryId: selection.storyId,
        frequentTags: selection.selectedTags.slice(0, 5),
      });

      const toSubmit: TaskToSubmit[] = generatedTasks.map((task) => ({
        frameId: task.frameId,
        frameName: task.frameName,
        title: task.title,
        description: task.description,
        tags: selection.selectedTags,
        parentStoryId: selection.storyId,
      }));
      setTasksToSubmit(toSubmit);
      setScreen('review');
    },
    [generatedTasks, updateStorage]
  );

  const handleTaskChange = useCallback(
    (index: number, updates: Partial<TaskToSubmit>) => {
      setTasksToSubmit((prev) =>
        prev.map((task, i) => (i === index ? { ...task, ...updates } : task))
      );
    },
    []
  );

  const handleRemoveTag = useCallback(
    (taskIndex: number, tag: string) => {
      setTasksToSubmit((prev) =>
        prev.map((task, i) =>
          i === taskIndex
            ? { ...task, tags: task.tags.filter((t) => t !== tag) }
            : task
        )
      );
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    setScreen('submitting');
    setSubmittedIndices(new Set());

    try {
      const taskResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        tasksToSubmit
      );
      setResults(taskResults);

      const allIndices = new Set(taskResults.map((_, i) => i));
      setSubmittedIndices(allIndices);

      const allSuccess = taskResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setScreen('review');
    }
  }, [auth.accessToken, azureOrg, azureProjectId, tasksToSubmit]);

  const handleRetry = useCallback(async () => {
    const failedIndices = results
      .map((r, i) => (!r.success ? i : -1))
      .filter((i) => i !== -1);
    const failedTasks = failedIndices.map((i) => tasksToSubmit[i]);

    if (failedTasks.length === 0) return;

    setScreen('submitting');
    setSubmittedIndices(new Set());

    try {
      const retryResults = await createTasks(
        auth.accessToken!,
        azureOrg,
        azureProjectId,
        failedTasks
      );

      const updatedResults = [...results];
      failedIndices.forEach((originalIndex, retryIndex) => {
        updatedResults[originalIndex] = retryResults[retryIndex];
      });
      setResults(updatedResults);

      const allIndices = new Set(updatedResults.map((_, i) => i));
      setSubmittedIndices(allIndices);

      const allSuccess = updatedResults.every((r) => r.success);
      setScreen(allSuccess ? 'success' : 'partial-failure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
      setScreen('partial-failure');
    }
  }, [results, tasksToSubmit, auth.accessToken, azureOrg, azureProjectId]);

  const handleViewInAzure = useCallback(() => {
    const firstSuccess = results.find((r) => r.success && r.taskUrl);
    if (firstSuccess?.taskUrl) {
      window.open(firstSuccess.taskUrl, '_blank');
    }
  }, [results]);

  const handleCreateMore = useCallback(() => {
    setGeneratedTasks([]);
    setTasksToSubmit([]);
    setResults([]);
    setError(null);
    setScreen('home');
  }, []);

  return (
    <div className="plugin-container">
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
          tasks={generatedTasks}
          isAuthenticated={auth.isAuthenticated}
          onConnect={handleConnectAzure}
          onContinue={() => setScreen('select-story')}
        />
      )}

      {screen === 'select-story' && (
        <SelectStoryScreen
          accessToken={auth.accessToken!}
          taskCount={generatedTasks.length}
          savedOrg={storage.azureOrg}
          savedProjectId={storage.azureProjectId}
          savedStoryId={storage.lastStoryId}
          savedFrequentTags={storage.frequentTags}
          onContinue={handleStorySelected}
        />
      )}

      {screen === 'review' && (
        <ReviewScreen
          tasks={tasksToSubmit}
          storyTitle={storyTitle}
          onTaskChange={handleTaskChange}
          onRemoveTag={handleRemoveTag}
          onSubmit={handleSubmit}
          onBack={() => setScreen('select-story')}
        />
      )}

      {screen === 'submitting' && (
        <SubmittingScreen
          tasks={tasksToSubmit}
          completedIndices={submittedIndices}
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
