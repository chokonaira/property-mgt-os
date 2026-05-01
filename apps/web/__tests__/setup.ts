import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Component tests opt into jsdom via the `// @vitest-environment jsdom`
// pragma at the top of the file. When jsdom isn't loaded, the cleanup
// call is a no-op because there's nothing to unmount.
afterEach(() => {
  if (typeof document !== 'undefined') {
    cleanup();
  }
});
