import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
// Each queue owns its failure/retry. Parent identity keys discard revoked access data.
export function useOperationalQuery<T>(path: string, token: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    setState({});
    void apiRequest<T>(path, token).then(
      (data) => {
        if (active) setState({ data });
      },
      (error: unknown) => {
        if (active)
          setState({ error: error instanceof Error ? error.message : 'Permintaan gagal.' });
      },
    );
    return () => {
      active = false;
    };
  }, [path, token, generation]);
  return { ...state, retry: () => setGeneration((n) => n + 1) };
}
