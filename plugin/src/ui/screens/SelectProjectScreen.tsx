import React, { useState, useEffect } from 'react';
import { AzureProject, WorkItemTypeInfo } from '../types';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import {
  fetchOrgs,
  fetchProjects,
  fetchWorkItemTypes,
  AuthError,
} from '../services/api';

interface SelectProjectScreenProps {
  accessToken: string;
  savedOrg?: string;
  savedProjectId?: string;
  onContinue: (selection: {
    org: string;
    projectId: string;
    availableTypes: WorkItemTypeInfo[];
  }) => void;
  onSessionExpired: () => void;
  onRefreshToken: () => Promise<void>;
  onBack: () => void;
}

export function SelectProjectScreen({
  accessToken,
  savedOrg,
  savedProjectId,
  onContinue,
  onSessionExpired,
  onRefreshToken,
  onBack,
}: SelectProjectScreenProps): React.ReactElement {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [org, setOrg] = useState(savedOrg || '');
  const [projects, setProjects] = useState<AzureProject[]>([]);
  const [projectId, setProjectId] = useState(savedProjectId || '');
  const [availableTypes, setAvailableTypes] = useState<WorkItemTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to handle auth errors with refresh attempt
  // Returns true if refresh succeeded and caller should retry
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

  // Check if an error message indicates auth failure
  const isLikelyAuthError = (err: unknown): boolean => {
    if (err instanceof Error && err.name === 'AuthError') return true;
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    return (
      msg.includes('session expired') ||
      msg.includes('unauthorized') ||
      msg.includes('authentication') ||
      msg.includes('token') ||
      msg.includes('401') ||
      msg.includes('403')
    );
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
        // Try to refresh token on any error - expired tokens may not always return proper auth errors
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          // For other errors, still try refresh once as fallback
          const refreshed = await handleAuthError();
          if (!refreshed) {
            // If refresh failed, session is expired - onSessionExpired already called
          }
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
        // Try to refresh token on any error - expired tokens may not always return proper auth errors
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          // For other errors, still try refresh once as fallback
          const refreshed = await handleAuthError();
          if (!refreshed) {
            // If refresh failed, session is expired - onSessionExpired already called
          }
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
        // Try to refresh token on any error - expired tokens may not always return proper auth errors
        if (isLikelyAuthError(err)) {
          await handleAuthError();
        } else {
          // For other errors, still try refresh once as fallback
          const refreshed = await handleAuthError();
          if (!refreshed) {
            // If refresh failed, session is expired - onSessionExpired already called
          }
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadWorkItemTypes();
    return () => { isCancelled = true; };
  }, [accessToken, org, projectId]);

  const canContinue = org && projectId && availableTypes.length > 0;

  const handleContinue = () => {
    if (!canContinue) return;
    onContinue({
      org,
      projectId,
      availableTypes,
    });
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h2>Select Project</h2>
        <p>Choose your Azure DevOps organization and project</p>
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

        {projectId && availableTypes.length > 0 && (
          <div style={{
            background: '#f3e8ff',
            border: '1px solid #d8b4fe',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
            color: '#6b21a8',
          }}>
            <strong>Available work item types:</strong>
            <div style={{ marginTop: '4px' }}>
              {availableTypes.map((t) => t.name).join(', ')}
            </div>
          </div>
        )}

        {projectId && loading && (
          <div style={{ fontSize: '12px', color: '#666666' }}>
            Loading work item types...
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
