#!/usr/bin/env node

import { runNamedBin } from './_run.js'

runNamedBin('wp', ['hook', 'sessionstart-routing', ...process.argv.slice(2)])
