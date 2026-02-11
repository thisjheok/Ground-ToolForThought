import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { OllamaProvider } from "./OllamaProvider";

const execFileAsync = promisify(execFile);

async function hasOllamaCli(): Promise<boolean> {
  try {
    await execFileAsync("ollama", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function hasModelInstalled(model: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ollama", ["list"]);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.some((line) => line.startsWith(`${model} `) || line === model);
  } catch {
    return false;
  }
}

async function showOllamaInstallGuide(model: string): Promise<void> {
  const selection = await vscode.window.showErrorMessage(
    [
      "Ground: Ollama is not installed.",
      "1) Install from https://ollama.com/download",
      `2) Run: ollama pull ${model}`,
      "3) Retry your command.",
    ].join("\n"),
    "Open Ollama Download"
  );

  if (selection === "Open Ollama Download") {
    await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/download"));
  }
}

async function showModelInstallGuide(model: string): Promise<void> {
  const selection = await vscode.window.showErrorMessage(
    [
      `Ground: Model "${model}" is not installed in Ollama.`,
      `Run in terminal: ollama pull ${model}`,
      "After install, retry your command.",
    ].join("\n"),
    "Open Ollama Docs"
  );

  if (selection === "Open Ollama Docs") {
    await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/library"));
  }
}

async function showOllamaRuntimeGuide(baseUrl: string): Promise<void> {
  const selection = await vscode.window.showErrorMessage(
    [
      "Ground: Ollama is installed, but the server is not reachable.",
      `Configured base URL: ${baseUrl}`,
      "Start Ollama, then retry.",
    ].join("\n"),
    "Open Ollama Docs"
  );

  if (selection === "Open Ollama Docs") {
    await vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/download"));
  }
}

export async function ensureOllamaModelReady(baseUrl: string, model: string): Promise<boolean> {
  const cliInstalled = await hasOllamaCli();
  if (!cliInstalled) {
    await showOllamaInstallGuide(model);
    return false;
  }

  const modelInstalled = await hasModelInstalled(model);
  if (!modelInstalled) {
    await showModelInstallGuide(model);
    return false;
  }

  const ollama = new OllamaProvider({ baseUrl, model });
  const health = await ollama.healthCheck();
  if (!health.ok) {
    await showOllamaRuntimeGuide(baseUrl);
    return false;
  }

  return true;
}
