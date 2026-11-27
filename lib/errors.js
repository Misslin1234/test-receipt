"use strict";

class UserError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.name = "UserError";
    this.exitCode = exitCode;
  }
}

module.exports = { UserError };
