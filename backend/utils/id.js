const { v4: uuid } = require("uuid");

function newId() {
  return uuid();
}

module.exports = { newId };