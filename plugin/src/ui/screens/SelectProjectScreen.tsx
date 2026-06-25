import React, { useState, useEffect, useMemo } from 'react';
import { AzureProject, WorkItemTypeInfo, WorkItemType, AzureStory, HierarchyContext, AzureWorkItemDetails, isStoryLikeType } from '../types';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Tag } from '../components/Tag';
import {
  fetchProjects,
  fetchWorkItemTypes,
  fetchEpics,
  fetchStories,
  fetchFeaturesByEpic,
  fetchStoriesByEpic,
  fetchStoriesByFeature,
  fetchWorkItemDetails,
  fetchTags,
} from '../services/api';

interface SelectProjectScreenProps {
  accessToken: string;
  workItemType: WorkItemType;
  // Org parsed from the project URL at connect time. Used directly instead of
  // listing orgs via the accounts API (which an org-scoped PAT may not allow).
  connectedOrg: string;
  savedOrg?: string;
  savedProjectId?: string;
  savedEpicId?: number;
  savedFeatureId?: number;
  savedStoryId?: number;
  savedFrequentTags?: string[];
  onContinue: (selection: {
    org: string;
    projectId: string;
    availableTypes: WorkItemTypeInfo[];
    hierarchyContext: HierarchyContext;
    selectedTags: string[];
    parentTitle: string;
  }) => void;
  onSessionExpired: () => void;
  onBack: () => void;
}

