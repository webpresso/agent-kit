#!/usr/bin/env node

import { runNamedBin } from './_run.js'

runNamedBin('wp', ['hook', 'post-tool', ...process.argv.slice(2)])
