import { $ } from "bun";
import type { PackageJson, WorkspaceMember } from "./types";
import path from "path";
import { glob } from "glob";

/**
 * WorkspaceManager handles all workspace-related operations
 *
 * - Detecting if we're in a monorepo vs single package setup
 * - Finding and parsing all workspace packages
 * - Providing utilities for package selection and filtering
 * - Managing the relationship between the root and workspace packages
 */
export default class WorkspaceUtils {
  private rootPath: string;
  private rootPackageJson: PackageJson | null = null;
  private workspaceMembers: WorkspaceMember[] | null = null;
  private isMonorepo: boolean | null = null;
  constructor() {
    this.rootPath = process.cwd();
  }
  /**
   * Determines if the current repository is a monorepo
   * A monorepo is defined as having a "workspaces" field in the root package.json
   */
  async getIsMonorepo(): Promise<boolean> {
    if (this.isMonorepo !== null) {
      return this.isMonorepo;
    }

    try {
      const rootPackageJson = await this.getRootPackageJson();
      // Check if workspaces field exists and has at least one entry
      this.isMonorepo =
        Array.isArray(rootPackageJson.workspaces) &&
        rootPackageJson.workspaces.length > 0;
    } catch (error) {
      // If we can't read package.json, assume it's not a monorepo
      this.isMonorepo = false;
    }

    return this.isMonorepo;
  }

  /**
   * Gets the root package.json contents
   * This is cached after the first read for performance
   */
  async getRootPackageJson() {
    if (this.rootPackageJson !== null) {
      return this.rootPackageJson;
    }

    const packageJsonPath = path.join(
      await $`git rev-parse --show-toplevel`.text(), // should git us the root path of the repo
      "package.json"
    );
    const packageJsonFile = Bun.file(packageJsonPath);
    const exists = await packageJsonFile.exists();
    if (!exists) {
      await $`echo "---"`;
      await $`echo "No package.json found in the current directory. Please run bunr from the repository root."`;
      await $`echo "---"`;
    }

    try {
      // Use Bun's built-in JSON parsing for the package.json file
      this.rootPackageJson = await packageJsonFile.json();
      return this.rootPackageJson;
    } catch (error) {
      throw new Error(
        `Failed to parse package.json: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Discovers and parses all workspace packages
   * This method handles the glob patterns from the workspaces field and creates WorkspacePackage objects
   */
  async getWorkspacePackages(): Promise<WorkspaceMember[]> {
    if (this.workspaceMembers !== null) {
      return this.workspaceMembers;
    }

    const isMonorepo = await this.getIsMonorepo();

    if (!isMonorepo) {
      // For single package repos, return an empty array
      // The root package itself will be handled separately if needed
      this.workspaceMembers = [];
      return this.workspaceMembers;
    }

    const rootPackageJson = await this.getRootPackageJson();
    const workspacePatterns = Array.isArray(rootPackageJson!.workspaces)
      ? (rootPackageJson?.workspaces as string[])
      : rootPackageJson?.workspaces?.packages;

    this.workspaceMembers = [];

    // Process each workspace pattern using glob to find matching directories
    for (const pattern of workspacePatterns as string[]) {
      try {
        // Use glob to find all directories matching the workspace pattern
        const matchingPaths = await glob(pattern, {
          cwd: this.rootPath,
          // onlyDirectories: true,
          absolute: false, // We want relative paths for easier processing
        });

        // Process each matching directory to see if it contains a valid package
        for (const relativePath of matchingPaths) {
          const packagePath = path.join(this.rootPath, relativePath);
          const packageJsonPath = path.join(packagePath, "package.json");
          const file = Bun.file(packageJsonPath);
          const exists = await file.exists();
          // Skip directories that don't have a package.json
          if (!exists) {
            continue;
          }

          try {
            // Parse the package.json for this workspace package
            const packageJson = await file.json();
            // Create a WorkspaceMember object with all the relevant information
            const workspaceMember: WorkspaceMember = {
              name: packageJson.name || path.basename(relativePath),
              path: packagePath,
              relativePath,
              version: packageJson.version || "0.0.0",
              publishable: Boolean(packageJson.publishConfig),
              private: Boolean(packageJson.private),
            };

            this.workspaceMembers.push(workspaceMember);
          } catch (error) {
            // If we can't parse a package.json, warn but continue
            console.warn(
              `Warning: Could not parse package.json in ${relativePath}: ${error}`
            );
          }
        }
      } catch (error) {
        // If glob fails for a pattern, warn but continue with other patterns
        console.warn(
          `Warning: Could not process workspace pattern "${pattern}": ${error}`
        );
      }
    }

    // Sort packages by name for consistent ordering
    this.workspaceMembers.sort((a, b) => a.name.localeCompare(b.name));

    return this.workspaceMembers;
  }

  /**
   * Finds a workspace package by name
   * Useful for operations that need to target a specific package
   */
  async findPackageByName(name: string): Promise<WorkspaceMember | null> {
    const packages = await this.getWorkspacePackages();
    return packages.find((pkg) => pkg.name === name) || null;
  }

  /**
   * Finds a workspace package by its relative path
   * Useful when processing git diff output or file-based operations
   */
  async findPackageByPath(
    relativePath: string
  ): Promise<WorkspaceMember | null> {
    const packages = await this.getWorkspacePackages();

    // Check for exact match first
    const exactMatch = packages.find(
      (pkg) => pkg.relativePath === relativePath
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Check if the path is within any package directory
    // This handles cases where we get a file path and need to find its containing package
    for (const pkg of packages) {
      if (
        relativePath.startsWith(pkg.relativePath + path.sep) ||
        relativePath === pkg.relativePath
      ) {
        return pkg;
      }
    }

    return null;
  }
}
