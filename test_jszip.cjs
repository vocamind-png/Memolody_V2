const fs = require('fs');
const JSZip = require('jszip');

async function test() {
  const blob = fs.readFileSync('temp.mxl');
  const jszipInstance = new JSZip();
  const zip = await jszipInstance.loadAsync(blob);
  let xmlContent = '';
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
      xmlContent = await file.async('string');
      break;
    }
  }
  console.log("Length of xmlContent:", xmlContent.length);
}
test();
