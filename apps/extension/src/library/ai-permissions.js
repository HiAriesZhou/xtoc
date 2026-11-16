// Optional AI requests access only to the provider the user configures.
export const originPattern = (endpoint) => `${new URL(endpoint).origin}/*`;

export function aiPermissions(endpoint) {
  return { origins: [originPattern(endpoint)] };
}
