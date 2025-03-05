#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');
const cron = require('node-cron');
const GitUrlParse = require('git-url-parse');
const { execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs').promises;

// Retrieve GitHub token from environment variable
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error('Error: GITHUB_TOKEN environment variable is not set');
  process.exit(1);
}

(async () => {
  try {
    // Determine repository owner and name from git remote
    const remoteLine = execSync('git remote -v')
      .toString()
      .split('\n')
      .find((line) => line.includes('origin') && line.includes('fetch'));
    if (!remoteLine) {
      throw new Error('Could not find origin remote');
    }
    const url = remoteLine.split('\t')[1].split(' ')[0];
    const parsed = GitUrlParse(url);
    const owner = parsed.owner;
    const repo = parsed.name;

    // Initialize Octokit with authentication
    const octokit = new Octokit({ auth: githubToken });

    // Get the token owner's login
    const { data: user } = await octokit.users.getAuthenticated();
    const tokenOwner = user.login;

    let isProcessing = false;

    // File paths for tracking processed IDs
    const PROCESSED_ISSUES_FILE = '.processed_issues.json';
    const PROCESSED_PRS_FILE = '.processed_prs.json';

    // Functions to manage processed issues
    async function getProcessedIssues() {
      try {
        const data = await fs.readFile(PROCESSED_ISSUES_FILE, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    }

    async function addProcessedIssue(issueId) {
      const processed = await getProcessedIssues();
      if (!processed.includes(issueId)) {
        processed.push(issueId);
        await fs.writeFile(PROCESSED_ISSUES_FILE, JSON.stringify(processed, null, 2));
      }
    }

    // Functions to manage processed pull requests
    async function getProcessedPRs() {
      try {
        const data = await fs.readFile(PROCESSED_PRS_FILE, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    }

    async function addProcessedPR(prId) {
      const processed = await getProcessedPRs();
      if (!processed.includes(prId)) {
        processed.push(prId);
        await fs.writeFile(PROCESSED_PRS_FILE, JSON.stringify(processed, null, 2));
      }
    }

    // Process an issue
    async function processIssue(item) {
      const issueId = item.number;
      const content = item.body || '';

      // Write issue content to Task.md
      await fs.writeFile('Task.md', content);

      // Run Claude in Docker
      const claudeCommand = `docker run --rm -v ${process.cwd()}:/workspace my-claude-image claude "Read the task in Task.md and accomplish it"`;
      await exec(claudeCommand);

      // Commit and push changes to a new branch
      const branchName = `claude-issue-${issueId}`;
      await exec(`git checkout main`);
      await exec(`git pull origin main`);
      await exec(`git checkout -b ${branchName}`);
      await exec(`git add .`);
      await exec(`git commit -m "Address issue #${issueId}"`);
      await exec(`git push origin ${branchName}`);

      // Create a pull request linking the issue
      await octokit.pulls.create({
        owner,
        repo,
        title: `Address issue #${issueId}`,
        head: branchName,
        base: 'main',
        body: `This PR addresses issue #${issueId}. Closes #${issueId}`,
      });

      // Switch back to main branch
      await exec(`git checkout main`);
    }

    // Process a pull request
    async function processPullRequest(item) {
      const prId = item.number;
      const baseBranch = item.base.ref;

      // Checkout to the target (base) branch
      await exec(`git fetch origin`);
      await exec(`git checkout ${baseBranch}`);

      // Get the diff for the pull request
      const { data: diff } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prId,
        mediaType: { format: 'diff' },
      });

      // Write PR details to Task.md
      const taskContent = `Pull Request #${prId}: ${item.title}\n\n${item.body}\n\nDiff:\n${diff}\n\nThis is a code review task. Please review the changes and put any comments in Review.md.`;
      await fs.writeFile('Task.md', taskContent);

      // Run Claude in Docker
      const claudeCommand = `docker run --rm -v ${process.cwd()}:/workspace my-claude-image claude "Read the task in Task.md and accomplish it"`;
      await exec(claudeCommand);

      // Read Review.md and add as a comment
      let reviewContent = '';
      try {
        reviewContent = await fs.readFile('Review.md', 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('Review.md not found, skipping comment');
        } else {
          throw error;
        }
      }
      if (reviewContent) {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: prId,
          body: reviewContent,
        });
      }

      // Switch back to main branch
      await exec(`git checkout main`);
    }

    // Check for events
    async function checkForEvents() {
      if (isProcessing) {
        console.log('Already processing, skipping');
        return;
      }
      isProcessing = true;
      try {
        console.log(`Checking for events at ${new Date().toISOString()}`);
        const response = await octokit.issues.listForRepo({
          owner,
          repo,
          state: 'open',
          labels: 'claude',
        });
        const items = response.data;
        const processedIssues = await getProcessedIssues();
        const processedPRs = await getProcessedPRs();

        for (const item of items) {
          // Only process events by the token owner
          if (item.user.login !== tokenOwner) continue;

          const id = item.number;
          if (item.pull_request) {
            // Process pull request
            if (!processedPRs.includes(id)) {
              await processPullRequest(item);
              await addProcessedPR(id);
            }
          } else {
            // Process issue
            if (!processedIssues.includes(id)) {
              await processIssue(item);
              await addProcessedIssue(id);
            }
          }
        }
      } catch (error) {
        console.error('Error checking events:', error.message);
      } finally {
        isProcessing = false;
      }
    }

    // Schedule checks every 5 minutes
    cron.schedule('*/5 * * * *', checkForEvents);

    console.log(
      `Started watching ${owner}/${repo} for 'claude' labeled issues and pull requests by ${tokenOwner}`
    );
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
