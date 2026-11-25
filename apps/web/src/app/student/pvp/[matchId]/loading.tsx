import { DataState } from '@/features/core-learning/ui';
import { PvpWaitingFrame } from '@/features/pvp/pvp-waiting-frame';

export default function Loading() {
  return (
    <PvpWaitingFrame>
      <div className="pvp-match-content">
        <DataState pending />
      </div>
    </PvpWaitingFrame>
  );
}
