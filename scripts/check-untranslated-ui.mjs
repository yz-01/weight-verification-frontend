import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src");
const safeText = new Set([
  "Bahasa Malaysia",
  "Cloud Weighing Engine",
  "Ctrl K",
  "English",
  "Excel",
  "MSE Trace",
  "PDF",
  "PNG",
  "RM",
  "SHA-256:",
  "XLSX",
  "KB",
  "kg",
  "m",
  "s",
  "s ·",
  "v",
  "(v",
  "/ MYR",
  "/ RM",
  "-&gt;",
]);
const checkedAttributes = new Set(["aria-label", "placeholder", "title"]);
const findings = [];

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(fullPath);
    return /\.tsx$/.test(entry.name) ? [fullPath] : [];
  });
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isAllowed(value) {
  if (!/[A-Za-z]/.test(value)) return true;
  if (safeText.has(value)) return true;
  if (/^https?:\/\//.test(value)) return true;
  if (/^[A-Z]{2,8}-\d{2,}$/.test(value)) return true;
  return false;
}

for (const file of filesIn(root)) {
  const sourceText = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function inspect(node) {
    let value = "";
    if (ts.isJsxText(node)) {
      value = normalize(node.getText(source));
    } else if (
      ts.isJsxAttribute(node) &&
      checkedAttributes.has(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      value = normalize(node.initializer.text);
    }

    if (value && !isAllowed(value)) {
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push(`${path.relative(process.cwd(), file)}:${location.line + 1}: ${value}`);
    }
    ts.forEachChild(node, inspect);
  }

  inspect(source);
}

if (findings.length) {
  console.error("Hard-coded English UI text found. Use the message catalogue or explicitly allow a stable brand/unit token:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("No untranslated JSX text or accessibility labels found.");
