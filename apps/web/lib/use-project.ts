'use client';

import { useSearchParams } from 'next/navigation';
import { fetchProjects } from './queries';
import { useQuery } from './use-query';
import type { Project } from './supabase/types';

/**
 * The project the current screen is about.
 *
 * Taken from `?project=` when present, otherwise the most recent one. Most
 * offices run a handful of live projects, so defaulting to the newest is right
 * far more often than showing a chooser before any content.
 */
export function useProject(): {
  project: Project | null;
  projects: Project[];
  loading: boolean;
  error: string | null;
} {
  const params = useSearchParams();
  const requested = params.get('project');
  const { data, loading, error } = useQuery(fetchProjects, []);

  const projects = data ?? [];
  const project = requested ? (projects.find((p) => p.id === requested) ?? null) : (projects[0] ?? null);

  return { project, projects, loading, error };
}
