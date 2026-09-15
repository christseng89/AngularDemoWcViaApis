import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { MessageMappingService } from './message-mapping.service';

const ALLOWED_EXTENSIONS = new Set(['.ssi', '.json']);
const MAX_FILES = 100;
const MAX_BYTES = 64 * 1024;

export interface PseudoSwiftSample { readonly path: string; readonly format: 'FIN_LIKE' | 'MX_JSON'; readonly bytes: number; }

@Injectable()
export class SampleImportService {
  constructor(private readonly mapping: MessageMappingService) {}

  list(): readonly PseudoSwiftSample[] {
    const root = this.root();
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
      .map((entry) => resolve(entry.parentPath, entry.name))
      .filter((path) => ALLOWED_EXTENSIONS.has(extname(path).toLowerCase()))
      .slice(0, MAX_FILES);
    return files.map((path) => {
      const stat = lstatSync(path);
      return { path: relative(root, path).replaceAll('\\', '/'), format: extname(path).toLowerCase() === '.json' ? 'MX_JSON' : 'FIN_LIKE', bytes: stat.size };
    });
  }

  load(samplePath: string): { sample: PseudoSwiftSample; content: string; extraction: unknown } {
    const path = this.safePath(samplePath);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new BadRequestException('INVALID_SAMPLE_FILE');
    if (stat.size > MAX_BYTES) throw new BadRequestException('SAMPLE_FILE_TOO_LARGE');
    const format = extname(path).toLowerCase() === '.json' ? 'MX_JSON' : 'FIN_LIKE';
    const content = readFileSync(path, 'utf8');
    return { sample: { path: samplePath.replaceAll('\\', '/'), format, bytes: stat.size }, content, extraction: this.mapping.extract(this.mapping.parse(content, format)) };
  }

  importDirectory(): { rootAlias: string; imported: number; failed: number; results: readonly unknown[] } {
    const results = this.list().map((sample) => {
      try { return { status: 'IMPORTED', ...this.load(sample.path) }; }
      catch (error) { return { status: 'FAILED', sample, error: error instanceof Error ? error.message : 'IMPORT_FAILED' }; }
    });
    return { rootAlias: 'SAMPLE_ROOT', imported: results.filter((result) => result.status === 'IMPORTED').length, failed: results.filter((result) => result.status === 'FAILED').length, results };
  }

  private root(): string { return resolve(process.env['SAMPLE_ROOT'] ?? resolve(process.cwd(), 'samples')); }
  private safePath(samplePath: string): string {
    if (!samplePath || !/^[a-zA-Z0-9._/-]+$/.test(samplePath)) throw new BadRequestException('INVALID_SAMPLE_PATH');
    const root = this.root(); const target = resolve(root, samplePath);
    if (!target.startsWith(`${root}${sep}`) || !ALLOWED_EXTENSIONS.has(extname(target).toLowerCase())) throw new BadRequestException('SAMPLE_PATH_OUTSIDE_ROOT');
    try { lstatSync(target); } catch { throw new NotFoundException('SAMPLE_NOT_FOUND'); }
    return target;
  }
}
