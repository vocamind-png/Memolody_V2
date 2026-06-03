const verovio = require('verovio');
verovio.module.onRuntimeInitialized = () => {
    const vrvToolkit = new verovio.toolkit();
    const mei = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="https://music-encoding.org/schema/dev/mei-all.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
   <music>
      <body>
         <mdiv>
            <score>
               <scoreDef>
                  <staffGrp>
                     <staffDef n="1" lines="5" />
                     <staffDef n="2" lines="5" />
                  </staffGrp>
               </scoreDef>
               <section>
                  <measure n="1">
                     <staff n="1">
                        <layer n="1"><note dur="4" oct="4" pname="c" /></layer>
                     </staff>
                     <staff n="2">
                        <layer n="1"><note dur="4" oct="3" pname="c" /></layer>
                     </staff>
                  </measure>
               </section>
            </score>
         </mdiv>
      </body>
   </music>
</mei>`;
    vrvToolkit.loadData(mei);
    const svg = vrvToolkit.renderToSVG(1, {});
    console.log(svg.match(/<g[^>]*class="staff"[^>]*>/g));
};
