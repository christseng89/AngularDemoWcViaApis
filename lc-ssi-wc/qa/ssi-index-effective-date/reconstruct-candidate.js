const fs = require("node:fs");
const crypto = require("node:crypto");
const cp = require("node:child_process");
const diff = require("diff");

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const sha256 = (value) =>
  crypto
    .createHash("sha256")
    .update(Buffer.from(value, "utf8"))
    .digest("hex")
    .toUpperCase();

const paths = [
  "apps/ssi-portal/src/app/app.component.html",
  "apps/ssi-portal/src/test/app/ssi-index-approved-visibility.spec.ts",
  "apps/ssi-portal/src/app/ssi-maintenance-index.ts",
  "apps/ssi-portal/src/test/app/ssi-maintenance-index.spec.ts",
  "apps/ssi-service/src/app/sqlite-ssi.repository.ts",
  "apps/ssi-service/src/test/app/sqlite-repositories.spec.ts",
];
const final = Object.fromEntries(
  paths.map((path) => [path, normalize(fs.readFileSync(path, "utf8"))]),
);
const base = {};

base[paths[0]] = final[paths[0]]
  .replace("                              Effective Date", "                              Effective Period")
  .replace(
    '                            <td>{{ row.route["validTo"] || "—" }}</td>',
    [
      "                            <td>",
      '                              {{ row.route["validFrom"] || "—" }} →',
      '                              {{ row.route["validTo"] || "—" }}',
      "                            </td>",
    ].join("\n"),
  );
base[paths[1]] = final[paths[1]]
  .replace(
    /  it\("labels and renders the effective end date[\s\S]*?\n  \}\);\n\n/,
    "",
  )
  .replace('      "Effective Date",', '      "Effective Period",');
base[paths[2]] = normalize(
  cp.execSync(`git show HEAD:lc-ssi-wc/${paths[2]}`, { encoding: "utf8" }),
);
base[paths[3]] = normalize(
  cp.execSync(`git show HEAD:lc-ssi-wc/${paths[3]}`, { encoding: "utf8" }),
);
base[paths[4]] = final[paths[4]].replace(
  "EFFECTIVE_PERIOD: \"json_extract(payload,'$.route.validTo')\"",
  "EFFECTIVE_PERIOD: \"json_extract(payload,'$.route.validFrom')\"",
);
const sqliteTestStart = final[paths[5]].indexOf(
  '  it("orders the EFFECTIVE_PERIOD contract by the displayed validTo date"',
);
const sqliteTestEnd = final[paths[5]].indexOf(
  '  it("inherits legacy revision applicability inside the approval transaction"',
  sqliteTestStart,
);
base[paths[5]] =
  final[paths[5]].slice(0, sqliteTestStart) + final[paths[5]].slice(sqliteTestEnd);

const expectedBase = [
  "C96B394648892900D9995ACB6202CBAE7C2E4C841758DAF6BF3A74F3D0413B0A",
  "5EDCA7D92BDB3042CEE78F31E546A3E8B1B54D47A5641E85BF457BBDFFB321BB",
  "540EF9920A0EBDA9B51F58A3F75F700716E46A7A9C51560708C633DD3490A495",
  "8D091B0B5AC9BF6801B3AA6D7CFE7EC5F52A24DF4D9988171E721F0650FF8ACF",
  "DC63B5AB044ADB107124CDBECB57984D89B07F05BFE8334F11085E9B384F9393",
  "12910792825F01245D2F1491A956F5F8E889F30409582332D77F4C8D13238B6E",
];

paths.forEach((path, index) => {
  const actual = sha256(base[path]);
  console.log(
    `BASE ${index + 1} ${actual} ${actual === expectedBase[index] ? "MATCH" : "MISMATCH"}`,
  );
});

let patch = "";
for (const path of paths) {
  patch += diff.createTwoFilesPatch(
    `a/${path}`,
    `b/${path}`,
    base[path],
    final[path],
    "",
    "",
    { context: 3 },
  );
}
patch = normalize(patch);
console.log(`PATCH_BYTES ${Buffer.byteLength(patch)}`);
console.log(`PATCH_SHA256 ${sha256(patch)}`);
