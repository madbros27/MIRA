import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isThisYear,
  isToday,
  isTomorrow,
  isValid,
  parseISO,
} from 'date-fns'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : parseISO(value)
  return isValid(date) ? date : null
}

/** "12 Mar", or "12 Mar 2024" when it is not the current year. */
export function formatDate(value: string | Date | null | undefined) {
  const date = toDate(value)
  if (!date) return '—'
  return format(date, isThisYear(date) ? 'd MMM' : 'd MMM yyyy')
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value)
  if (!date) return '—'
  return format(date, isThisYear(date) ? "d MMM 'at' HH:mm" : 'd MMM yyyy, HH:mm')
}

/** "3 hours ago" — falls back to an absolute date beyond a month. */
export function formatRelative(value: string | Date | null | undefined) {
  const date = toDate(value)
  if (!date) return '—'
  const days = Math.abs(differenceInCalendarDays(new Date(), date))
  if (days > 30) return formatDate(date)
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`
}

/** Due-date wording that reads naturally in a card footer. */
export function formatDueDate(value: string | null | undefined) {
  const date = toDate(value)
  if (!date) return null
  if (isToday(date)) return 'Due today'
  if (isTomorrow(date)) return 'Due tomorrow'
  const days = differenceInCalendarDays(date, new Date())
  if (days < 0) {
    const overdue = Math.abs(days)
    return `${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`
  }
  return `Due ${formatDate(date)}`
}

export function isOverdue(value: string | null | undefined) {
  const date = toDate(value)
  if (!date) return false
  return differenceInCalendarDays(date, new Date()) < 0
}

/** "5 days left" / "Ends today" / "Ended 2 days ago" for sprint headers. */
export function formatSprintWindow(
  start: string | null | undefined,
  end: string | null | undefined
) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return 'Dates not set'
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

export function daysRemaining(end: string | null | undefined) {
  const endDate = toDate(end)
  if (!endDate) return null
  return differenceInCalendarDays(endDate, new Date())
}

/** ISO date (yyyy-MM-dd) for `<input type="date">`. */
export function toDateInputValue(value: string | Date | null | undefined) {
  const date = toDate(value)
  return date ? format(date, 'yyyy-MM-dd') : ''
}

export function formatPoints(points: number | null | undefined) {
  if (points == null) return null
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}
