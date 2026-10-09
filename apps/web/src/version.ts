declare const __APP_VERSION__: string | undefined

/**
 * The version Settings shows. The build sets it from the `APP_VERSION` environment variable (the
 * release tag); a build without it reads `development`.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === `string` && __APP_VERSION__
  ? __APP_VERSION__
  : `development`