export function SelectProjectScreen({
  accessToken,
  workItemType,
  connectedOrg,
  savedOrg,
  savedProjectId,
  savedEpicId,
  savedFeatureId,
  savedStoryId,
  savedFrequentTags,
  onContinue,
  onSessionExpired,
  onBack,
}: SelectProjectScreenProps): React.ReactElement {
  // Organization and project state. The org is fixed to the one from the
  // connect URL (no org dropdown / accounts API).
  const [orgs, setOrgs] = useState<string[]>(connectedOrg ? [connectedOrg] : []);
  const [org, setOrg] = useState(connectedOrg || savedOrg || '');
  const [projects, setProjects] = useState<AzureProject[]>([]);
  const [projectId, setProjectId] = useState(savedProjectId || '');
  const [availableTypes, setAvailableTypes] = useState<WorkItemTypeInfo[]>([]);

  // Parent work item state
  const [epics, setEpics] = useState<AzureStory[]>([]);
  const [epicId, setEpicId] = useState(savedEpicId?.toString() || '');
  const [epicDetails, setEpicDetails] = useState<AzureWorkItemDetails | null>(null);
  const [features, setFeatures] = useState<AzureStory[]>([]);
  const [featureId, setFeatureId] = useState(savedFeatureId?.toString() || '');
  const [featureDetails, setFeatureDetails] = useState<AzureWorkItemDetails | null>(null);
  const [stories, setStories] = useState<AzureStory[]>([]);
  const [storyId, setStoryId] = useState(savedStoryId?.toString() || '');
  const [storyDetails, setStoryDetails] = useState<AzureWorkItemDetails | null>(null);

  // Tags state
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(savedFrequentTags || []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Determine what work item types are available
  const hasEpics = useMemo(() => availableTypes.some((t) => t.name === 'Epic'), [availableTypes]);
  const hasFeatures = useMemo(() => availableTypes.some((t) => t.name === 'Feature'), [availableTypes]);
  const hasUserStories = useMemo(() => availableTypes.some((t) => isStoryLikeType(t.name)), [availableTypes]);

  // A PAT can't be refreshed, so any auth failure means the token is bad —
  // bounce the user back to reconnect. Returns false (never "retry").
  const handleAuthError = async (): Promise<boolean> => {
    onSessionExpired();
    return false;
  };

  // The backend returns HTTP 401 only for real auth failures, which request()
  // surfaces as AuthError. Rely on that — don't sniff message substrings like
  // "401"/"403"/"token", which match Azure error codes (VS403xxx) and ordinary
  // errors, causing false "token rejected" bounces.
  const isLikelyAuthError = (err: unknown): boolean =>
    err instanceof Error && err.name === 'AuthError';

  // The org comes from the connect URL — no listing call. Just pin it.
  useEffect(() => {
    if (!connectedOrg) return;
    setOrgs([connectedOrg]);
    setOrg(connectedOrg);
  }, [connectedOrg]);

  // Fetch projects when org changes
  useEffect(() => {
    if (!org) return;
    let isCancelled = false;

    const loadProjects = async () => {
      setProjects([]);
      setProjectId('');
      setAvailableTypes([]);
      setLoading(true);
      setError('');
      try {
        const fetchedProjects = await fetchProjects(accessToken, org);
        if (isCancelled) return;
        setProjects(fetchedProjects);

        // Auto-select saved project if available
        if (savedProjectId && fetchedProjects.some(p => p.id === savedProjectId)) {
          setProjectId(savedProjectId);
        }
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load projects');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadProjects();
    return () => { isCancelled = true; };
  }, [accessToken, org, savedProjectId]);

  // Fetch work item types when project changes
  useEffect(() => {
    if (!org || !projectId) return;
    let isCancelled = false;

    const loadWorkItemTypes = async () => {
      setAvailableTypes([]);
      setLoading(true);
      setError('');
      try {
        const fetchedTypes = await fetchWorkItemTypes(accessToken, org, projectId);
        if (isCancelled) return;
        setAvailableTypes(fetchedTypes);
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load work item types');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadWorkItemTypes();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId]);

  // Fetch epics, stories (for Tasks), and tags when project is selected
  useEffect(() => {
    if (!org || !projectId || workItemType === 'Epic') return;
    let isCancelled = false;

    const loadEpicsStoriesAndTags = async () => {
      setEpics([]);
      setEpicId('');
      setEpicDetails(null);
      setFeatures([]);
      setFeatureId('');
      setFeatureDetails(null);
      setStories([]);
      setStoryId('');
      setStoryDetails(null);
      setLoading(true);
      try {
        const [fetchedEpics, fetchedTags] = await Promise.all([
          fetchEpics(accessToken, org, projectId),
          fetchTags(accessToken, org, projectId),
        ]);
        if (isCancelled) return;
        setEpics(fetchedEpics);
        setAvailableTags(fetchedTags);

        // Stories are loaded by the dedicated Task stories effect, which keys off
        // the epic/feature selection — so they aren't fetched here.

        // Auto-select saved epic if available
        if (savedEpicId && fetchedEpics.some((e) => e.id === savedEpicId)) {
          setEpicId(savedEpicId.toString());
        }
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load epics, stories, or tags');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadEpicsStoriesAndTags();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId, workItemType, savedEpicId, savedStoryId]);

  // Fetch epic details and children when epic changes
  // For UserStory: fetch features under epic
  // For Task: fetch stories under epic (to filter the list)
  useEffect(() => {
    if (!epicId || !org || !projectId) return;
    let isCancelled = false;

    const loadEpicDetailsAndChildren = async () => {
      setEpicDetails(null);
      setFeatures([]);
      setFeatureId('');
      setFeatureDetails(null);
      // Clear story selection when epic changes
      setStoryId('');
      setStoryDetails(null);
      setLoading(true);
      try {
        const epicIdNum = parseInt(epicId, 10);
        const detailsPromise = fetchWorkItemDetails(accessToken, org, epicIdNum);

        // Fetch the epic's features (the Feature parent/filter) for both the
        // UserStory and Task flows. Stories under the epic/feature are loaded by
        // the dedicated stories effect below.
        const featuresPromise: Promise<AzureStory[]> = hasFeatures
          ? fetchFeaturesByEpic(accessToken, org, projectId, epicIdNum)
          : Promise.resolve([]);

        const [fetchedDetails, fetchedFeatures] = await Promise.all([
          detailsPromise,
          featuresPromise,
        ]);

        if (isCancelled) return;
        setEpicDetails(fetchedDetails);
        setFeatures(fetchedFeatures);
        if (savedFeatureId && fetchedFeatures.some((f) => f.id === savedFeatureId)) {
          setFeatureId(savedFeatureId.toString());
        }
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load stories for this epic');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadEpicDetailsAndChildren();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId, epicId, workItemType, hasFeatures, savedFeatureId, savedStoryId]);

  // Load the Task story list, narrowed by the current selection: a Feature if
  // chosen, else the Epic, else all project stories. Re-runs whenever the epic
  // or feature changes.
  useEffect(() => {
    if (workItemType !== 'Task' || !org || !projectId) return;
    let isCancelled = false;

    const loadStories = async () => {
      setStoryId('');
      setStoryDetails(null);
      setLoading(true);
      try {
        let fetched: AzureStory[];
        if (featureId) {
          fetched = await fetchStoriesByFeature(accessToken, org, projectId, parseInt(featureId, 10));
        } else if (epicId) {
          fetched = await fetchStoriesByEpic(accessToken, org, projectId, parseInt(epicId, 10));
        } else {
          fetched = await fetchStories(accessToken, org, projectId);
        }
        if (isCancelled) return;
        setStories(fetched);
        if (savedStoryId && fetched.some((s) => s.id === savedStoryId)) {
          setStoryId(savedStoryId.toString());
        }
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load stories');
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadStories();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId, epicId, featureId, workItemType, savedStoryId]);

  // Fetch feature details when feature changes
  useEffect(() => {
    if (!featureId || !org) return;
    let isCancelled = false;

    const loadFeatureDetails = async () => {
      setFeatureDetails(null);
      setLoading(true);
      try {
        const featureIdNum = parseInt(featureId, 10);
        const fetchedDetails = await fetchWorkItemDetails(accessToken, org, featureIdNum);
        if (isCancelled) return;
        setFeatureDetails(fetchedDetails);
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
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
    if (!storyId || !org || workItemType !== 'Task') return;
    let isCancelled = false;

    const loadStoryDetails = async () => {
      setStoryDetails(null);
      setLoading(true);
      try {
        const storyIdNum = parseInt(storyId, 10);
        const fetchedDetails = await fetchWorkItemDetails(accessToken, org, storyIdNum);
        if (isCancelled) return;
        setStoryDetails(fetchedDetails);
      } catch (err) {
        if (isCancelled) return;
        if (isLikelyAuthError(err)) {
          await handleAuthError();
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
    if (!org || !projectId || availableTypes.length === 0) return false;

    switch (workItemType) {
      case 'Epic':
        return true; // No parent needed
      case 'Feature':
        // Features can optionally have an Epic parent
        if (epicId) return !!epicDetails;
        return true;
      case 'UserStory':
        // User Stories need an Epic or Feature parent
        if (featureId) return !!featureDetails;
        if (epicId) return !!epicDetails;
        return false;
      case 'Task':
        // A User Story parent is optional (some teams list tasks with no story).
        // If one is chosen, wait for its details before continuing.
        if (storyId) return !!storyDetails;
        return true;
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
      };
    }

    if (storyDetails) {
      hierarchyContext.userStory = {
        id: storyDetails.id,
        title: storyDetails.title,
        description: storyDetails.description,
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
      org,
      projectId,
      availableTypes,
      hierarchyContext,
      selectedTags,
      parentTitle,
    });
  };

  // Determine if selectors should be shown
  const showEpicSelector = projectId && hasEpics && epics.length > 0 && workItemType !== 'Epic';
  const showFeatureSelector =
    hasFeatures &&
    (workItemType === 'UserStory' || workItemType === 'Task') &&
    !!epicId &&
    features.length > 0;
  // For Tasks, show the User Story selector whenever the project has story-like
  // types — even if the selected epic has none yet, so the control doesn't vanish.
  const showStorySelector = workItemType === 'Task' && hasUserStories;

  // For Tasks, filter stories by selected Epic (if any)
  const filteredStories = useMemo(() => {
    if (workItemType !== 'Task') return stories;
    if (!epicId) return stories; // Show all stories when no Epic selected
    // Filter will be handled by fetching stories under epic when epic changes
    return stories;
  }, [workItemType, epicId, stories]);
  const showTags = projectId && availableTags.length > 0 && workItemType !== 'Epic';

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Select Project{workItemType !== 'Epic' ? ' & Parent' : ''}</h2>
        <p>Choose your Azure DevOps organization and project</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="select-group">
        <Select
          label="Organization"
          value={org}
          onChange={(val) => {
            setOrg(val);
            setProjectId('');
            setEpicId('');
            setFeatureId('');
            setStoryId('');
          }}
          placeholder={loading && orgs.length === 0 ? 'Loading...' : 'Select an organization'}
          options={orgs.map((o) => ({ value: o, label: o }))}
        />

        <Select
          label="Project"
          value={projectId}
          onChange={(val) => {
            setProjectId(val);
            setEpicId('');
            setFeatureId('');
            setStoryId('');
          }}
          placeholder={
            !org ? 'Select an organization first' : loading ? 'Loading...' : 'Select a project'
          }
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />

        {showEpicSelector && (
          <Select
            searchable
            label={workItemType === 'Feature' || workItemType === 'Task' ? 'Epic (Optional)' : 'Epic'}
            value={epicId}
            onChange={(val) => {
              setEpicId(val);
              setFeatureId('');
              setStoryId('');
            }}
            placeholder={
              loading && epics.length === 0
                ? 'Loading...'
                : workItemType === 'Feature' || workItemType === 'Task'
                ? 'Select an epic (optional)'
                : 'Select an epic'
            }
            options={
              workItemType === 'Feature'
                ? [{ value: '', label: '(No parent epic)' }, ...epics.map((e) => ({
                    value: e.id.toString(),
                    label: `#${e.id} - ${e.title}`,
                  }))]
                : workItemType === 'Task'
                ? [{ value: '', label: '(All user stories)' }, ...epics.map((e) => ({
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
            searchable
            label="Feature (Optional)"
            value={featureId}
            onChange={(val) => {
              setFeatureId(val);
              setStoryId('');
            }}
            placeholder={loading ? 'Loading...' : 'Select a feature (optional)'}
            options={[
              {
                value: '',
                label:
                  workItemType === 'Task'
                    ? '(All stories under epic)'
                    : '(Create under Epic directly)',
              },
              ...features.map((f) => ({
                value: f.id.toString(),
                label: `#${f.id} - ${f.title}`,
              })),
            ]}
          />
        )}

        {showStorySelector && (
          <Select
            searchable
            label="User Story"
            value={storyId}
            onChange={setStoryId}
            placeholder={loading ? 'Loading...' : 'Select a user story'}
            options={[
              { value: '', label: '(No user story)' },
              ...stories.map((s) => ({
                value: s.id.toString(),
                label: `#${s.id} - ${s.title}`,
              })),
            ]}
          />
        )}

        {showTags && (
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
              {availableTags.slice(0, 30).map((tag) => (
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

        {projectId && loading && (
          <div style={{ fontSize: '12px', color: '#666666' }}>
            Loading...
          </div>
        )}
      </div>

      <div className="screen-footer">
        <Button onClick={handleContinue} disabled={!canContinue} fullWidth>
          Continue
        </Button>
        <Button onClick={onBack} variant="text" fullWidth>
          Back
        </Button>
      </div>
    </div>
  );
}
