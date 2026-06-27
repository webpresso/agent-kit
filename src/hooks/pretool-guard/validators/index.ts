import { validateBlueprint } from "./blueprint.js";
import { validateCommandFile } from "./command-file.js";
import { validateComplexity } from "./complexity.js";
import { validateDangerousCommands } from "./dangerous-commands.js";
import { validateDocsGovernance } from "./docs-governance.js";
import { validateFileConventions } from "./file-conventions.js";
import { validateForbiddenCommands } from "./forbidden-commands.js";
import { validatePackageImports } from "./package-imports.js";
import { validatePlanFrontmatter } from "./plan-frontmatter.js";
import { validateTestQuality } from "./test-quality.js";
import { validateUxQuality } from "./ux-quality.js";
import { validateWorktreeDiscipline } from "./worktree-discipline.js";

export const VALIDATORS = [
  validateForbiddenCommands,
  validateDangerousCommands,
  validateBlueprint,
  validateDocsGovernance,
  validatePlanFrontmatter,
  validateComplexity,
  validatePackageImports,
  validateFileConventions,
  validateCommandFile,
  validateTestQuality,
  validateUxQuality,
  validateWorktreeDiscipline,
];

export {
  validateBlueprint,
  validateCommandFile,
  validateComplexity,
  validateDangerousCommands,
  validateDocsGovernance,
  validateFileConventions,
  validateForbiddenCommands,
  validatePackageImports,
  validatePlanFrontmatter,
  validateTestQuality,
  validateUxQuality,
  validateWorktreeDiscipline,
};
