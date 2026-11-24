#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

const evidenceLevels = new Set([
  "static",
  "mock",
  "local-runtime",
  "staging",
  "production",
]);
const categories = new Set([
  "visual",
  "responsive",
  "interaction",
  "recovery",
  "accessibility",
  "performance",
]);
const statuses = new Set(["passed", "failed", "not-run", "not-applicable"]);
const runtimeCategories = new Set([
  "interaction",
  "recovery",
  "performance",
]);
const assertionTypes = new Set([
  "dom",
  "client-state",
  "network",
  "persistence",
  "replay",
]);
const accessibilityCapabilities = new Set([
  "source-semantics",
  "axe",
  "keyboard",
  "screen-reader",
  "real-zoom",
  "reflow",
  "forced-colors",
  "reduced-motion",
  "target-size",
  "contrast",
]);
const staticAccessibilityCapabilities = new Set(["source-semantics"]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRemoteEvidenceUri(value) {
  return nonEmptyString(value) && /^https?:\/\//iu.test(value);
}

function remoteEvidenceReferences(report) {
  const references = [];

  for (const [checkIndex, check] of (report.checks ?? []).entries()) {
    const evidence = Array.isArray(check?.evidence) ? check.evidence : [];
    for (const [evidenceIndex, uri] of evidence.entries()) {
      if (isRemoteEvidenceUri(uri)) {
        references.push({
          path: `checks[${checkIndex}].evidence[${evidenceIndex}]`,
          uri,
        });
      }
    }
    const assertions = Array.isArray(check?.assertions) ? check.assertions : [];
    for (const [assertionIndex, assertion] of assertions.entries()) {
      if (isRemoteEvidenceUri(assertion?.evidence)) {
        references.push({
          path: `checks[${checkIndex}].assertions[${assertionIndex}].evidence`,
          uri: assertion.evidence,
        });
      }
    }
  }

  return references;
}

function validateRemoteEvidence(report, { strict, allowRemoteEvidence }, errors) {
  const references = remoteEvidenceReferences(report);
  const referencedUris = new Map();
  for (const reference of references) {
    const firstReference = referencedUris.get(reference.uri);
    if (firstReference) {
      errors.push(
        `${reference.path}: duplicate remote evidence URI ${JSON.stringify(reference.uri)}; first used at ${firstReference}`,
      );
    } else {
      referencedUris.set(reference.uri, reference.path);
    }
    if (strict && !allowRemoteEvidence) {
      errors.push(
        `${reference.path}: remote evidence requires --allow-remote-evidence in strict mode: ${JSON.stringify(reference.uri)}`,
      );
    }
  }

  if (report.remoteEvidence === undefined) {
    for (const reference of references) {
      errors.push(
        `${reference.path}: remote evidence is missing a matching remoteEvidence record for ${JSON.stringify(reference.uri)}`,
      );
    }
    return;
  }

  if (!Array.isArray(report.remoteEvidence)) {
    errors.push("remoteEvidence: expected an array of { uri, reason, reviewMethod } records");
    return;
  }

  const registeredUris = new Map();
  report.remoteEvidence.forEach((record, index) => {
    const path = `remoteEvidence[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isRemoteEvidenceUri(record.uri)) {
      errors.push(`${path}.uri: required http(s) URI`);
    } else if (registeredUris.has(record.uri)) {
      errors.push(`${path}.uri: duplicate remote evidence URI ${JSON.stringify(record.uri)}`);
    } else {
      registeredUris.set(record.uri, path);
    }
    for (const field of ["reason", "reviewMethod"]) {
      if (!nonEmptyString(record[field])) {
        errors.push(`${path}.${field}: required non-empty string`);
      }
    }
  });

  for (const [uri, path] of referencedUris) {
    if (!registeredUris.has(uri)) {
      errors.push(
        `${path}: remote evidence is missing a matching remoteEvidence record for ${JSON.stringify(uri)}`,
      );
    }
  }
  for (const [uri, path] of registeredUris) {
    if (!referencedUris.has(uri)) {
      errors.push(
        `${path}.uri: no matching remote evidence or assertion URI for ${JSON.stringify(uri)}`,
      );
    }
  }
}

function validate(report, { strict = false, allowRemoteEvidence = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { errors: ["root: expected a JSON object"], warnings };
  }

  if (report.schemaVersion !== "2.0") {
    errors.push('schemaVersion: expected "2.0"');
  }

  const target = report.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push("target: expected an object");
  } else {
    for (const field of ["name", "build", "evidenceLevel"]) {
      if (!nonEmptyString(target[field])) {
        errors.push(`target.${field}: required non-empty string`);
      }
    }
    if (
      nonEmptyString(target.evidenceLevel) &&
      !evidenceLevels.has(target.evidenceLevel)
    ) {
      errors.push(
        `target.evidenceLevel: expected one of ${[...evidenceLevels].join(", ")}`,
      );
    }
  }

  if (
    target &&
    target.evidenceLevel !== "static" &&
    (!report.environment ||
      typeof report.environment !== "object" ||
      !nonEmptyString(report.environment.runtime))
  ) {
    errors.push(
      "environment.runtime: required for mock, local-runtime, staging, or production evidence",
    );
  }

  let requiredCategories = [];
  if (report.requiredCategories === undefined) {
    if (strict) {
      errors.push("requiredCategories: required in strict mode");
    }
  } else if (
    !Array.isArray(report.requiredCategories) ||
    report.requiredCategories.length === 0
  ) {
    errors.push("requiredCategories: expected a non-empty array");
  } else {
    const uniqueRequired = new Set();
    report.requiredCategories.forEach((category, index) => {
      if (!categories.has(category)) {
        errors.push(
          `requiredCategories[${index}]: expected one of ${[...categories].join(", ")}`,
        );
      } else if (uniqueRequired.has(category)) {
        errors.push(`requiredCategories[${index}]: duplicate category ${category}`);
      } else {
        uniqueRequired.add(category);
        requiredCategories.push(category);
      }
    });
  }

  const requiredCapabilities = new Map();
  if (report.requiredCapabilities === undefined) {
    if (strict) {
      errors.push("requiredCapabilities: required in strict mode");
    }
  } else if (
    !report.requiredCapabilities ||
    typeof report.requiredCapabilities !== "object" ||
    Array.isArray(report.requiredCapabilities) ||
    Object.keys(report.requiredCapabilities).length === 0
  ) {
    errors.push("requiredCapabilities: expected a non-empty object keyed by category");
  } else {
    for (const [category, capabilities] of Object.entries(
      report.requiredCapabilities,
    )) {
      const path = `requiredCapabilities.${category}`;
      if (!categories.has(category)) {
        errors.push(
          `${path}: category must be one of ${[...categories].join(", ")}`,
        );
        continue;
      }
      if (!Array.isArray(capabilities) || capabilities.length === 0) {
        errors.push(`${path}: expected a non-empty array`);
        continue;
      }
      const uniqueCapabilities = new Set();
      for (const [index, capability] of capabilities.entries()) {
        if (!nonEmptyString(capability)) {
          errors.push(`${path}[${index}]: required non-empty string`);
        } else if (uniqueCapabilities.has(capability)) {
          errors.push(`${path}[${index}]: duplicate capability ${capability}`);
        } else {
          uniqueCapabilities.add(capability);
        }
      }
      requiredCapabilities.set(category, uniqueCapabilities);
    }
  }

  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    errors.push("checks: expected at least one check");
    return { errors, warnings };
  }

  const seenIds = new Set();
  const seenCategories = new Set();
  const passedCategories = new Set();
  const passedCapabilities = new Map();

  report.checks.forEach((check, index) => {
    const path = `checks[${index}]`;
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      errors.push(`${path}: expected an object`);
      return;
    }

    if (!nonEmptyString(check.id)) {
      errors.push(`${path}.id: required non-empty string`);
    } else if (seenIds.has(check.id)) {
      errors.push(`${path}.id: duplicate id ${JSON.stringify(check.id)}`);
    } else {
      seenIds.add(check.id);
    }

    if (!categories.has(check.category)) {
      errors.push(
        `${path}.category: expected one of ${[...categories].join(", ")}`,
      );
    } else {
      seenCategories.add(check.category);
    }

    if (!statuses.has(check.status)) {
      errors.push(
        `${path}.status: expected one of ${[...statuses].join(", ")}`,
      );
    }

    if (!nonEmptyString(check.claim)) {
      errors.push(`${path}.claim: required non-empty string`);
    }

    if (check.status === "passed") {
      if (categories.has(check.category)) {
        passedCategories.add(check.category);
      }
      if (check.capabilities !== undefined) {
        if (
          !Array.isArray(check.capabilities) ||
          check.capabilities.length === 0
        ) {
          errors.push(`${path}.capabilities: expected a non-empty array when provided`);
        } else {
          const uniqueCapabilities = new Set();
          check.capabilities.forEach((capability, capabilityIndex) => {
            if (!nonEmptyString(capability)) {
              errors.push(
                `${path}.capabilities[${capabilityIndex}]: required non-empty string`,
              );
            } else if (uniqueCapabilities.has(capability)) {
              errors.push(
                `${path}.capabilities[${capabilityIndex}]: duplicate capability ${capability}`,
              );
            } else {
              uniqueCapabilities.add(capability);
            }
          });
          if (categories.has(check.category)) {
            const categoryCapabilities =
              passedCapabilities.get(check.category) ?? new Set();
            for (const capability of uniqueCapabilities) {
              categoryCapabilities.add(capability);
            }
            passedCapabilities.set(check.category, categoryCapabilities);
          }
        }
      }
      if (!nonEmptyString(check.method)) {
        errors.push(`${path}.method: required for a passed check`);
      }
      if (
        !Array.isArray(check.evidence) ||
        check.evidence.length === 0 ||
        check.evidence.some((item) => !nonEmptyString(item))
      ) {
        errors.push(`${path}.evidence: passed check needs non-empty evidence items`);
      }

      if (
        target?.evidenceLevel === "static" &&
        runtimeCategories.has(check.category)
      ) {
        errors.push(
          `${path}: static evidence cannot pass runtime category ${check.category}`,
        );
      }

      if (check.category === "interaction") {
        const transition = check.transition;
        if (!transition || typeof transition !== "object") {
          errors.push(`${path}.transition: required for a passed interaction`);
        } else {
          for (const field of ["from", "action", "to", "observable"]) {
            if (!nonEmptyString(transition[field])) {
              errors.push(`${path}.transition.${field}: required non-empty string`);
            }
          }
        }
        if (
          !Array.isArray(check.inputModes) ||
          check.inputModes.length === 0 ||
          check.inputModes.some((item) => !nonEmptyString(item))
        ) {
          errors.push(`${path}.inputModes: passed interaction needs input evidence`);
        }
        if (!Array.isArray(check.assertions) || check.assertions.length === 0) {
          errors.push(
            `${path}.assertions: passed interaction needs at least one DOM, state, network, persistence, or replay assertion`,
          );
        } else {
          check.assertions.forEach((assertion, assertionIndex) => {
            const assertionPath = `${path}.assertions[${assertionIndex}]`;
            if (
              !assertion ||
              typeof assertion !== "object" ||
              Array.isArray(assertion)
            ) {
              errors.push(`${assertionPath}: expected an object`);
              return;
            }
            if (!assertionTypes.has(assertion.type)) {
              errors.push(
                `${assertionPath}.type: expected one of ${[...assertionTypes].join(", ")}`,
              );
            }
            if (!nonEmptyString(assertion.description)) {
              errors.push(
                `${assertionPath}.description: required non-empty string`,
              );
            }
            if (!nonEmptyString(assertion.evidence)) {
              errors.push(`${assertionPath}.evidence: required non-empty string`);
            }
          });
        }
      }

      if (check.category === "accessibility") {
        if (
          !Array.isArray(check.capabilities) ||
          check.capabilities.length === 0
        ) {
          errors.push(
            `${path}.capabilities: passed accessibility check needs explicit capabilities`,
          );
        } else {
          check.capabilities.forEach((capability, capabilityIndex) => {
            if (!accessibilityCapabilities.has(capability)) {
              errors.push(
                `${path}.capabilities[${capabilityIndex}]: expected one of ${[
                  ...accessibilityCapabilities,
                ].join(", ")}`,
              );
            }
            if (
              target?.evidenceLevel === "static" &&
              !staticAccessibilityCapabilities.has(capability)
            ) {
              errors.push(
                `${path}: static evidence cannot pass accessibility capability ${capability}`,
              );
            }
          });
        }
      }

      if (check.category === "performance") {
        const measurement = check.measurement;
        if (!measurement || typeof measurement !== "object") {
          errors.push(`${path}.measurement: required for passed performance check`);
        } else {
          if (!nonEmptyString(measurement.name)) {
            errors.push(`${path}.measurement.name: required non-empty string`);
          }
          if (
            typeof measurement.value !== "number" ||
            !Number.isFinite(measurement.value)
          ) {
            errors.push(`${path}.measurement.value: required finite number`);
          }
          if (!nonEmptyString(measurement.unit)) {
            errors.push(`${path}.measurement.unit: required non-empty string`);
          }
          if (!new Set(["lab", "field"]).has(measurement.context)) {
            errors.push(`${path}.measurement.context: expected lab or field`);
          }
          if (measurement.context === "field") {
            if (target?.evidenceLevel !== "production") {
              errors.push(
                `${path}: field performance requires production evidenceLevel`,
              );
            }
            if (measurement.percentile !== 75) {
              errors.push(`${path}.measurement.percentile: field claim requires 75`);
            }
            if (
              !Number.isInteger(measurement.sampleSize) ||
              measurement.sampleSize <= 0
            ) {
              errors.push(
                `${path}.measurement.sampleSize: field claim requires a positive integer`,
              );
            }
            if (!nonEmptyString(measurement.population)) {
              errors.push(
                `${path}.measurement.population: field claim requires a population description`,
              );
            }
            for (const field of [
              "source",
              "period",
              "deviceSegment",
              "sampleAdequacy",
            ]) {
              if (!nonEmptyString(measurement[field])) {
                errors.push(
                  `${path}.measurement.${field}: required non-empty string for a field claim`,
                );
              }
            }
          }
        }
      }
    }

    if (check.status === "failed" && !nonEmptyString(check.notes)) {
      warnings.push(`${path}.notes: explain the impact or recovery for a failed check`);
    }
  });

  for (const category of ["interaction", "responsive", "accessibility"]) {
    if (!seenCategories.has(category)) {
      warnings.push(`checks: no ${category} check recorded`);
    }
  }

  validateRemoteEvidence(report, { strict, allowRemoteEvidence }, errors);

  if (strict) {
    for (const category of requiredCategories) {
      if (!passedCategories.has(category)) {
        errors.push(
          `requiredCategories: ${category} has no passed check in strict mode`,
        );
      }
    }
    for (const [category, capabilities] of requiredCapabilities) {
      const coveredCapabilities = passedCapabilities.get(category) ?? new Set();
      for (const capability of capabilities) {
        if (!coveredCapabilities.has(capability)) {
          errors.push(
            `requiredCapabilities.${category}: no passed ${category} check covers capability ${JSON.stringify(capability)} in strict mode`,
          );
        }
      }
    }
    report.checks.forEach((check, index) => {
      if (check?.status === "failed") {
        errors.push(`checks[${index}]: failed check blocks strict validation`);
      }
    });
  }

  if (!Array.isArray(report.limitations)) {
    warnings.push("limitations: add an array, even when empty");
  }

  return { errors, warnings };
}

const example = {
  schemaVersion: "2.0",
  requiredCategories: ["interaction", "responsive", "accessibility"],
  requiredCapabilities: {
    interaction: ["state-transition"],
    responsive: ["reflow"],
    accessibility: ["keyboard"],
  },
  target: {
    name: "example-product-flow",
    url: "http://127.0.0.1:3000/example",
    build: "git:abc123",
    evidenceLevel: "local-runtime",
  },
  environment: {
    runtime: "Chromium / macOS",
    viewport: "390x844 CSS px",
    input: "keyboard and pointer",
  },
  checks: [
    {
      id: "critical-interaction",
      category: "interaction",
      status: "passed",
      claim: "The primary action changes the committed product state",
      method: "Browser flow with DOM and response assertions",
      evidence: ["test-results/example/trace.zip"],
      capabilities: ["state-transition"],
      inputModes: ["keyboard", "pointer"],
      assertions: [
        {
          type: "client-state",
          description: "committed changed from false to true",
          evidence: "test-results/example/state-assertion.json",
        },
      ],
      transition: {
        from: "draft/incomplete",
        action: "confirm the configured item",
        to: "committed/complete",
        observable: "saved status and result summary become visible",
      },
    },
    {
      id: "mobile-reflow",
      category: "responsive",
      status: "passed",
      claim: "The primary task has no page-level horizontal overflow",
      method: "390x844 browser assertion",
      evidence: ["test-results/example/mobile.png"],
      capabilities: ["reflow"],
    },
    {
      id: "keyboard-focus",
      category: "accessibility",
      status: "passed",
      claim: "Keyboard focus remains visible through the primary flow",
      method: "Manual keyboard pass recorded in browser trace",
      evidence: ["test-results/example/keyboard-trace.zip"],
      capabilities: ["keyboard"],
    },
  ],
  limitations: ["Real screen reader and real 200% browser zoom not run"],
};

function printResult(structure, strictResult, report) {
  for (const warning of structure.warnings) console.warn(`WARN ${warning}`);
  if (structure.errors.length) {
    for (const error of structure.errors) console.error(`ERROR ${error}`);
    return;
  }

  console.log("PASS UI evidence structure is valid");
  for (const check of report.checks) {
    if (check.status === "failed") console.log(`INFO failed check ${check.id}: ${check.claim}`);
  }

  if (!strictResult) return;
  if (!strictResult.errors.length) {
    console.log("PASS strict evidence checks passed");
    return;
  }
  console.error("ERROR strict acceptance is not passed");
  for (const error of strictResult.errors) console.error(`ERROR ${error}`);
}

async function checkLocalEvidencePaths(report, reportPath) {
  const errors = [];
  const baseDir = dirname(resolve(reportPath));
  const paths = new Set();

  for (const check of report.checks ?? []) {
    for (const item of Array.isArray(check?.evidence) ? check.evidence : []) {
      if (nonEmptyString(item)) {
        paths.add(item);
      }
    }
    for (const assertion of Array.isArray(check?.assertions) ? check.assertions : []) {
      if (nonEmptyString(assertion?.evidence)) {
        paths.add(assertion.evidence);
      }
    }
  }

  for (const item of paths) {
    if (isRemoteEvidenceUri(item) || /^data:/iu.test(item)) {
      continue;
    }
    const localPath = resolve(baseDir, item);
    try {
      await access(localPath);
    } catch {
      errors.push(`evidence path does not exist: ${localPath}`);
    }
  }

  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const checkLocalEvidence = args.includes("--check-local-evidence");
  const allowRemoteEvidence = args.includes("--allow-remote-evidence");
  const knownFlags = new Set([
    "--strict",
    "--check-local-evidence",
    "--allow-remote-evidence",
    "--print-example",
    "--self-test",
    "--help",
    "-h",
  ]);
  const unknownFlag = args.find(
    (item) => item.startsWith("-") && !knownFlags.has(item),
  );
  if (unknownFlag) {
    console.error(`ERROR unknown option: ${unknownFlag}`);
    process.exitCode = 2;
    return;
  }

  if (args.includes("--print-example")) {
    console.log(JSON.stringify(example, null, 2));
    return;
  }

  if (args.includes("--self-test")) {
    const valid = validate(example, { strict: true });
    const invalidStaticRuntime = validate({
      ...example,
      target: { ...example.target, evidenceLevel: "static" },
      checks: [
        {
          id: "fake-runtime-pass",
          category: "interaction",
          status: "passed",
          claim: "A screenshot proves save worked",
          method: "screenshot",
          evidence: ["screen.png"],
          inputModes: ["pointer"],
        },
      ],
    }, { strict: true });
    const invalidFieldClaim = validate({
      ...example,
      target: { ...example.target, evidenceLevel: "local-runtime" },
      requiredCategories: ["performance"],
      checks: [
        {
          id: "fake-field-performance",
          category: "performance",
          status: "passed",
          claim: "Local lab run proves field INP",
          method: "single local browser run",
          evidence: ["performance.json"],
          measurement: {
            name: "INP",
            value: 120,
            unit: "ms",
            context: "field",
            percentile: 75,
            sampleSize: 1,
            population: "one local developer",
          },
        },
      ],
    }, { strict: true });
    const invalidStaticAccessibility = validate({
      ...example,
      target: { ...example.target, evidenceLevel: "static" },
      requiredCategories: ["accessibility"],
      checks: [
        {
          id: "fake-screen-reader-pass",
          category: "accessibility",
          status: "passed",
          claim: "Source inspection proves screen reader support",
          method: "source inspection",
          evidence: ["source.tsx"],
          capabilities: ["screen-reader"],
        },
      ],
    }, { strict: true });
    const invalidStrictCoverage = validate({
      ...example,
      checks: [example.checks[0]],
    }, { strict: true });
    const invalidCapabilityCoverage = validate({
      ...example,
      requiredCategories: ["accessibility"],
      requiredCapabilities: {
        accessibility: ["screen-reader"],
      },
      checks: [example.checks[2]],
    }, { strict: true });
    const remoteEvidenceReport = {
      ...example,
      checks: [
        {
          ...example.checks[0],
          evidence: ["https://evidence.invalid/critical-flow.trace.zip"],
          assertions: [
            {
              ...example.checks[0].assertions[0],
              evidence: "https://evidence.invalid/critical-flow-state.json",
            },
          ],
        },
        ...example.checks.slice(1),
      ],
      remoteEvidence: [
        {
          uri: "https://evidence.invalid/critical-flow.trace.zip",
          reason: "The recorder retains the trace in a protected review system.",
          reviewMethod: "Open the immutable trace in the review system.",
        },
        {
          uri: "https://evidence.invalid/critical-flow-state.json",
          reason: "The state assertion is retained with the protected trace.",
          reviewMethod: "Compare the assertion hash in the review system.",
        },
      ],
    };
    const invalidRemoteEvidenceNotAllowed = validate(remoteEvidenceReport, {
      strict: true,
    });
    const invalidRemoteEvidenceEmptyRegistry = validate(
      { ...remoteEvidenceReport, remoteEvidence: [] },
      { strict: true, allowRemoteEvidence: true },
    );
    const invalidRemoteEvidenceMismatch = validate(
      {
        ...remoteEvidenceReport,
        remoteEvidence: [
          {
            ...remoteEvidenceReport.remoteEvidence[0],
            uri: "https://evidence.invalid/unrelated.trace.zip",
          },
          remoteEvidenceReport.remoteEvidence[1],
        ],
      },
      { strict: true, allowRemoteEvidence: true },
    );
    const invalidRemoteEvidenceDuplicate = validate(
      {
        ...remoteEvidenceReport,
        remoteEvidence: [
          ...remoteEvidenceReport.remoteEvidence,
          remoteEvidenceReport.remoteEvidence[0],
        ],
      },
      { strict: true, allowRemoteEvidence: true },
    );
    const validRemoteEvidence = validate(remoteEvidenceReport, {
      strict: true,
      allowRemoteEvidence: true,
    });
    const recordedFailureReport = {
      ...example,
      checks: [
        ...example.checks,
        {
          id: "known-mobile-overflow",
          category: "responsive",
          status: "failed",
          claim: "A narrow mobile viewport overflows",
          notes: "Tracked for repair before release.",
          evidence: ["mobile-overflow.png"],
        },
      ],
    };
    const structurallyValidRecordedFailure = validate(recordedFailureReport);
    const strictRecordedFailure = validate(recordedFailureReport, { strict: true });
    if (
      valid.errors.length !== 0 ||
      invalidStaticRuntime.errors.length === 0 ||
      invalidFieldClaim.errors.length === 0 ||
      invalidStaticAccessibility.errors.length === 0 ||
      invalidStrictCoverage.errors.length === 0 ||
      !invalidCapabilityCoverage.errors.some((error) =>
        error.includes(
          'requiredCapabilities.accessibility: no passed accessibility check covers capability "screen-reader"',
        ),
      ) ||
      !invalidRemoteEvidenceNotAllowed.errors.some((error) =>
        error.includes("requires --allow-remote-evidence in strict mode"),
      ) ||
      !invalidRemoteEvidenceEmptyRegistry.errors.some((error) =>
        error.includes("missing a matching remoteEvidence record"),
      ) ||
      !invalidRemoteEvidenceMismatch.errors.some((error) =>
        error.includes("no matching remote evidence or assertion URI"),
      ) ||
      !invalidRemoteEvidenceDuplicate.errors.some((error) =>
        error.includes("duplicate remote evidence URI"),
      ) ||
      validRemoteEvidence.errors.length !== 0 ||
      structurallyValidRecordedFailure.errors.length !== 0 ||
      !strictRecordedFailure.errors.some((error) =>
        error.includes("failed check blocks strict validation"),
      )
    ) {
      throw new Error("self-test failed");
    }
    console.log(
      "PASS self-test accepted valid evidence and rejected fake interaction, field, category, capability, and remote-evidence coverage claims",
    );
    return;
  }

  const fileArgs = args.filter((item) => !item.startsWith("-"));
  if (
    args.includes("--help") ||
    args.includes("-h") ||
    fileArgs.length !== 1
  ) {
    console.log(
      "Usage: validate-ui-evidence.mjs [--strict] [--check-local-evidence] [--allow-remote-evidence] <evidence.json>\n" +
        "       validate-ui-evidence.mjs --print-example\n" +
        "       validate-ui-evidence.mjs --self-test",
    );
    process.exitCode = args.includes("--help") || args.includes("-h") ? 0 : 2;
    return;
  }
  const arg = fileArgs[0];

  let report;
  try {
    report = JSON.parse(await readFile(arg, "utf8"));
  } catch (error) {
    console.error(`ERROR unable to read JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const structure = validate(report);
  if (!structure.errors.length && checkLocalEvidence) {
    structure.errors.push(...(await checkLocalEvidencePaths(report, arg)));
  }
  const strictResult = strict && !structure.errors.length
    ? validate(report, { strict, allowRemoteEvidence })
    : null;
  printResult(structure, strictResult, report);
  if (structure.errors.length || strictResult?.errors.length) process.exitCode = 1;
}

await main();
