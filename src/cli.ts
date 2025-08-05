#!/usr/bin/env bun

const [bunBin, cliBin, command, ...args] = process.argv;
console.log({ bunBin, cliBin, command, args: [...args] });
