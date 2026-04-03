import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import solc from "solc";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(rootDir, "src");
const artifactsDir = path.join(rootDir, "artifacts");

async function compileContracts() {
  const entries = await Promise.all(
    (await readdir(sourceDir))
      .filter((name) => name.endsWith(".sol"))
      .map(async (name) => [name, { content: await readFile(path.join(sourceDir, name), "utf8") }] as const)
  );
  const sources = Object.fromEntries(entries);
  const input = {
    language: "Solidity",
    sources,
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.some((error: { severity: string }) => error.severity === "error")) {
    throw new Error(`Contract compile failed: ${JSON.stringify(output.errors, null, 2)}`);
  }

  await mkdir(artifactsDir, { recursive: true });
  for (const [fileName, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [contractName, contractOutput] of Object.entries(contracts as Record<string, any>)) {
      const artifactPath = path.join(artifactsDir, `${contractName}.json`);
      await writeFile(
        artifactPath,
        JSON.stringify(
          {
            sourceName: fileName,
            contractName,
            abi: contractOutput.abi,
            bytecode: contractOutput.evm.bytecode.object
          },
          null,
          2
        )
      );
    }
  }
}

await compileContracts();

if (!process.argv.includes("--check")) {
  console.log(`Compiled contracts to ${artifactsDir}`);
}
