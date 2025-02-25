# claude-git-swe

A command-line tool that monitors a GitHub repository for open issues and pull requests with the 'claude' label, logging messages when they are processed.

## Installation

You can install claude-git-swe either globally or locally in your repository.

### Global Installation
To use the tool across multiple repositories:
\`\`\`bash
npm install -g claude-git-swe
\`\`\`

### Local Installation
To use the tool within a specific repository:
\`\`\`bash
npm install claude-git-swe
\`\`\`

## Usage

1. **Set the GitHub Token**: The tool requires a GitHub personal access token. Set it as an environment variable:
   \`\`\`bash
   export GITHUB_TOKEN=your_personal_access_token
   \`\`\`
   Replace \`your_personal_access_token\` with a token that has \`repo\` scope permissions.

2. **Navigate to Your Repository**: Go to the root directory of the GitHub repository you want to monitor.

3. **Run the Tool**:
   - If installed globally:
     \`\`\`bash
     claude-git-swe
     \`\`\`
   - If installed locally:
     \`\`\`bash
     npx claude-git-swe
     \`\`\`

The tool will start polling the repository every 5 minutes for open issues and pull requests with the 'claude' label. It logs activity to the console and stores processed IDs in \`.processed_issues.json\` and \`.processed_prs.json\` in the repository root.

4. **Stopping the Tool**: To stop the program, press \`Ctrl+C\` in the terminal.

## Notes
- Ensure you are in a Git repository with a remote pointing to GitHub (e.g., \`origin\`).
- Add \`.processed_issues.json\` and \`.processed_prs.json\` to your \`.gitignore\` to avoid committing these files.

## Dependencies
- \`@octokit/rest\`: For interacting with the GitHub API.
- \`node-cron\`: For scheduling periodic checks.
- \`git-url-parse\`: For parsing the repository URL from git remotes.
