"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { UserError } = require("./errors");

function resolveCwd(cwd) {
  const dir = path.resolve(cwd || process.cwd());
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch (err) {
    throw new UserError("not a directory: " + dir + " (" + err.code + ")");
  }
  if (!stat.isDirectory()) {
    throw new UserError("not a directory: " + dir);
  }
  return dir;
}

module.exports = { resolveCwd };
