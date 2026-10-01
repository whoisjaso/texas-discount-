import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The SOP's money test vectors are written against a $400 fee stack
    // ($33 title + $75 registration + $292 doc fee). This is a TEST FIXTURE,
    // not Vega's fee: production reads NEXT_PUBLIC_DEALER_DOC_FEE from the
    // owner, and files nothing until it is set.
    env: { NEXT_PUBLIC_DEALER_DOC_FEE: '292' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Tests run in Node, which is the server; the guard package would
      // otherwise refuse any module marked server-only.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
});
