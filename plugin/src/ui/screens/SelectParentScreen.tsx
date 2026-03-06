import React, { useState, useEffect } from 'react';
import { WorkItemType, AzureStory, HierarchyContext, AzureWorkItemDetails, WorkItemTypeInfo } from '../types';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Tag } from '../components/Tag';
import {
  fetchEpics,
  fetchStoriesByEpic,
  fetchFeaturesByEpic,
  fetchWorkItemDetails,
  fetchTags,
} from '../services/api';

interface SelectParentScreenProps {
  accessToken: string;
  workItemType: WorkItemType;
  org: string;
  projectId: string;
  savedEpicId?: number;
  savedFeatureId?: number;
  savedStoryId?: number;
  savedFrequentTags?: string[];
  availableTypes?: WorkItemTypeInfo[];
  onContinue: (selection: {
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
  org,
  projectId,
  savedEpicId,
  savedFeatureId,
  savedStoryId,
  savedFrequentTags,
  availableTypes = [],
  onContinue,
  onSessionExpired,
  onRefreshToken,
  onBack,
}: SelectParentScreenProps): React.ReactElement {
  const [epics, setEpics] = useState<AzureStory[]>([]);
  const [epicId, setEpicId] = useState(savedEpicId?.toString() || '');
  const [features, setFeatures] = useState<AzureStory[]>([]);
  const [featureId, setFeatureId] = useState(savedFeatureId?.toString() || '');
  const [stories, setStories] = useState<AzureStory[]>([]);
  const [storyId, setStoryId] = useState(savedStoryId?.toString() || '');
  const [epicDetails, setEpicDetails] = useState<AzureWorkItemDetails | null>(null);
  const [featureDetails, setFeatureDetails] = useState<AzureWorkItemDetails | null>(null);
  const [storyDetails, setStoryDetails] = useState<AzureWorkItemDetails | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFrequentTags || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Determine what work item types are available
  const hasEpics = availableTypes.some((t) => t.name === 'Epic');
  const hasFeatures = availableTypes.some((t) => t.name === 'Feature');
  const hasUserStories = availableTypes.some((t) => t.name === 'User Story');

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

  // Fetch epics and tags on mount
  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
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

    loadData();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId]);

  // Fetch epic details and children when epic changes
  useEffect(() => {
    if (!epicId) return;
    let isCancelled = false;

    const loadEpicDetailsAndChildren = async () => {
      setEpicDetails(null);
      setFeatures([]);
      setFeatureId('');
      setFeatureDetails(null);
      setStories([]);
      setStoryId('');
      setStoryDetails(null);
      setLoading(true);
      setError('');
      try {
        const epicIdNum = parseInt(epicId, 10);

        // Fetch epic details
        const fetchedEpicDetails = await fetchWorkItemDetails(accessToken, org, epicIdNum);
        if (isCancelled) return;
        setEpicDetails(fetchedEpicDetails);

        // For Features: we're done (Feature goes under Epic)
        // For UserStory: need to load features if available
        // For Task: need to load stories
        if (workItemType === 'UserStory' && hasFeatures) {
          const fetchedFeatures = await fetchFeaturesByEpic(accessToken, org, projectId, epicIdNum);
          if (isCancelled) return;
          setFeatures(fetchedFeatures);
        } else if (workItemType === 'Task') {
          const fetchedStories = await fetchStoriesByEpic(accessToken, org, projectId, epicIdNum);
          if (isCancelled) return;
          setStories(fetchedStories);
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

    loadEpicDetailsAndChildren();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId, epicId, workItemType, hasFeatures]);

  // Fetch feature details when feature changes
  useEffect(() => {
    if (!featureId) return;
    let isCancelled = false;

    const loadFeatureDetails = async () => {
      setFeatureDetails(null);
      setLoading(true);
      setError('');
      try {
        const featureIdNum = parseInt(featureId, 10);
        const fetchedFeatureDetails = await fetchWorkItemDetails(accessToken, org, featureIdNum);
        if (isCancelled) return;
        setFeatureDetails(fetchedFeatureDetails);
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

    loadFeatureDetails();
    return () => { isCancelled = true; };
  }, [accessToken, org, featureId]);

  // Fetch story details when story changes (Task mode only)
  useEffect(() => {
    if (!storyId || workItemType !== 'Task') return;
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
  }, [accessToken, org, storyId, workItemType]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Determine if we can continue based on work item type
  const canContinue = (() => {
    switch (workItemType) {
      case 'Feature':
        // Features can optionally have an Epic parent
        if (epicId) {
          return !!epicDetails;
        }
        return true;
      case 'UserStory':
        // User Stories need an Epic or Feature parent
        if (featureId) {
          return !!featureDetails;
        }
        if (epicId) {
          return !!epicDetails;
        }
        return false;
      case 'Task':
        // Tasks need a User Story parent
        return !!(epicId && storyId && storyDetails);
      default:
        return false;
    }
  })();

  const handleContinue = () => {
    if (!canContinue) return;

    const hierarchyContext: HierarchyContext = {};

    if (epicDetails) {
      hierarchyContext.epic = {
        id: epicDetails.id,
        title: epicDetails.title,
        description: epicDetails.description,
      };
    }

    if (featureDetails) {
      hierarchyContext.feature = {
        id: featureDetails.id,
        title: featureDetails.title,
        description: featureDetails.description,
        acceptanceCriteria: featureDetails.acceptanceCriteria,
      };
    }

    if (storyDetails) {
      hierarchyContext.userStory = {
        id: storyDetails.id,
        title: storyDetails.title,
        description: storyDetails.description,
        acceptanceCriteria: storyDetails.acceptanceCriteria,
      };
    }

    // Determine parent title for display
    let parentTitle = '';
    switch (workItemType) {
      case 'Feature':
        parentTitle = epicDetails?.title || '';
        break;
      case 'UserStory':
        parentTitle = featureDetails?.title || epicDetails?.title || '';
        break;
      case 'Task':
        parentTitle = storyDetails?.title || '';
        break;
    }

    onContinue({
      hierarchyContext,
      selectedTags,
      parentTitle,
    });
  };

  // Get screen title based on work item type
  const getScreenTitle = (): string => {
    switch (workItemType) {
      case 'Feature':
        return hasEpics && epics.length > 0 ? 'Select Parent Epic (Optional)' : 'Configure Feature';
      case 'UserStory':
        return 'Select Parent';
      case 'Task':
        return 'Select Parent Story';
      default:
        return 'Select Parent';
    }
  };

  // Get info box text based on work item type
  const getInfoText = (): string => {
    switch (workItemType) {
      case 'Feature':
        return epicId
          ? 'Epic context will be used to generate relevant features'
          : 'Features will be created without a parent epic';
      case 'UserStory':
        return featureId
          ? 'Feature context will be used to generate relevant user stories'
          : 'Epic context will be used to generate relevant user stories';
      case 'Task':
        return 'Epic and story context will be used to generate relevant tasks';
      default:
        return 'Context will be used to generate relevant work items';
    }
  };

  // Determine if Epic selector should be shown
  const showEpicSelector = hasEpics && epics.length > 0 && (
    workItemType === 'Feature' ||
    workItemType === 'UserStory' ||
    workItemType === 'Task'
  );

  // Determine if Feature selector should be shown
  const showFeatureSelector = hasFeatures && workItemType === 'UserStory' && epicId && features.length > 0;

  // Determine if Story selector should be shown
  const showStorySelector = workItemType === 'Task' && hasUserStories;

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>{getScreenTitle()}</h2>
        <p>Select the parent work item for context</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="select-group">
        {showEpicSelector && (
          <Select
            label={workItemType === 'Feature' ? 'Epic (Optional)' : 'Epic'}
            value={epicId}
            onChange={(val) => {
              setEpicId(val);
              setFeatureId('');
              setStoryId('');
            }}
            placeholder={
              loading && epics.length === 0
                ? 'Loading...'
                : workItemType === 'Feature'
                ? 'Select an epic (optional)'
                : 'Select an epic'
            }
            options={
              workItemType === 'Feature'
                ? [{ value: '', label: '(No parent epic)' }, ...epics.map((e) => ({
                    value: e.id.toString(),
                    label: `#${e.id} - ${e.title}`,
                  }))]
                : epics.map((e) => ({
                    value: e.id.toString(),
                    label: `#${e.id} - ${e.title}`,
                  }))
            }
          />
        )}

        {showFeatureSelector && (
          <Select
            label="Feature (Optional)"
            value={featureId}
            onChange={setFeatureId}
            placeholder={loading ? 'Loading...' : 'Select a feature (optional)'}
            options={[
              { value: '', label: '(Create under Epic directly)' },
              ...features.map((f) => ({
                value: f.id.toString(),
                label: `#${f.id} - ${f.title}`,
              })),
            ]}
          />
        )}

        {showStorySelector && (
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
          <span>{getInfoText()}</span>
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
