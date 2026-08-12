const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, "ERP-Fixes-Summary.html");
  await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
  await page.pdf({
    path: path.resolve(__dirname, "ERP-Fixes-Summary.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
  });
  await browser.close();
  console.log("PDF generated successfully: docs/ERP-Fixes-Summary.pdf");
})();
