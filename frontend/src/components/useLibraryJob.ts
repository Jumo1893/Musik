import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import type { LibraryJob } from '../types.ts';

/** So oft wird der Fortschritt eines laufenden Auftrags abgefragt. */
const POLL_MS = 1500;

/**
 * Ein Auftrag über die ganze Bibliothek (läuft im Backend weiter, auch wenn man die Seite
 * verlässt). Beim Öffnen der Seite geht es mit dem zuletzt gestarteten Auftrag weiter.
 */
export function useLibraryJob<T>(kind: LibraryJob['kind']) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const latest = useQuery({
    queryKey: ['jobs', kind, 'latest'],
    queryFn: () => api.jobs.latest<T>(kind),
    staleTime: 0,
  });
  useEffect(() => {
    if (jobId === null && latest.data?.job) setJobId(latest.data.job.id);
  }, [latest.data, jobId]);

  const job = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => api.jobs.get<T>(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? POLL_MS : false),
    retry: false,
  });
  // Den Auftrag gibt es nicht mehr (etwa nach einem Neustart der App).
  useEffect(() => {
    if (job.isError) setJobId(null);
  }, [job.isError]);

  const start = useMutation({
    mutationFn: () => api.jobs.start<T>(kind),
    onSuccess: (started) => {
      queryClient.setQueryData(['jobs', started.id], started);
      setJobId(started.id);
    },
  });

  return {
    job: jobId !== null ? (job.data ?? null) : null,
    start,
    /** Hält den laufenden Auftrag an; die Funde bleiben. */
    stop: () => {
      if (jobId) void api.jobs.remove(jobId).then(() => job.refetch());
    },
    /** Vergisst den Auftrag samt Funden. */
    forget: () => {
      if (jobId) void api.jobs.remove(jobId).catch(() => undefined);
      setJobId(null);
      queryClient.setQueryData(['jobs', kind, 'latest'], { job: null });
    },
  };
}
