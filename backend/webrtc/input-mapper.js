function mapInputToEngine(engine, msg) {
  switch (msg.type) {
    case "mouseMove":
      engine.mouseMove(msg.x, msg.y);
      break;
    case "mouseDown":
      engine.mouseDown(msg.x, msg.y, msg.button);
      break;
    case "mouseUp":
      engine.mouseUp(msg.x, msg.y, msg.button);
      break;
    case "mouseWheel":
      engine.mouseWheel(msg.deltaX, msg.deltaY);
      break;
    case "keyDown":
      engine.keyDown(msg.key);
      break;
    case "keyUp":
      engine.keyUp(msg.key);
      break;
  }
}

module.exports = { mapInputToEngine };