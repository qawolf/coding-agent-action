export type RunGit = (args: string[]) => Promise<string>;

export const botAuthor = {
  email: "41898282+github-actions[bot]@users.noreply.github.com",
  name: "github-actions[bot]",
};

export async function makeFixBranch(options: {
  branch: string;
  runGit: RunGit;
}): Promise<void> {
  const { branch, runGit } = options;
  await runGit(["switch", "-c", branch]);
  await runGit(["config", "user.name", botAuthor.name]);
  await runGit(["config", "user.email", botAuthor.email]);
}

export async function readHeadSha(
  runGit: RunGit,
): Promise<{ sha: string } | "unreadable"> {
  try {
    const sha = (await runGit(["rev-parse", "HEAD"])).trim();
    return /^[0-9a-f]{40,64}$/.test(sha) ? { sha } : "unreadable";
  } catch {
    return "unreadable";
  }
}
