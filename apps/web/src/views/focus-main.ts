/**
 * Moves keyboard focus to the page's `<main>`, which the frame makes focusable. A control that
 * leaves the page (the install offer, the Install row) would otherwise drop focus to the body.
 */
export function focusMain(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>(`main`)
  main?.focus()
  return main
}
