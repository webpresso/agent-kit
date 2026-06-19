#!/usr/bin/env node

import { runManagedHook } from './_managed-hook.js'

runManagedHook('wp-stop-qa', 'stop-qa')
