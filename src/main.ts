import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import minimist from "minimist";
import chain from "lodash";
import {v4 as uuidv4} from "uuid";
import mustache from "mustache";
import { Parser } from "htmlparser2";

interface LicenseInfoRepo {
  Type: string;
  Url: string;
  Commit: string;
}

interface LicenseInfo {
  PackageId: string;
  PackageVersion: string;
  PackageProjectUrl: string;
  CopyRight: string;
  Authors: string[];
  License: string;
  LicenseUrl: string;
  LicenseInformationOrigin: number;
  LicenseText?: string;
}

const argv = minimist(process.argv.slice(2));

async function installTool(): Promise<void> {
  const installArgs = ["tool", "install", "-g", "nuget-license"];

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
    const solutionFileName: string = argv.solutionFileName ?? core.getInput("solutionFileName");

    const solutionPath = path.join(projectDir, solutionFileName);

    const excludeProjects: string = argv.excludeProjects ?? core.getInput("excludeProjects");
    const allowedLicenses: string = argv.allowedLicenses ?? core.getInput("allowedLicenses");
    const exportDir = argv.exportDir ?? core.getInput("exportDir");
    const tempExportDir = path.join(os.tmpdir(), uuidv4());

    const args = ["--input", solutionPath];

    await addExcludeProjects(args, excludeProjects);
    await addAllowedLicenses(args, allowedLicenses);
    await addLicenseUrlMappings(args, projectDir);
    await addLicensePackageMappings(args, projectDir);
    await addIgnorePackages(args, projectDir);
    await addExportOptions(args, exportDir, tempExportDir);
    await exec("nuget-license", args);

    await buildReport(tempExportDir, exportDir);
  } catch (error: unknown) {
    core.setFailed((error as { message: string }).message);
  }
}

async function addExcludeProjects(args: string[], excludeProjects: string) {
  const excludeProjectsFile = path.join(os.tmpdir(), "excludeProjects.json");
  const excludeProjectsList = chain(excludeProjects)
    .split(";")
    .filter((x) => x.length > 0)
    .value();

  await fs.promises.writeFile(excludeProjectsFile, JSON.stringify(excludeProjectsList));
  args.push("--exclude-projects-matching", excludeProjects);
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
    args.push("--override-package-information", licenseInfoFile);
  } 
}

async function addIgnorePackages(args: string[], projectDir: string) {
  const ignorePackagesFile = path.join(projectDir, "ignorePackages.json");
  if (fs.existsSync(ignorePackagesFile)) {
    args.push("--ignored-packages", ignorePackagesFile);
  }
}

async function addExportOptions(args: string[], exportDir: string, tempExportDir: string) {
  if (!exportDir) return;

  const fileOutput = path.join(tempExportDir, "licenses.json");
  args.push("--file-output", fileOutput);
  args.push("--output", "json");
  args.push("--license-information-download-location", tempExportDir);
}

async function buildReport(tempExportDir: string, exportDir: string) {
  if (!exportDir) return;

  const licensesFile = path.join(exportDir, "licenses.html");
  const tempLicensesFile = path.join(tempExportDir, "licenses.json");
  
  const licenses: LicenseInfo[] = JSON.parse(await fs.promises.readFile(tempLicensesFile, "utf-8"));
  console.log(await toMarkdownTable(licenses));
  await addLicenseText(licenses, tempExportDir);

  const licensesHtml = await buildHtml(licenses);
  await fs.promises.writeFile(licensesFile, licensesHtml);
}

async function addLicenseText(licenses: LicenseInfo[], tempExportDir: string) {
  for (const license of licenses) {
    const licenseTextFile = path.join(tempExportDir, `${license.PackageId}__${license.PackageVersion}.txt`);
    if (fs.existsSync(licenseTextFile)) {
      license.LicenseText = await fs.promises.readFile(licenseTextFile, "utf-8");
    } else {
      await addLicenseTextFromHtml(license, tempExportDir);
    }
  }
}

async function addLicenseTextFromHtml(license: LicenseInfo, tempExportDir: string) {
  const licenseHtmlFile = path.join(tempExportDir, `${license.PackageId}__${license.PackageVersion}.html`);

  if (fs.existsSync(licenseHtmlFile)) {
    const htmlText = await fs.promises.readFile(licenseHtmlFile, "utf-8");
    license.LicenseText = await extractTextFromHtml(htmlText);
  }
}

async function buildHtml(licenses: LicenseInfo[]): Promise<string> {
  const template = `<html><body><h1>License Notes</h1>
    {{#.}}<b>{{PackageId}}</b> - {{License}}
    <p>{{LicenseText}}</p>{{/.}}
  </body></html>`;

  return mustache.render(template, licenses);
}

async function extractTextFromHtml(htmlString: string): Promise<string> {
  let text = '';
  const parser = new Parser(
    {
      ontext(chunk: string) {
        text += chunk;
      },
      onerror(err: Error) {
        console.error('HTML parse error:', err);
      }
    },
    {
      decodeEntities: true,
      xmlMode: false
    }
  );

  parser.write(htmlString);
  parser.end();
  return text;
}

async function toMarkdownTable(licenses: LicenseInfo[]): Promise<string> {
  const header = [
    '| Reference                                | Version    | License Type    | License                                                                |',
    '|------------------------------------------|------------|-----------------|------------------------------------------------------------------------|'
  ];
  
  const rows = licenses.map(({ PackageId, PackageVersion, License, LicenseUrl }) => {
    return `| ${PackageId?.padEnd(40)} | ${PackageVersion?.padEnd(10)} | ${License?.padEnd(15)} | ${LicenseUrl?.padEnd(70)} |`;
  });
  
  return [...header, ...rows].join('\n');
}

run();

