# Eslint Plugin Sort Imports

## Installation

Since this is an internal repository, you need to install it slightly different than usual:


```bash
yarn add -D eslint-plugin-sort-imports@ssh://git@git.netfiles.dev:2224/vueture/eslint-plugin-sort-imports.git
```

# Configuration (eslint.config.js)

```javascript
// your other imports
import sortImports from 'eslint-plugin-sort-imports';

import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,jsx,tsx}'],
  // your other settings
  {
    plugins: {
      // ... your other plugins
      // HERE
      'sort-imports': sortImports
    },
    rules: {
      // your other rules
      'sort-imports/sort-rule': 'error'
    }
  }
];
```


# Usage

Just run your lint
