import js from '@eslint/js'
import solid from 'eslint-plugin-solid/configs/typescript'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, solid],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
)
