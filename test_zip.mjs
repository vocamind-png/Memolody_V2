import JSZip from 'jszip';

async function test() {
  const url = "https://storage.googleapis.com/memolody-vault/pdmx-vault/QmbbGKtZ9G6DkWxvSeU516c1ktWiFJmEbHGmR3JFtLAPyC.mxl";
  const resp = await fetch(url);
  const blob = await resp.arrayBuffer();
  console.log("Buffer size:", blob.byteLength);
  
  const jszipInstance = new JSZip();
  try {
    const zip = await jszipInstance.loadAsync(blob);
    for (const [name, file] of Object.entries(zip.files)) {
      console.log("File in zip:", name);
    }
  } catch(e) {
    console.error("JSZip error:", e);
  }
}
test();
