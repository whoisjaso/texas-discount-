import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The SOP's money test vectors are written against a $400 fee stack
    // ($33 title + $75 registration + $292 doc fee). This is a TEST FIXTURE,
    // not Discount's fee: production reads NEXT_PUBLIC_DEALER_DOC_FEE from the
    // owner, and files nothing until it is set.
    //
    // $292 is above the $225 Texas presumes reasonable (7 TAC §84.205(b)(1)),
    // so a test that FILES with it must carry a recorded OCCC filing of at
    // least $292 (rulebook texas-dealer-fees.md section 5.7). The five
    // NEXT_PUBLIC_DEALER_OCCC_* values below are that fixture filing. They
    // are NOT Discount's filing: no filing is ever assumed in production,
    // where these are unset and the cap is $225.00.
    env: {
      NEXT_PUBLIC_DEALER_DOC_FEE: '292',
      NEXT_PUBLIC_DEALER_OCCC_FILED_MAX: '292',
      NEXT_PUBLIC_DEALER_OCCC_FILED_ON: '2026-01-02',
      NEXT_PUBLIC_DEALER_OCCC_EFFECTIVE_ON: '2026-01-02',
      NEXT_PUBLIC_DEALER_OCCC_LICENSE: 'TEST FIXTURE',
      NEXT_PUBLIC_DEALER_OCCC_LOCATION: 'TEST FIXTURE',
    },
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
