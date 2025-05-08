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


    const args = ["--input", solutionPath];

    await addExcludeProjects(args, excludeProjects);
    await addAllowedLicenses(args, allowedLicenses);
    await addLicenseUrlMappings(args, projectDir);
    await addLicensePackageMappings(args, projectDir);
    await addIgnorePackages(args, projectDir);
    
    // The duplicate exec is intentional, when using export options, there is no CLI output.
    // Therefore, we must run exec twice, once to capture the output and once to perform the export.
    await exec("nuget-license", args);
    const tempExportDir = await addExportOptions(args, exportDir);
    await exec("nuget-license", args);
    
    await buildReport(tempExportDir, exportDir);
    
  } catch (error: unknown) {
    core.setFailed((error as { message: string }).message);
  }
}

async function addExcludeProjects(args: string[], excludeProjects: string) {
  if (!excludeProjects) {
    return;
  }

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

async function addExportOptions(args: string[], exportDir: string): Promise<string> {
  if (!exportDir) return "";
  const tempExportDir = path.join(os.tmpdir(), uuidv4());

  const fileOutput = path.join(tempExportDir, "licenses.json");
  args.push("--file-output", fileOutput);
  args.push("--output", "json");
  args.push("--license-information-download-location", tempExportDir);

  return tempExportDir;
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
    const base = path.join(tempExportDir, `${license.PackageId}__${license.PackageVersion}`);

    const txtPath = `${base}.txt`;
    if (fs.existsSync(txtPath)) {
      license.LicenseText = await fs.promises.readFile(txtPath, "utf-8");
      continue;
    }

    const htmlPath = `${base}.html`;
    if (fs.existsSync(htmlPath)) {
      const html = await fs.promises.readFile(htmlPath, "utf-8");
      license.LicenseText = await extractTextFromHtml(html);
    }
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
run();

