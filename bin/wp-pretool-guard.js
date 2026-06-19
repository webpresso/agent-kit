#!/usr/bin/env node

import { runNamedBin } from './_run.js'

runNamedBin('wp', ['hook', 'pretool-guard', ...process.argv.slice(2)])
