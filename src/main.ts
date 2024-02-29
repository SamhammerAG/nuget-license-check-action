import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import minimist from "minimist";
import chain from "lodash";
import {v4 as uuidv4} from "uuid";
import mustache from "mustache";

interface LicenseInfoRepo {
  Type: string;
  Url: string;
  Commit: string;
}

interface LicenseInfo {
  PackageName: string;
  PackageVersion: string;
  PackageUrl: string;
  Copyright: string;
  Authors: string[];
  Description: string;
  LicenseUrl: string;
  LicenseType: string;
  Repository: LicenseInfoRepo;
  LicenseText?: string;
}

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
    const exportDir = argv.exportDir ?? core.getInput("exportDir");
    const tempExportDir = path.join(os.tmpdir(), uuidv4());

    const args = ["--input", projectDir, "--unique"];
    await addProjectsFilter(args, projectsFilter);
    await addAllowedLicenses(args, allowedLicenses);
    await addLicenseUrlMappings(args, projectDir);
    await addLicensePackageMappings(args, projectDir);
    await addExportOptions(args, exportDir, tempExportDir);

    await exec("dotnet-project-licenses", args);

    await buildReport(tempExportDir, exportDir);
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

  await fs.promises.writeFile(projectsFilterFile, JSON.stringify(projectsFilterList));
  args.push("--projects-filter", projectsFilterFile);
}

async function addAllowedLicenses(args: string[], allowedLicenses: string) {
  const allowedLicensesFile = path.join(os.tmpdir(), "allowedLicenses.json");
  const allowedLicensesList = chain(allowedLicenses)
    .split(";")
    .filter((x) => x.length > 0)
    .value();

  await fs.promises.writeFile(allowedLicensesFile, JSON.stringify(allowedLicensesList));
  args.push("--allowed-license-types", allowedLicensesFile);
}

async function addLicenseUrlMappings(args: string[], projectDir: string) {
  const licenseUrlFile = path.join(projectDir, "licenseUrls.json");
  if (fs.existsSync(licenseUrlFile)) {
    args.push("--licenseurl-to-license-mappings", licenseUrlFile);
  }
}

async function addLicensePackageMappings(args: string[], projectDir: string) {
  const licenseInfoFile = path.join(projectDir, "licenseInfos.json");
  if (fs.existsSync(licenseInfoFile)) {
    args.push("--manual-package-information", licenseInfoFile);
  }
}

async function addExportOptions(args: string[], exportDir: string, tempExportDir: string) {
  if (!exportDir) return;

  args.push("--output-directory", tempExportDir);
  args.push("--json", tempExportDir);
  args.push("--export-license-texts");
  args.push("--convert-html-to-text");
}

async function buildReport(tempExportDir: string, exportDir: string) {
  if (!exportDir) return;

  const licensesFile = path.join(exportDir, "licenses.html");
  const tempLicensesFile = path.join(tempExportDir, "licenses.json");
  
  const licenses: LicenseInfo[] = JSON.parse(await fs.promises.readFile(tempLicensesFile, "utf-8"));
  await addLicenseText(licenses, tempExportDir);

  const licensesHtml = await buildHtml(licenses);
  await fs.promises.writeFile(licensesFile, licensesHtml);
}

async function addLicenseText(licenses: LicenseInfo[], tempExportDir: string) {
  for (const license of licenses) {
    const licenseTextFile = path.join(tempExportDir, `${license.PackageName}_${license.PackageVersion}.txt`);
    if (fs.existsSync(licenseTextFile)) {
      license.LicenseText = await fs.promises.readFile(licenseTextFile, "utf-8");
    }
  }
}

async function buildHtml(licenses: LicenseInfo[]): Promise<string> {
  const template = `<html><body><h1>License Notes</h1>
    {{#.}}<b>{{PackageName}}</b> - {{LicenseType}}
    <p>{{LicenseText}}</p>{{/.}}
  </body></html>`;

  return mustache.render(template, licenses);
}

run();

