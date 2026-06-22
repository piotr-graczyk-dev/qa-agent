import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(testDir, "../dist/cli.js");

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: path.resolve(testDir, "../../.."),
    encoding: "utf8",
  });
}

async function createExpoFixture() {
  const projectDir = await mkdtemp(path.join(tmpdir(), "qa-agent-init-"));
  await mkdir(path.join(projectDir, "app"), { recursive: true });
  await writeFile(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "expo-fixture",
        private: true,
        dependencies: {
          expo: "^54.0.0",
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(projectDir, "app.json"),
    `${JSON.stringify(
      {
        expo: {
          name: "Expo Fixture",
          slug: "expo-fixture",
          android: {
            package: "com.example.fixture",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(projectDir, "app", "index.js"),
    "export default null;\n",
  );

  return projectDir;
}

describe("qa-agent init", () => {
  it("scaffolds Android-first Expo/EAS setup files through the CLI seam", async () => {
    const projectDir = await createExpoFixture();
    const appJsonBefore = await readFile(path.join(projectDir, "app.json"), "utf8");
    const appSourceBefore = await readFile(
      path.join(projectDir, "app", "index.js"),
      "utf8",
    );

    const result = runCli(["init", "--project", projectDir]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent init completed/);
    assert.match(result.stdout, /created: .*qa-agent\.config\.mjs/);
    assert.match(result.stdout, /created: .*qa-agent-android\.yml/);
    assert.match(result.stdout, /created: .*qa-agent-ios\.yml/);
    assert.match(result.stdout, /created: .*provision-tooling\.sh/);
    assert.match(result.stdout, /created: .*prepare-android-app\.sh/);
    assert.match(result.stdout, /created: .*prepare-ios-app\.sh/);
    assert.equal(result.stderr, "");

    const config = await readFile(
      path.join(projectDir, "qa-agent.config.mjs"),
      "utf8",
    );
    assert.match(config, /defineQaAgentConfig/);
    assert.match(config, /targetPlatforms: \["android"\]/);
    assert.match(config, /provider: "TODO_MODEL_PROVIDER"/);
    assert.match(config, /modelId: "TODO_MODEL_ID"/);
    assert.match(config, /apiKeyEnv: "QA_AGENT_MODEL_API_KEY"/);
    assert.match(config, /adapter: "expo-eas"/);
    assert.match(config, /applicationId: "TODO_ANDROID_APPLICATION_ID"/);
    assert.match(config, /bundleIdentifier: "TODO_IOS_BUNDLE_IDENTIFIER"/);
    assert.match(config, /screenshotStorage/);
    assert.match(config, /provider: "artifact"/);
    assert.match(config, /artifactsDir: "qa-agent\/screenshots"/);
    assert.match(config, /actionSafetyPolicy/);
    assert.match(config, /mode: "safe_only"/);
    assert.match(config, /authProfiles: \{\}/);

    const workflow = await readFile(
      path.join(projectDir, ".eas", "workflows", "qa-agent-android.yml"),
      "utf8",
    );
    const provisionIndex = workflow.indexOf("Provision QA Agent tooling");
    const prContextIndex = workflow.indexOf("Write GitHub PR Context");
    const doctorIndex = workflow.indexOf("qa-agent doctor");
    const prepareIndex = workflow.indexOf("Install and launch Android QA app");
    const runIndex = workflow.indexOf("qa-agent run");
    const commentIndex = workflow.indexOf("qa-agent render-comment");
    assert.ok(prContextIndex > -1);
    assert.ok(provisionIndex > -1);
    assert.ok(provisionIndex > prContextIndex);
    assert.ok(doctorIndex > provisionIndex);
    assert.ok(prepareIndex > doctorIndex);
    assert.ok(runIndex > prepareIndex);
    assert.ok(commentIndex > runIndex);
    assert.match(workflow, /platform: android/);
    assert.match(workflow, /gh pr view/);
    assert.match(workflow, /--pr-context qa-agent\/pr-context\.json/);
    assert.match(workflow, /--out artifacts\/qa-agent\/android/);
    assert.match(workflow, /render_args\+=\(--android-report artifacts\/qa-agent\/android\/qa-report\.json\)/);
    assert.match(workflow, /render_args\+=\(--ios-report artifacts\/qa-agent\/ios\/qa-report\.json\)/);
    assert.match(workflow, /scripts\/qa-agent\/provision-tooling\.sh/);
    assert.match(workflow, /scripts\/qa-agent\/prepare-android-app\.sh/);

    const iosWorkflow = await readFile(
      path.join(projectDir, ".eas", "workflows", "qa-agent-ios.yml"),
      "utf8",
    );
    const iosDoctorIndex = iosWorkflow.indexOf("qa-agent doctor");
    const iosPrepareIndex = iosWorkflow.indexOf("Install and launch iOS QA app");
    const iosRunIndex = iosWorkflow.indexOf("qa-agent run");
    const iosCommentIndex = iosWorkflow.indexOf("qa-agent render-comment");
    assert.match(iosWorkflow, /QA Agent iOS Experimental/);
    assert.match(iosWorkflow, /platform: ios/);
    assert.match(iosWorkflow, /profile: preview/);
    assert.match(iosWorkflow, /QA_AGENT_IOS_APP_PATH: TODO_IOS_SIMULATOR_APP_PATH/);
    assert.match(iosWorkflow, /QA_AGENT_IOS_BUNDLE_IDENTIFIER: TODO_IOS_BUNDLE_IDENTIFIER/);
    assert.ok(iosDoctorIndex > -1);
    assert.ok(iosPrepareIndex > iosDoctorIndex);
    assert.ok(iosRunIndex > iosPrepareIndex);
    assert.ok(iosCommentIndex > iosRunIndex);
    assert.match(iosWorkflow, /--platform ios/);
    assert.match(iosWorkflow, /--out artifacts\/qa-agent\/ios/);
    assert.match(iosWorkflow, /render_args\+=\(--android-report artifacts\/qa-agent\/android\/qa-report\.json\)/);
    assert.match(iosWorkflow, /render_args\+=\(--ios-report artifacts\/qa-agent\/ios\/qa-report\.json\)/);
    assert.match(iosWorkflow, /scripts\/qa-agent\/prepare-ios-app\.sh/);

    const scriptPath = path.join(
      projectDir,
      "scripts",
      "qa-agent",
      "provision-tooling.sh",
    );
    const script = await readFile(scriptPath, "utf8");
    assert.match(script, /agent-device/);
    assert.match(script, /agent-device@0\.17\.6/);
    assert.match(script, /npm install --global/);
    assert.match(script, /secrets, not in this file/);
    assert.equal((await stat(scriptPath)).mode & 0o111, 0o111);

    const prepareScriptPath = path.join(
      projectDir,
      "scripts",
      "qa-agent",
      "prepare-android-app.sh",
    );
    const prepareScript = await readFile(prepareScriptPath, "utf8");
    assert.match(prepareScript, /QA_AGENT_ANDROID_APK_PATH/);
    assert.match(prepareScript, /QA_AGENT_ANDROID_APPLICATION_ID/);
    assert.match(prepareScript, /agent-device install/);
    assert.match(prepareScript, /agent-device launch/);
    assert.equal((await stat(prepareScriptPath)).mode & 0o111, 0o111);

    const prepareIosScriptPath = path.join(
      projectDir,
      "scripts",
      "qa-agent",
      "prepare-ios-app.sh",
    );
    const prepareIosScript = await readFile(prepareIosScriptPath, "utf8");
    assert.match(prepareIosScript, /QA_AGENT_IOS_APP_PATH/);
    assert.match(prepareIosScript, /QA_AGENT_IOS_BUNDLE_IDENTIFIER/);
    assert.match(prepareIosScript, /agent-device install --platform ios/);
    assert.match(prepareIosScript, /agent-device launch --platform ios/);
    assert.equal((await stat(prepareIosScriptPath)).mode & 0o111, 0o111);

    assert.equal(
      await readFile(path.join(projectDir, "app.json"), "utf8"),
      appJsonBefore,
    );
    assert.equal(
      await readFile(path.join(projectDir, "app", "index.js"), "utf8"),
      appSourceBefore,
    );
  });

  it("is idempotent when generated files already match", async () => {
    const projectDir = await createExpoFixture();

    assert.equal(runCli(["init", "--project", projectDir]).status, 0);
    const secondRun = runCli(["init", "--project", projectDir]);

    assert.equal(secondRun.status, 0);
    assert.match(secondRun.stdout, /unchanged: .*qa-agent\.config\.mjs/);
    assert.match(secondRun.stdout, /unchanged: .*qa-agent-android\.yml/);
    assert.match(secondRun.stdout, /unchanged: .*qa-agent-ios\.yml/);
    assert.match(secondRun.stdout, /unchanged: .*provision-tooling\.sh/);
    assert.match(secondRun.stdout, /unchanged: .*prepare-android-app\.sh/);
    assert.match(secondRun.stdout, /unchanged: .*prepare-ios-app\.sh/);
    assert.equal(secondRun.stderr, "");
  });

  it("does not overwrite existing project files with different content", async () => {
    const projectDir = await createExpoFixture();
    const existingConfig = "export default { existing: true };\n";
    await writeFile(path.join(projectDir, "qa-agent.config.mjs"), existingConfig);

    const result = runCli(["init", "--project", projectDir]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped: .*qa-agent\.config\.mjs/);
    assert.equal(
      await readFile(path.join(projectDir, "qa-agent.config.mjs"), "utf8"),
      existingConfig,
    );
  });

  it("can run against the Expo dogfood example without overwriting it", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "qa-agent-example-"));
    const exampleDir = path.resolve(testDir, "../../../examples/expo-basic");
    await cp(exampleDir, projectDir, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}node_modules${path.sep}`),
    });
    const configBefore = await readFile(
      path.join(projectDir, "qa-agent.config.mjs"),
      "utf8",
    );

    const result = runCli(["init", "--project", projectDir]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /QA Agent init completed/);
    assert.match(result.stdout, /skipped: .*qa-agent\.config\.mjs/);
    assert.match(result.stdout, /skipped: .*qa-agent-android\.yml/);
    assert.match(result.stdout, /skipped: .*qa-agent-ios\.yml/);
    assert.match(result.stdout, /skipped: .*provision-tooling\.sh/);
    assert.match(result.stdout, /unchanged: .*prepare-android-app\.sh/);
    assert.match(result.stdout, /unchanged: .*prepare-ios-app\.sh/);
    assert.equal(result.stderr, "");
    assert.equal(
      await readFile(path.join(projectDir, "qa-agent.config.mjs"), "utf8"),
      configBefore,
    );
  });

  it("skips generated paths that collide with directories or non-file parents", async () => {
    const directoryCollisionProject = await createExpoFixture();
    await mkdir(path.join(directoryCollisionProject, "qa-agent.config.mjs"));

    const directoryCollision = runCli([
      "init",
      "--project",
      directoryCollisionProject,
    ]);

    assert.equal(directoryCollision.status, 0);
    assert.match(
      directoryCollision.stdout,
      /skipped: .*qa-agent\.config\.mjs/,
    );
    assert.equal(directoryCollision.stderr, "");

    const parentCollisionProject = await createExpoFixture();
    await writeFile(
      path.join(parentCollisionProject, ".eas"),
      "not a directory\n",
    );

    const parentCollision = runCli(["init", "--project", parentCollisionProject]);

    assert.equal(parentCollision.status, 0);
    assert.match(parentCollision.stdout, /skipped: .*qa-agent-android\.yml/);
    assert.match(parentCollision.stdout, /skipped: .*qa-agent-ios\.yml/);
    assert.equal(parentCollision.stderr, "");
  });

  it("prints help for the init command", () => {
    const result = runCli(["init", "--help"]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: qa-agent init/);
    assert.match(result.stdout, /--project <dir>/);
    assert.equal(result.stderr, "");
  });
});
