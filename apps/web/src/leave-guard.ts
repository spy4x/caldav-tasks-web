import { createLeaveGuard } from "@spy4x/preact-ui/unsaved-guard"

/**
 * Asks before a navigation started from code (the sidebar, the shortcuts) leaves the task editor
 * with unsaved changes. The editor's `UnsavedGuard` and the code that navigates share this one.
 */
export const leaveGuard = createLeaveGuard()
