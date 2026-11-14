'use client';
import { useEffect, useRef, useState } from 'react';

/** Display and submit request only; the API owns expiry and finalization. */
export function useAssessmentDeadline(
  deadlineAt: string | null | undefined,
  onExpired: () => void,
  serverTime?: string,
) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const callback = useRef(onExpired);
  const expiredDeadline = useRef<number | null>(null);
  useEffect(() => {
    callback.current = onExpired;
  }, [onExpired]);
  useEffect(() => {
    const deadline = deadlineAt ? Date.parse(deadlineAt) : NaN;
    const serverAtReceipt = serverTime ? Date.parse(serverTime) : NaN;
    if (!Number.isFinite(deadline) || !Number.isFinite(serverAtReceipt)) {
      setRemaining(null);
      return;
    }
    const received = performance.now();
    if (expiredDeadline.current !== deadline) expiredDeadline.current = null;
    function tick() {
      const seconds = Math.max(
        0,
        Math.ceil((deadline - serverAtReceipt - (performance.now() - received)) / 1000),
      );
      if (expiredDeadline.current === deadline) {
        setRemaining(0);
        return;
      }
      setRemaining(seconds);
      if (seconds === 0) {
        expiredDeadline.current = deadline;
        callback.current();
      }
    }
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [deadlineAt, serverTime]);
  return { remaining, expired: remaining === 0 };
}
