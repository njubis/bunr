import { $ } from "bun";
import path from "path";
import { CommitParser } from "conventional-commits-parser";
import type { ConventionalCommit, GitTag, PackageChanges } from "./types";

/**
 * GitUtils provides git operations for bunr
 *
 * - Parsing conventional commits with proper semantic interpretation
 * - Managing git tags and version boundaries
 * - Analyzing file changes to determine package impact
 * - Providing commit ranges for changeset generation
 */
export default class GitUtils {
  repositoryRoot: string;
  constructor() {
    this.repositoryRoot = process.cwd();
  }

  async conventionalCommitsParser(commit: string) {
    return new CommitParser().parse(commit);
  }
  /**
   * Verifies that we're operating within a git repository by searching upwards.
   */
  async isGitRepo(startDir: string = process.cwd()) {
    try {
      const result = await $`git rev-parse --show-toplevel`
        .cwd(startDir)
        .quiet();
      return Boolean(result.stdout.toString().trim());
    } catch {
      return false;
    }
  }

  /**
   * Retrieves all git tags, sorted by creation date (newest first)
   * Tags are essential for determining version boundaries and release points
   */
  async getAllTags(): Promise<GitTag[]> {
    try {
      // Get all tags with their commit hashes and dates
      // The format gives us: hash<tab>date<tab>tagname
      const result = [];
      for await (const tag of $`git tag --sort=-creatordate --format='%(objectname:short)%09%(creatordate:iso8601)%09%(refname:short)'`.lines()) {
        if (tag.trim() !== "") {
          const [hash, dateStr, name] = tag.split("\t");
          if (!hash || !dateStr || !name) {
            continue; // Skip malformed lines
          }
          // Parse the tag to determine if it's a semantic version
          const versionMatch = name.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
          const isVersionTag = Boolean(versionMatch);
          let version;
          if (versionMatch) {
            version = {
              major: parseInt(versionMatch[1]!, 10),
              minor: parseInt(versionMatch[2]!, 10),
              patch: parseInt(versionMatch[3]!, 10),
              prerelease: versionMatch[4] || "none",
            };
          }
          const t: GitTag = {
            name,
            hash,
            date: new Date(dateStr),
            isVersionTag,
            version,
          };
          result.push(t);
        }
      }

      return result;
    } catch (error) {
      // If we can't get tags, return empty array rather than failing
      // This allows the tool to work in repositories without any tags yet
      console.warn(`Warning: Could not retrieve git tags: ${error}`);
      return [];
    }
  }

  /**
   * Gets the most recent semantic version tag
   *
   */
  async getLatestVersionTag(): Promise<GitTag | null> {
    const allTags = await this.getAllTags();

    // Find the first tag that looks like a semantic version
    return allTags.find((tag) => tag.isVersionTag) || null;
  }

  /**
   * Gets all commits in a specified range, with full conventional commit parsing
   * This is the heart of our changeset generation process
   */
  async getCommitsInRange(
    fromRef?: string,
    toRef: string = "HEAD"
  ): Promise<ConventionalCommit[]> {
    try {
      // Determine the starting point for our commit range
      let startRef = fromRef;

      if (!startRef) {
        // If no starting point specified, use the latest version tag
        const latestTag = await this.getLatestVersionTag();
        if (latestTag) {
          startRef = latestTag.name;
        } else {
          // If no tags exist, get all commits from the beginning
          // We'll use git's root commit as the starting point
          const rootCommit = await $`git rev-list --max-parents=0 HEAD`.text();
          startRef = rootCommit.trim();
        }
      }

      // Build the commit range specification
      // If we're starting from the root commit, we need special handling
      let rangeSpec: string;
      if (startRef === toRef) {
        // If start and end are the same, get just that commit
        rangeSpec = startRef;
      } else {
        // Normal range: from startRef to toRef (exclusive of startRef)
        rangeSpec = `${startRef}..${toRef}`;
      }

      // Get commit information in a structured format
      // Format: hash|shortHash|authorName|authorEmail|authorDate|subject|body
      const commitFormat = "%H|%h|%an|%ae|%aI|%s|%b";
      const commitsResult = [];
      for await (const result of $`git log --format=${commitFormat} --reverse ${rangeSpec}`.lines()) {
        if (!result.trim()) {
          commitsResult.push(result.trim());
        }
      }

      if (commitsResult.length === 0) {
        return []; // No commits in range
      }

      const commits: ConventionalCommit[] = [];

      for (const block of commitsResult) {
        const parts = block.split("|");
        if (parts.length < 6) continue; // Skip malformed entries

        const [
          hash,
          shortHash,
          authorName,
          authorEmail,
          authorDate,
          subject,
          body,
        ] = parts;

        const fullMessage = body ? `${subject}\n\n${body}` : subject;

        // Parse the commit message using conventional-commits-parser
        const parsed = await this.conventionalCommitsParser(
          fullMessage as string
        );

        // Get the list of files changed in this commit
        const changedFiles = await this.getChangedFilesForCommit(
          hash as string
        );

        // Determine the release type based on conventional commit rules
        const releaseType = this.determineReleaseType(parsed);

        // Check for breaking changes
        const isBreaking = Boolean(
          parsed.notes?.some((note) => note.title === "BREAKING CHANGE")
        );
        const breakingChange = parsed.notes?.find(
          (note) => note.title === "BREAKING CHANGE"
        )?.text;

        const conventionalCommit: Partial<ConventionalCommit> = {
          hash,
          shortHash,
          rawMessage: fullMessage,
          type: parsed.type || "unknown",
          scope: parsed.scope || undefined,
          description: parsed.subject || subject,
          body: parsed.body || undefined,
          breakingChange,
          isBreaking,
          releaseType,
          author: {
            name: authorName!,
            email: authorEmail!,
            date: new Date(authorDate!),
          },
          changedFiles,
        };

        commits.push(conventionalCommit as ConventionalCommit);
      }

      return commits;
    } catch (error) {
      throw new Error(
        `Failed to get commits in range ${fromRef}..${toRef}: ${error}`
      );
    }
  }

