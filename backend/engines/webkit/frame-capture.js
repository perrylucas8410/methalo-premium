// backend/engines/webkit/frame-capture.js
const sharp = require("sharp");

// Takes a Playwright Page and returns a raw RGBA frame
async function capturePageFrame(page) {
  // Screenshot as PNG buffer
  const buf = await page.screenshot({
    type: "png",
    fullPage: true
  });

  // Convert PNG → raw RGBA
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data // Uint8Array RGBA
  };
}

module.exports = { capturePageFrame };