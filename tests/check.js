/* The app's own code is the last <script> block; the three before it are vendored libraries. */
const fs=require("fs");
const path=require("path");
const APP=path.join(__dirname,"..","index.html");
const s=fs.readFileSync(APP,"utf8");
const i=s.lastIndexOf("<script>"), j=s.indexOf("</script>", i);
const body=s.slice(i+8, j);
console.log("extracted bytes:",body.length);
fs.writeFileSync(__dirname+"/_snippet.js",body);
