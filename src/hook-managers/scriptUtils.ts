import * as fs from 'fs';
import * as path from 'path';
import { CodingCliTool } from '../types';

export function hookScriptPath(codingCliTool: CodingCliTool, filename: string): string {
  return path.join(__dirname, 'hook-scripts', codingCliTool, filename);
}

export function copyHookScript(codingCliTool: CodingCliTool, filename: string, destPath: string): void {
  fs.copyFileSync(hookScriptPath(codingCliTool, filename), destPath);
  fs.chmodSync(destPath, 0o755);
}
