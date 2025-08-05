/** Commit author */
export type Author =
  | string
  | {
      name: string;
      email?: string;
      url?: string;
    };

/**
 * TypeScript interface for package.json
 * This interface covers all standard fields defined in the npm documentation
 * and commonly used community conventions
 */
export interface PackageJson {
  // Required fields
  /** The name of the package - must be lowercase and URL-safe */
  name: string;
  /** Semantic version of the package (e.g., "1.0.0") */
  version: string;

  // Essential metadata
  /** Brief description of what the package does */
  description?: string;
  /** Keywords to help people discover your package */
  keywords?: string[];
  /** URL to the project homepage */
  homepage?: string;
  /** URL to the project's issue tracker */
  bugs?:
    | string
    | {
        url?: string;
        email?: string;
      };
  /** License identifier (e.g., "MIT", "Apache-2.0") */
  license?: string;
  /** Author information */
  author?: Author;
  /** List of contributors */
  contributors?: Array<Author>;
  /** List of maintainers */
  maintainers?: Array<
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      }
  >;

  // File and directory specifications
  /** Entry point for the package when imported */
  main?: string;
  /** Entry point for ES6 modules */
  module?: string;
  /** TypeScript declaration file entry point */
  types?: string;
  /** Alternative to 'types' field */
  typings?: string;
  /** Browser-specific entry point */
  browser?: string | Record<string, string | false>;
  /** Files to include when package is installed */
  files?: string[];
  /** Entry points for different environments (Node.js 12.7+) */
  exports?:
    | string
    | Record<
        string,
        | string
        | {
            import?: string;
            require?: string;
            browser?: string;
            node?: string;
            default?: string;
          }
      >;

  // Dependencies - the heart of package management
  /** Packages required for production */
  dependencies?: Record<string, string>;
  /** Packages required only for development */
  devDependencies?: Record<string, string>;
  /** Packages that are optional - won't fail if missing */
  optionalDependencies?: Record<string, string>;
  /** Dependencies that your package expects the user to provide */
  peerDependencies?: Record<string, string>;
  /** Metadata for peer dependencies */
  peerDependenciesMeta?: Record<
    string,
    {
      optional?: boolean;
    }
  >;
  /** Dependencies bundled with your package */
  bundledDependencies?: string[];
  /** Alternative spelling for bundledDependencies */
  bundleDependencies?: string[];

  // Version and compatibility
  /** Node.js versions this package is compatible with */
  engines?: {
    node?: string;
    npm?: string;
    yarn?: string;
    [engineName: string]: string | undefined;
  };
  /** Operating systems this package runs on */
  os?: string[];
  /** CPU architectures this package runs on */
  cpu?: string[];

  // Scripts - automation commands
  /** Custom scripts that can be run with npm/yarn */
  scripts?: Record<string, string>;
  /** Configuration for scripts */
  config?: Record<string, any>;

  // Repository information
  /** Source code repository details */
  repository?:
    | string
    | {
        type: string;
        url: string;
        directory?: string;
      };

  // Publishing configuration
  /** Controls whether package can be published */
  private?: boolean;
  /** Configuration for npm publishing */
  publishConfig?: {
    registry?: string;
    tag?: string;
    access?: "public" | "restricted";
    [key: string]: any;
  };

  // Workspace configuration (for monorepos)
  /** Workspace patterns for packages */
  workspaces?:
    | string[]
    | {
        packages: string[];
        nohoist?: string[];
      };

  // Tool-specific configurations
  /** ESLint configuration */
  eslintConfig?: Record<string, any>;
  /** Prettier configuration */
  prettier?: Record<string, any>;
  /** Babel configuration */
  babel?: Record<string, any>;
  /** Jest configuration */
  jest?: Record<string, any>;
  /** Browserslist configuration for build tools */
  browserslist?: string[] | Record<string, string[]>;

  // Package manager specific
  /** Yarn resolutions for dependency conflicts */
  resolutions?: Record<string, string>;
  /** Flat dependency structure preference */
  preferGlobal?: boolean;

  // Binary executables
  /** Executable files provided by this package */
  bin?: string | Record<string, string>;
  /** Manual pages */
  man?: string | string[];
  /** Directories structure */
  directories?: {
    lib?: string;
    bin?: string;
    man?: string;
    doc?: string;
    example?: string;
    test?: string;
  };

  // Additional fields for flexibility
  /** Any other custom fields */
  [key: string]: any;
}

/**
 * Interface representing a workspace package or application
 * This could be a library package, an application, or any other workspace member
 */
