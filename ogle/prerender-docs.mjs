#!/usr/bin/env node
// Bakes each doc page's README markdown into its index.html so the page renders
// instantly with no runtime fetch to GitHub. Run on redeploy to refresh:
//
//   node ogle/prerender-docs.mjs
//
// The markdown is inlined into a <script type="text/markdown" id="readme-source">
// tag between the <!--README:START--> / <!--README:END--> markers; the page's
// client JS parses it locally with the self-hosted marked.min.js.

import { readFile, writeFile } from "node:fs/promises";

const PAGES = [
  {
    file: new URL("./metabolism/index.html", import.meta.url),
    raw: "https://raw.githubusercontent.com/cjreplogle/metabolic-map-hotkey/main/README.md",
  },
  {
    file: new URL("./janki/index.html", import.meta.url),
    raw: "https://raw.githubusercontent.com/cjreplogle/janki/master/README.md",
  },
];

const START = "<!--README:START-->";
const END = "<!--README:END-->";
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REGION = new RegExp(esc(START) + "[\\s\\S]*?" + esc(END));

for (const page of PAGES) {
  const res = await fetch(page.raw);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${page.raw} (${res.status})`);
  }
  const md = await res.text();

  // A literal </script would terminate the inline <script> tag early.
  if (/<\/script/i.test(md)) {
    throw new Error(`README contains </script and can't be inlined safely: ${page.raw}`);
  }

  let html = await readFile(page.file, "utf8");
  if (!REGION.test(html)) {
    throw new Error(`Missing README markers in ${page.file.pathname}`);
  }
  html = html.replace(REGION, `${START}\n${md}\n${END}`);
  await writeFile(page.file, html);
  console.log(`baked ${page.file.pathname.split("/").slice(-2).join("/")} (${md.length} chars)`);
}
