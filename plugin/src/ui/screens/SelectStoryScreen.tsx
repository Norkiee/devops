import React, { useState, useEffect } from 'react';
import { AzureProject, AzureStory } from '../types';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { Tag } from '../components/Tag';
import { fetchProjects, fetchStories, fetchTags } from '../services/api';

interface SelectStoryScreenProps {
  accessToken: string;
  taskCount: number;
  savedOrg?: string;
  savedProjectId?: string;
  savedStoryId?: number;
  savedFrequentTags?: string[];
  onContinue: (selection: {
    org: string;
    projectId: string;
    storyId: number;
    storyTitle: string;
    selectedTags: string[];
  }) => void;
}

export function SelectStoryScreen({
  accessToken,
  taskCount,
  savedOrg,
  savedProjectId,
  savedStoryId,
  savedFrequentTags,
  onContinue,
}: SelectStoryScreenProps): React.ReactElement {
  const [org, setOrg] = useState(savedOrg || '');
  const [projects, setProjects] = useState<AzureProject[]>([]);
  const [projectId, setProjectId] = useState(savedProjectId || '');
  const [stories, setStories] = useState<AzureStory[]>([]);
  const [storyId, setStoryId] = useState(savedStoryId?.toString() || '');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    savedFrequentTags || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    setError('');
    fetchProjects(accessToken, org)
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, org]);

  useEffect(() => {
    if (!org || !projectId) return;
    setLoading(true);
    setError('');
    Promise.all([
      fetchStories(accessToken, org, projectId),
      fetchTags(accessToken, org, projectId),
    ])
      .then(([fetchedStories, fetchedTags]) => {
        setStories(fetchedStories);
        setAvailableTags(fetchedTags);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken, org, projectId]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const selectedStory = stories.find((s) => s.id.toString() === storyId);
  const canContinue = org && projectId && storyId && selectedStory;

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Assign to Story</h2>
        <p>
          All {taskCount} task{taskCount > 1 ? 's' : ''} will be linked to
          this story
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="select-group">
        <Input
          label="Organization"
          value={org}
          onChange={setOrg}
          placeholder="e.g., my-org"
        />

        <Select
          label="Project"
          value={projectId}
          onChange={setProjectId}
          placeholder={
            loading ? 'Loading...' : 'Select a project'
          }
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />

        <Select
          label="User Story"
          value={storyId}
          onChange={setStoryId}
          placeholder={
            loading ? 'Loading...' : 'Select a user story'
          }
          options={stories.map((s) => ({
            value: s.id.toString(),
            label: `#${s.id} - ${s.title}`,
          }))}
        />

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
        <Button
          onClick={() =>
            canContinue &&
            onContinue({
              org,
              projectId,
              storyId: Number(storyId),
              storyTitle: selectedStory!.title,
              selectedTags,
            })
          }
          disabled={!canContinue}
          fullWidth
        >
          Continue to Review
        </Button>
      </div>
    </div>
  );
}
