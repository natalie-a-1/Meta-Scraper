// Deploy only an explicitly selected project, from a clean temporary directory.
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const [environment, target] = process.argv.slice(2);
if (!["production", "sandbox"].includes(environment) || !["gateway", "metascraper"].includes(target))
  throw new Error("Usage: node infra/mcp-gateway/deploy.mjs <production|sandbox> <gateway|metascraper>");
const root = new URL("../../", import.meta.url);
const registry = JSON.parse(await readFile(new URL("registry.json", import.meta.url), "utf8"));
const config = target === "gateway" ? registry.environments[environment] : registry.products.metascraper[environment];
const projectId = config.projectId || config.gatewayProjectId;
const projectName = config.project || config.gatewayProject;
const orgId = "team_2aFz3tfeEI0t2CHkmR6Ll7z4";
const stage = await mkdtemp(join(tmpdir(), `lucci-${environment}-${target}-`));
try {
  if (target === "gateway") {
    const source = new URL(`./${environment}/`, import.meta.url);
    await cp(new URL("vercel.json", source), join(stage, "vercel.json"));
    await cp(new URL("public", source), join(stage, "public"), { recursive: true });
  } else {
    for (const file of ["Dockerfile.vercel", "vercel.json"]) await cp(new URL(file, root), join(stage, file));
    await mkdir(join(stage, "mcp/scripts"), { recursive: true });
    for (const folder of ["src", "web", "skills"])
      await cp(new URL(`mcp/${folder}`, root), join(stage, "mcp", folder), { recursive: true });
    for (const file of ["package.json", "package-lock.json", "scripts/build.mjs"])
      await cp(new URL(`mcp/${file}`, root), join(stage, "mcp", file));
  }
  await mkdir(join(stage, ".vercel"));
  await writeFile(join(stage, ".vercel/project.json"), JSON.stringify({ projectId, orgId, projectName }));
  console.log(`Deploying ${environment} ${target} to ${projectName} (${projectId})`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "vercel@59.16.0", "deploy", "--prod", "--yes", "--scope", "lucci"], {
      cwd: stage, stdio: "inherit",
      env: { ...process.env, VERCEL_PROJECT_ID: projectId, VERCEL_ORG_ID: orgId },
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) throw new Error(`Deployment failed (${exitCode}); source: ${fileURLToPath(root)}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
