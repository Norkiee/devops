import React, { useState, useEffect } from 'react';
import { WorkItemType, AzureProject, AzureStory, HierarchyContext, AzureWorkItemDetails } from '../types';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Tag } from '../components/Tag';
import {
  fetchOrgs,
  fetchProjects,
  fetchEpics,
  fetchStoriesByEpic,
  fetchWorkItemDetails,
  fetchTags,
  AuthError,
} from '../services/api';

interface SelectParentScreenProps {
  accessToken: string;
  workItemType: WorkItemType;
  workItemCount: number;
  savedOrg?: string;
  savedProjectId?: string;
  savedEpicId?: number;
  savedStoryId?: number;
  savedFrequentTags?: string[];
  onContinue: (selection: {
    org: string;
    projectId: string;
    hierarchyContext: HierarchyContext;
    selectedTags: string[];
    parentTitle: string;
  }) => void;
  onSessionExpired: () => void;
  onRefreshToken: () => Promise<void>;
  onBack: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  infoBox: {
    background: '#f3e8ff',
    border: '1px solid #d8b4fe',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '12px',
    color: '#6b21a8',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  infoIcon: {
    flexShrink: 0,
  },
};

export function SelectParentScreen({
  accessToken,
  workItemType,
  workItemCount,
  savedOrg,
  savedProjectId,
  savedEpicId,
  savedStoryId,
  savedFrequentTags,
  onContinue,
  onSessionExpired,
  onRefreshToken,
  onBack,
}: SelectParentScreenProps): React.ReactElement {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [org, setOrg] = useState(savedOrg || '');
  const [projects, setProjects] = useState<AzureProject[]>([]);
  const [projectId, setProjectId] = useState(savedProjectId || '');
  const [epics, setEpics] = useState<AzureStory[]>([]);
  const [epicId, setEpicId] = useState(savedEpicId?.toString() || '');
  const [stories, setStories] = useState<AzureStory[]>([]);
  const [storyId, setStoryId] = useState(savedStoryId?.toString() || '');
  const [epicDetails, setEpicDetails] = useState<AzureWorkItemDetails | null>(null);
  const [storyDetails, setStoryDetails] = useState<AzureWorkItemDetails | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFrequentTags || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isTaskMode = workItemType === 'Task';
  const itemLabel = isTaskMode ? 'task' : 'user story';
  const itemLabelPlural = isTaskMode ? 'tasks' : 'user stories';

  // Helper to handle auth errors with refresh attempt
  const handleAuthError = async (): Promise<boolean> => {
    if (isRefreshing) return false;
    setIsRefreshing(true);
    try {
      await onRefreshToken();
      setIsRefreshing(false);
      return true;
    } catch {
      setIsRefreshing(false);
      onSessionExpired();
      return false;
    }
  };

  // Auto-fetch organizations on mount
  useEffect(() => {
    let isCancelled = false;

    const loadOrgs = async () => {
      setLoading(true);
      setError('');
      try {
        const fetchedOrgs = await fetchOrgs(accessToken);
        if (isCancelled) return;
        setOrgs(fetchedOrgs);
        if (savedOrg && fetchedOrgs.includes(savedOrg)) {
          setOrg(savedOrg);
        } else if (fetchedOrgs.length === 1) {
          setOrg(fetchedOrgs[0]);
        }
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof Error && err.name === 'AuthError') {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadOrgs();
    return () => { isCancelled = true; };
  }, [accessToken, savedOrg]);

  // Fetch projects when org changes
  useEffect(() => {
    if (!org) return;
    let isCancelled = false;

    const loadProjects = async () => {
      setProjects([]);
      setProjectId('');
      setEpics([]);
      setEpicId('');
      setStories([]);
      setStoryId('');
      setEpicDetails(null);
      setStoryDetails(null);
      setLoading(true);
      setError('');
      try {
        const fetchedProjects = await fetchProjects(accessToken, org);
        if (isCancelled) return;
        setProjects(fetchedProjects);
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof Error && err.name === 'AuthError') {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadProjects();
    return () => { isCancelled = true; };
  }, [accessToken, org]);

  // Fetch epics and tags when project changes
  useEffect(() => {
    if (!org || !projectId) return;
    let isCancelled = false;

    const loadEpicsAndTags = async () => {
      setEpics([]);
      setEpicId('');
      setStories([]);
      setStoryId('');
      setEpicDetails(null);
      setStoryDetails(null);
      setLoading(true);
      setError('');
      try {
        const [fetchedEpics, fetchedTags] = await Promise.all([
          fetchEpics(accessToken, org, projectId),
          fetchTags(accessToken, org, projectId),
        ]);
        if (isCancelled) return;
        setEpics(fetchedEpics);
        setAvailableTags(fetchedTags);
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof Error && err.name === 'AuthError') {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadEpicsAndTags();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId]);

  // Fetch epic details and stories when epic changes
  useEffect(() => {
    if (!org || !epicId) return;
    let isCancelled = false;

    const loadEpicDetailsAndStories = async () => {
      setEpicDetails(null);
      setStories([]);
      setStoryId('');
      setStoryDetails(null);
      setLoading(true);
      setError('');
      try {
        const epicIdNum = parseInt(epicId, 10);

        // Fetch epic details and stories in parallel (if in Task mode)
        if (isTaskMode && projectId) {
          const [fetchedEpicDetails, fetchedStories] = await Promise.all([
            fetchWorkItemDetails(accessToken, org, epicIdNum),
            fetchStoriesByEpic(accessToken, org, projectId, epicIdNum),
          ]);
          if (isCancelled) return;
          setEpicDetails(fetchedEpicDetails);
          setStories(fetchedStories);
        } else {
          const fetchedEpicDetails = await fetchWorkItemDetails(accessToken, org, epicIdNum);
          if (isCancelled) return;
          setEpicDetails(fetchedEpicDetails);
        }
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof Error && err.name === 'AuthError') {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadEpicDetailsAndStories();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId, epicId, isTaskMode]);

  // Fetch story details when story changes (Task mode only)
  useEffect(() => {
    if (!org || !storyId || !isTaskMode) return;
    let isCancelled = false;

    const loadStoryDetails = async () => {
      setStoryDetails(null);
      setLoading(true);
      setError('');
      try {
        const storyIdNum = parseInt(storyId, 10);
        const fetchedStoryDetails = await fetchWorkItemDetails(accessToken, org, storyIdNum);
        if (isCancelled) return;
        setStoryDetails(fetchedStoryDetails);
      } catch (err) {
        if (isCancelled) return;
        if (err instanceof Error && err.name === 'AuthError') {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadStoryDetails();
    return () => { isCancelled = true; };
  }, [accessToken, org, storyId, isTaskMode]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // For UserStory mode: need Epic selected
  // For Task mode: need Epic AND Story selected
  const canContinue = isTaskMode
    ? org && projectId && epicId && storyId && storyDetails
    : org && projectId && epicId && epicDetails;

  const handleContinue = () => {
    if (!canContinue) return;

    const hierarchyContext: HierarchyContext = {
      epic: epicDetails ? {
        id: epicDetails.id,
        title: epicDetails.title,
        description: epicDetails.description,
      } : undefined,
    };

    if (isTaskMode && storyDetails) {
      hierarchyContext.userStory = {
        id: storyDetails.id,
        title: storyDetails.title,
        description: storyDetails.description,
        acceptanceCriteria: storyDetails.acceptanceCriteria,
      };
    }

    const parentTitle = isTaskMode
      ? storyDetails?.title || ''
      : epicDetails?.title || '';

    onContinue({
      org,
      projectId,
      hierarchyContext,
      selectedTags,
      parentTitle,
    });
  };

  const selectedEpic = epics.find((e) => e.id.toString() === epicId);
  const selectedStory = stories.find((s) => s.id.toString() === storyId);

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>{isTaskMode ? 'Select Parent Story' : 'Select Parent Epic'}</h2>
        <p>
          {workItemCount} {workItemCount === 1 ? itemLabel : itemLabelPlural} will be created
          under this {isTaskMode ? 'user story' : 'epic'}
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="select-group">
        <Select
          label="Organization"
          value={org}
          onChange={setOrg}
          placeholder={loading && orgs.length === 0 ? 'Loading...' : 'Select an organization'}
          options={orgs.map((o) => ({ value: o, label: o }))}
        />

        <Select
          label="Project"
          value={projectId}
          onChange={setProjectId}
          placeholder={
            !org ? 'Select an organization first' : loading ? 'Loading...' : 'Select a project'
          }
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />

        <Select
          label="Epic"
          value={epicId}
          onChange={setEpicId}
          placeholder={
            !projectId ? 'Select a project first' : loading ? 'Loading...' : 'Select an epic'
          }
          options={epics.map((e) => ({
            value: e.id.toString(),
            label: `#${e.id} - ${e.title}`,
          }))}
        />

        {isTaskMode && (
          <Select
            label="User Story"
            value={storyId}
            onChange={setStoryId}
            placeholder={
              !epicId ? 'Select an epic first' : loading ? 'Loading...' : 'Select a user story'
            }
            options={stories.map((s) => ({
              value: s.id.toString(),
              label: `#${s.id} - ${s.title}`,
            }))}
          />
        )}

        <div style={styles.infoBox}>
          <svg style={styles.infoIcon} width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="#7c3aed" strokeWidth="1.5"/>
            <path d="M8 7v4M8 5v.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>
            {isTaskMode
              ? 'Epic and story context will be used to generate relevant tasks'
              : 'Epic context will be used to generate relevant user stories'}
          </span>
        </div>

        {availableTags.length > 0 && (
          <div>
            <label
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#666666',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Tags
            </label>
            <div className="tags-container">
              {availableTags.map((tag) => (
                <Tag
                  key={tag}
                  label={tag}
                  selected={selectedTags.includes(tag)}
                  onClick={() => toggleTag(tag)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="screen-footer">
        <Button onClick={handleContinue} disabled={!canContinue} fullWidth>
          Continue to Context
        </Button>
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
