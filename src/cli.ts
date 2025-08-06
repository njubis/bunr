#!/usr/bin/env bun

import { $ } from "bun";

// Enable shell command error throwing by default
$.throws(true);

const [bunBin, cliBin, command, ...args] = process.argv;
console.log({ bunBin, cliBin, command, args: [...args] });
