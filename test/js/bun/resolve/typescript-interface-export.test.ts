import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDirWithFiles } from "harness";

describe("TypeScript interface exports", () => {
  test("direct interface export and import", async () => {
    const dir = tempDirWithFiles("interface-export", {
      "types.ts": `
        export interface User {
          name: string;
          id: number;
        }
      `,
      "consumer.ts": `
        import { User } from './types';
        
        const user: User = { name: "Alice", id: 123 };
        console.log(user.name);
      `,
    });

    await using proc = Bun.spawn({
      cmd: [bunExe(), "run", "consumer.ts"],
      env: bunEnv,
      cwd: dir,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stdout).toBe("Alice\n");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("interface export through re-export chain", async () => {
    const dir = tempDirWithFiles("interface-reexport", {
      "types.ts": `
        export interface User {
          name: string;
          id: number;
        }
        export const someValue = "test value";
      `,
      "index.ts": `
        export * from './types.js';
      `,
      "consumer.ts": `
        import { User, someValue } from './index';
        
        const user: User = { name: "Bob", id: 456 };
        console.log(someValue);
        console.log(user.name);
      `,
    });

    await using proc = Bun.spawn({
      cmd: [bunExe(), "run", "consumer.ts"],
      env: bunEnv,
      cwd: dir,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stdout).toBe("test value\nBob\n");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("bundling interface exports works correctly", async () => {
    const dir = tempDirWithFiles("interface-bundle", {
      "types.ts": `
        export interface User {
          name: string;
          id: number;
        }
        export const defaultUser = { name: "Default", id: 0 };
      `,
      "consumer.ts": `
        import { User, defaultUser } from './types';
        
        const user: User = defaultUser;
        console.log(user.name);
      `,
    });

    await using proc = Bun.spawn({
      cmd: [bunExe(), "build", "consumer.ts", "--outdir", "dist"],
      env: bunEnv,
      cwd: dir,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Bundled");

    // Check that the bundled file works
    const bundledContent = await Bun.file(`${dir}/dist/consumer.js`).text();
    expect(bundledContent).toContain("Default");
  });

  test("mixed interface and value exports with re-exports", async () => {
    const dir = tempDirWithFiles("mixed-exports", {
      "base.ts": `
        export interface Config {
          theme: string;
        }
        export class Logger {
          log(msg: string) { console.log(msg); }
        }
        export const version = "1.0.0";
      `,
      "index.ts": `
        export * from './base.js';
      `,
      "app.ts": `
        import { Config, Logger, version } from './index';
        
        const config: Config = { theme: "dark" };
        const logger = new Logger();
        
        console.log(version);
        logger.log(config.theme);
      `,
    });

    await using proc = Bun.spawn({
      cmd: [bunExe(), "run", "app.ts"],
      env: bunEnv,
      cwd: dir,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stdout).toBe("1.0.0\ndark\n");
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
  });

  test("bundling handles interface used as value correctly", async () => {
    const dir = tempDirWithFiles("interface-bundle-value", {
      "types.ts": `
        export interface User {
          name: string;
        }
      `,
      "consumer.ts": `
        import { User } from './types';
        
        // This will bundle but fail at runtime - expected behavior
        console.log(new User());
      `,
    });

    // Bundling should succeed (our fix works)
    await using bundleProc = Bun.spawn({
      cmd: [bunExe(), "build", "consumer.ts", "--outdir", "dist"],
      env: bunEnv,
      cwd: dir,
    });

    const bundleExitCode = await bundleProc.exited;
    expect(bundleExitCode).toBe(0);

    // The bundled code will have the interface import resolved
    const bundledContent = await Bun.file(`${dir}/dist/consumer.js`).text();
    expect(bundledContent).toContain("new User");
  });
});