export interface WorkspaceMember {
  /** The name field from package.json */
  name: string;
  /** Absolute path to the member directory */
  path: string;
  /** Relative path from repository root */
  relativePath: string;
  /** The version from package.json */
  version: string;
  /** Whether this member is publishable (has publishConfig) */
  publishable: boolean;
  /** Whether this is marked as private in package.json */
  private: boolean;
}

/**
 * Represents a parsed conventional commit with all relevant metadata
 * This structure captures both the git commit information and the semantic meaning
 */
export interface ConventionalCommit {
  /** The full commit hash */
  hash: string;
  /** Abbreviated commit hash (first 8 characters) */
  shortHash: string;
  /** Raw commit message as it appears in git */
  rawMessage: string;
  /** Parsed conventional commit type (feat, fix, chore, etc.) */
  type: string;
  /** Optional scope from the commit message (e.g., 'api' in 'feat(api): add endpoint') */
  scope?: string;
  /** The main description of the change */
  description: string;
  /** Optional longer description from commit body */
  body?: string;
  /** Breaking change description if this is a breaking change */
  breakingChange?: string;
  /** Whether this commit represents a breaking change */
  isBreaking: boolean;
  /** Semantic version bump type this commit suggests */
  releaseType: "major" | "minor" | "patch";
  /** Author information */
  author: {
    name: string;
    email: string;
    date: Date;
  };
  /** List of files changed in this commit */
  changedFiles: string[];
}

/**
 * Represents a git tag with associated metadata
 * Tags are crucial for determining version boundaries and change ranges
 */
export interface GitTag {
  /** The tag name (e.g., 'v1.2.3') */
  name: string;
  /** The commit hash this tag points to */
  hash: string;
  /** When this tag was created */
  date: Date;
  /** Whether this appears to be a semantic version tag */
  isVersionTag: boolean;
  /** Parsed semantic version if this is a version tag */
  version?: {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
  };
}

/**
 * Information about changes affecting specific packages
 * This helps us understand which workspace packages are impacted by commits
 */
export interface PackageChanges {
  /** Name of the affected package */
  packageName: string;
  /** Relative path to the package directory */
  packagePath: string;
  /** List of commits that affected this package */
  affectingCommits: ConventionalCommit[];
  /** Highest impact release type across all affecting commits */
  suggestedReleaseType: "major" | "minor" | "patch";
}

/**
 * Represents a commit type with its semantic meaning and visual representation
 * This structure encapsulates both the technical requirements and user experience aspects
 */
export interface CommitType {
  /** The conventional commit type (feat, fix, chore, etc.) */
  name: string;
  /** Human-readable description of what this type represents */
  description: string;
  /** Optional emoji to make the interface more visually appealing */
  emoji: string;
  /** Emoji code */
  emojiCode: `:${string}:`;
  /** Whether this type can trigger version bumps (used for user guidance) */
  semver: "major" | "minor" | "patch" | "none";
}

/**
 * Represents the complete commit message structure before formatting
 * This intermediate representation allows us to validate and format the message properly
 */
export interface CommitMessage {
  type: string;
  scope: string;
  subject: string;
  body: string;
  footer: string;
  isBreaking: boolean;
  breakingChangeDescription: string;
}

export type PreReleaseMode = "beta" | "alpha" | string;

/**
 * Config object used to configure bunr behaviour relating to:
 *
 * - commits
 * - changelogs
 * - versioning
 * - publishing
 */
export interface BunrConfig {
  commits: {
    /** Whether to allow emojis in coventional commits.
     * @default true
     */
    allowEmoji: boolean;
    /** Whether to allow emojis in coventional commits.
     * @default
     * `false` // if single package repo
     * `true`  // in monorepo setup;
     */
    enforceScope: boolean;
    /** List of scopes for conventional commits.
     * @default
     * [] // empty array if single package repo
     * `<workspace-packages>`  // in monorepo setup, the available workspace packages;
     */
    scopes: string[];
    /** List of conventional commits types.
     *
     */
    types: CommitType[];
  };
  /** Whether to use conventional commits for changelogs.
   *
   * If `false`, bunr will prompt you for a summary of changes to write to `CHANGELOG.md`
   * @default true
   */
  conventionalChangets: boolean;
  /** A list of possible prelease modes.
   *
   * These however can be overidden by choosing `other` option and providing custom one when  when `bun publish`ing
   *
   * @default ["alpha", "beta"]
   */
  preReleaseModes: PreReleaseMode[];
}
