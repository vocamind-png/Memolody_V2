import JSZip from 'jszip';

async function test() {
  const resp = await fetch('https://storage.googleapis.com/memolody-vault/pdmx-vault/QmbbGKtZ9G6DkWxvSeU516c1ktWiFJmEbHGmR3JFtLAPyC.mxl');
  const blob = await resp.blob();
  const zip = await JSZip.loadAsync(blob);
  let xmlContent = '';
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
      xmlContent = await (file as any).async('string');
      break;
    }
  }
  console.log("Extracted length:", xmlContent.length);
}

test().catch(console.error);