  /**
   * Gets the list of files changed in a specific commit
   * This information is crucial for determining which packages are affected
   */
  private async getChangedFilesForCommit(commitHash: string) {
    const changedFiles = [];
    try {
      // --name-only gives us just the file paths, --no-commit-id suppresses the commit hash, --root will include initial commit
      for await (const line of $`git diff-tree --no-commit-id --name-only -r --root ${commitHash}`.lines()) {
        changedFiles.push(line.trim());
      }
      return changedFiles.filter((f) => f.trim() !== "");
    } catch (error) {
      console.warn(
        `Warning: Could not get changed files for commit ${commitHash}: ${error}`
      );
      return [];
    }
  }

  /**
   * Determines the semantic version bump type based on conventional commit parsing
   * This implements the standard conventional commit to semver mapping
   */
  private determineReleaseType(parsed: any): "major" | "minor" | "patch" {
    // Breaking changes always result in major version bump
    if (parsed.notes?.some((note: any) => note.title === "BREAKING CHANGE")) {
      return "major";
    }

    // Feature commits result in minor version bump
    if (parsed.type === "feat") {
      return "minor";
    }

    // Bug fixes and most other types result in patch version bump
    if (parsed.type === "fix" || parsed.type === "perf") {
      return "patch";
    }

    // For other commit types (docs, style, refactor, test, chore),
    // we default to patch unless they're marked as breaking
    return "patch";
  }

  /**
   * Analyzes which workspace members are affected by a set of commits
   */
  async analyzePackageChanges(
    commits: ConventionalCommit[],
    workspacePackages: Array<{ name: string; relativePath: string }>
  ): Promise<PackageChanges[]> {
    const packageChangesMap = new Map<string, PackageChanges>();

    // Initialize the map with all workspace packages
    for (const pkg of workspacePackages) {
      packageChangesMap.set(pkg.name, {
        packageName: pkg.name,
        packagePath: pkg.relativePath,
        affectingCommits: [],
        suggestedReleaseType: "patch",
      });
    }

    // Process each commit to determine package impact
    for (const commit of commits) {
      const affectedPackages = new Set<string>();

      // Check which packages are affected by the files changed in this commit
      for (const changedFile of commit.changedFiles) {
        // Find which workspace package(s) contain this file
        for (const pkg of workspacePackages) {
          if (this.isFileInPackage(changedFile, pkg.relativePath)) {
            affectedPackages.add(pkg.name);
          }
        }
      }

      // Update the package changes for each affected package
      for (const packageName of affectedPackages) {
        const packageChanges = packageChangesMap.get(packageName);
        if (packageChanges) {
          packageChanges.affectingCommits.push(commit);

          // Update the suggested release type to the highest impact level
          if (
            commit.releaseType === "major" ||
            (commit.releaseType === "minor" &&
              packageChanges.suggestedReleaseType === "patch")
          ) {
            packageChanges.suggestedReleaseType = commit.releaseType;
          }
        }
      }
    }

    // Return only packages that have been affected by commits
    return Array.from(packageChangesMap.values()).filter(
      (pkg) => pkg.affectingCommits.length > 0
    );
  }

  /**
   * Determines if a file path belongs to a specific workspace member
   * This handles both direct files and nested directory structures
   */
  private isFileInPackage(filePath: string, packagePath: string): boolean {
    // Normalize paths to handle different path separators
    const normalizedFilePath = path.normalize(filePath);
    const normalizedPackagePath = path.normalize(packagePath);

    // Handle root package case
    if (normalizedPackagePath === "." || normalizedPackagePath === "") {
      // For root package, only include files that aren't in any sub-packages
      // This is a simplification - in practice, you might want more sophisticated logic
      return (
        !normalizedFilePath.includes(path.sep) ||
        normalizedFilePath.startsWith(".")
      );
    }

    // Check if the file is within the package directory
    return (
      normalizedFilePath.startsWith(normalizedPackagePath + path.sep) ||
      normalizedFilePath === normalizedPackagePath
    );
  }

  /**
   * Checks if there are any uncommitted changes in the repository
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      // Use git status --porcelain to get a machine-readable status
      // If there's any output, there are uncommitted changes
      const result = await $`git status --porcelain`.text();
      return result.trim().length > 0;
    } catch (error) {
      // If we can't check status, assume there are changes to be safe
      console.warn(`Warning: Could not check git status: ${error}`);
      return true;
    }
  }

  /**
   * Creates a git tag
   * Used to mark release points
   */
  async createTag(tagName: string, message?: string): Promise<void> {
    try {
      // Create the tag with an optional message
      if (message) {
        await $`git tag -a ${tagName} -m ${message}`;
      } else {
        await $`git tag ${tagName}`;
      }
    } catch (error) {
      throw new Error(`Failed to create tag ${tagName}: ${error}`);
    }
  }

  /**
   * Gets the current branch name
   * Useful for various git operations and user feedback
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const result = await $`git branch --show-current`.text();
      return result.trim();
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error}`);
    }
  }
}
