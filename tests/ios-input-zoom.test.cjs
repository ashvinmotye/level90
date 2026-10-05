"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const worker=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");

assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" \/>/);
assert.doesNotMatch(html,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i,"user zoom must remain available");
assert.match(css,/@supports \(-webkit-touch-callout:none\)/,"the focus-size correction should target iOS WebKit");
assert.match(css,/input:not\(\[type="checkbox"\]\)[\s\S]*select,[\s\S]*textarea \{[\s\S]*font-size:16px !important;/,"editable controls must meet iOS's 16px focus threshold");
assert.match(css,/:not\(\[type="file"\]\)/,"non-editable file controls should keep their existing appearance");
assert.match(html,/styles\.css\?v=64/);
assert.match(worker,/const CACHE = "level90-v64";/);

console.log("Level90 iOS input focus zoom tests passed");
