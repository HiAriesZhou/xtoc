/** @type {import('extension').FileConfig} */
// Keep local Chrome development profiles between runs.
const profile = (name) => `./dist/extension-profile-${name}`

export default {
  browser: {
    chrome: {profile: profile('chrome')},
    chromium: {profile: profile('chromium')}
  }
}
