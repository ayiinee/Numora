import { AsyncLocalStorage } from 'node:async_hooks';
import type { User } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';

type State = {
  closed: boolean;
  verified: WeakMap<object, Map<string, Promise<User>>>;
};
const requests = new AsyncLocalStorage<State>();

// Identity verification is shared only during this HTTP request. Domain profiles,
// account status and memberships are deliberately read again by their owners.
export function authenticationRequestMiddleware(
  _req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const state: State = { closed: false, verified: new WeakMap() };
  const close = () => {
    state.closed = true;
    state.verified = new WeakMap();
  };
  res.once('finish', close);
  res.once('close', close);
  requests.run(state, next);
}

export function authenticateForRequest(
  owner: object,
  token: string,
  verify: () => Promise<User>,
): Promise<User> {
  const state = requests.getStore();
  if (!state || state.closed) return verify();
  let tokens = state.verified.get(owner);
  if (!tokens) {
    tokens = new Map();
    state.verified.set(owner, tokens);
  }
  const previous = tokens.get(token);
  if (previous) return previous;
  const pending = verify();
  tokens.set(token, pending);
  // Share an in-flight failure, but allow an explicit retry to revalidate.
  void pending.catch(() => {
    if (tokens.get(token) === pending) tokens.delete(token);
  });
  return pending;
}
