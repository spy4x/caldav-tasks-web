import { ConflictChooser } from "@spy4x/preact-system/conflict-chooser"
import { SyncStatus } from "@spy4x/preact-system/sync-status"
import { conflicts, keepMineOf, useTheirsOf } from "../state/conflicts.ts"
import { offline } from "../state/connection.ts"
import { pendingEntries } from "../state/pending.ts"
import { runnerState, syncNow } from "../state/sync.ts"

/**
 * Whether the changes made here have reached the server, and the ones the server did not take.
 * It shows nothing while everything is synced. A task changed elsewhere offers Keep mine and Use
 * theirs; one deleted elsewhere offers to discard the change, which is all the queue can do for it.
 */
export function SyncBar() {
  const state = runnerState.value
  const waiting = pendingEntries.value.filter((entry) => entry.status === `pending`).length
  const list = conflicts.value
  return (
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 sm:px-6">
      <SyncStatus
        online={!offline.value}
        pending={waiting}
        syncing={state?.running ?? false}
        failed={state?.lastError != null}
        onRetry={() => void syncNow()}
        labels={{ synced: `` }}
      />
      {list.length > 0 && (
        <ConflictChooser
          conflicts={list}
          onKeepMine={keepMineOf}
          onUseTheirs={useTheirsOf}
          headingLevel={2}
        />
      )}
    </div>
  )
}
