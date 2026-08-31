import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Web Component build style contract', () => {
  it('emits stable un-hashed CSS containing Bootstrap and the existing global SCSS', () => {
    const workspace = JSON.parse(readFileSync(join(process.cwd(), 'angular.json'), 'utf8')) as {
      projects: Record<
        string,
        {
          architect: {
            build: {
              options: { styles: string[] };
              configurations: { production: { outputHashing: string } };
            };
          };
        }
      >;
    };
    const build = workspace.projects['balance-component-wc'].architect.build;

    expect(build.options.styles).toEqual(['node_modules/bootstrap/dist/css/bootstrap.min.css', 'src/styles.scss']);
    expect(build.configurations.production.outputHashing).toBe('none');
  });
});
