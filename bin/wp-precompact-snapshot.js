#!/usr/bin/env node

import { runNamedBin } from './_run.js'

runNamedBin('wp', ['hook', 'precompact-snapshot', ...process.argv.slice(2)])
