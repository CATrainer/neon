#!/usr/bin/env node
// The CLI is TypeScript; tsx compiles it on the way in. There is no build step
// to forget, which matters for something CI and a Stop hook depend on.
import { register } from 'tsx/esm/api'
register()
await import('../src/main.ts')
