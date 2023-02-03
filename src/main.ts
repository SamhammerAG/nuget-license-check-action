import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import minimist from "minimist";
import chain from "lodash";

const argv = minimist(process.argv.slice(2));

async function installTool(): Promise<void> {
  const installArgs = ["tool", "install", "-g", "dotnet-project-licenses"];

  const toolVersion = core.getInput("toolVersion");
  if (toolVersion) {
    installArgs.push("--version", toolVersion);
  }

  const exitCode = await exec("dotnet", installArgs, {
    ignoreReturnCode: true,
  });

  if (exitCode > 1) {
    throw new Error("Failed to install dotnet affected tool");
  }

  core.addPath(path.join(os.homedir(), ".dotnet", "tools"));
}

async function run(): Promise<void> {
  try {
    await installTool();

    const projectDir: string = argv.projectDir ?? core.getInput("projectDir");
    const projectsFilter: string = argv.projectsFilter ?? core.getInput("projectsFilter");
    const allowedLicenses: string = argv.allowedLicenses ?? core.getInput("allowedLicenses");

    const args = ["--input", projectDir, "--unique"];
    await addProjectsFilter(args, projectsFilter);
    await addAllowedLicenses(args, allowedLicenses);

    await exec("dotnet-project-licenses", args);
  } catch (error: unknown) {
    core.setFailed((error as { message: string }).message);
  }
}

async function addProjectsFilter(args: string[], projectsFilter: string) {
  const projectsFilterFile = path.join(os.tmpdir(), "projectsFilter.json");
  const projectsFilterList = chain(projectsFilter)
    .split(";")
    .filter((x) => x.length > 0)
    .value();

  await fs.writeFile(projectsFilterFile, JSON.stringify(projectsFilterList));
  args.push("--projects-filter", projectsFilterFile);
}

async function addAllowedLicenses(args: string[], allowedLicenses: string) {
  const allowedLicensesFile = path.join(os.tmpdir(), "allowedLicenses.json");
  const allowedLicensesList = chain(allowedLicenses)
    .split(";")
    .filter((x) => x.length > 0)
    .value();

  await fs.writeFile(allowedLicensesFile, JSON.stringify(allowedLicensesList));
  args.push("--allowed-license-types", allowedLicensesFile);
}

run();
