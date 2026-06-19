#!/usr/bin/env node

import { runNamedBin } from './_run.js'

runNamedBin('wp', ['hook', 'guard-switch', ...process.argv.slice(2)])
