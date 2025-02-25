const { Octokit } = require('@octokit/rest');
const cron = require('node-cron');
const GitUrlParse = require('git-url-parse');
const { exec } = require('child_process');
const fs = require('fs').promises;

// Retrieve GitHub token from environment variable
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error('Error: GITHUB_TOKEN environment variable is not set');
  process.exit(1);
}

// Determine repository owner and name from git remote
exec('git remote -v', (error, stdout) => {
  if (error) {
    console.error('Error retrieving git remote:', error.message);
    process.exit(1);
  }
  const remoteLine = stdout.split('\n').find(line => line.includes('origin') && line.includes('fetch'));
  if (!remoteLine) {
    console.error('Error: Could not find origin remote');
    process.exit(1);
  }
  const url = remoteLine.split('\t')[1].split(' ')[0];
  const parsed = GitUrlParse(url);
  const owner = parsed.owner;
  const repo = parsed.name;

  // Initialize Octokit with authentication
  const octokit = new Octokit({ auth: githubToken });

  // Placeholder functions for processing
  function processIssue(issueId, issueContent) {
    console.log(`Processing issue #${issueId}: ${issueContent}`);
    // TODO: Implement issue processing logic here
  }

  function processPullRequest(prId, prContent) {
    console.log(`Processing pull request #${prId}: ${prContent}`);
    // TODO: Implement pull request processing logic here
  }

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
        return []; // File doesn't exist yet
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
        return []; // File doesn't exist yet
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

  // Function to check for issues and pull requests
  async function checkForEvents() {
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
        const id = item.number;
        const content = item.body || ''; // Use empty string if body is null
        if (item.pull_request) {
          // Item is a pull request
          if (!processedPRs.includes(id)) {
            processPullRequest(id, content);
            await addProcessedPR(id);
          }
        } else {
          // Item is an issue
          if (!processedIssues.includes(id)) {
            processIssue(id, content);
            await addProcessedIssue(id);
          }
        }
      }
    } catch (error) {
      console.error('Error checking events:', error.message);
    }
  }

  // Schedule checks every 5 minutes
  cron.schedule('*/5 * * * *', checkForEvents);

  console.log(`Started watching ${owner}/${repo} for 'claude' labeled issues and pull requests`);
});
