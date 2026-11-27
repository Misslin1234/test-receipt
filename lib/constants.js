"use strict";

const path = require("node:path");

const RECEIPT_DIR = ".test-receipt";
const RECEIPT_FILE = "latest.json";
const SCHEMA_VERSION = 1;

function receiptPath(cwd) {
  return path.join(cwd, RECEIPT_DIR, RECEIPT_FILE);
}

module.exports = {
  RECEIPT_DIR,
  RECEIPT_FILE,
  SCHEMA_VERSION,
  receiptPath,
};
