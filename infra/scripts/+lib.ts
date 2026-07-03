export function success(...args: unknown[]) {
  console.log(`%c${args.join(" ")}`, "color: green; font-weight: bold")
}
export function error(...args: unknown[]) {
  console.error(`%c${args.join(" ")}`, "color: red; font-weight: bold")
}
export function log(...args: unknown[]) {
  console.log(...args)
}
