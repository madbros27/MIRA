/**
 * Name of the cookie that remembers which workspace is active.
 *
 * It lives outside `app/actions.ts` because a `"use server"` module may only
 * export async functions.
 */
export const ACTIVE_WORKSPACE_COOKIE = 'mira_workspace'
